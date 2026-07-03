//! Coverage-window computation + CNV result assembly (the `analyzeBam`
//! contract). Mirrors the reference `analyze_bam_coverage`.
//!
//! Phase 4 factors the window computation out of the monolithic JSON builder
//! into [`compute_coverage`], which the streaming entry points
//! ([`coverage_windows`], [`analyze_coverage_region`], [`stream`]) share. The
//! legacy JSON [`analyze_coverage`] is retained (deprecated) for the CNVLens
//! UI and assembles the CNV/stats object on top of the computed windows.

use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

use crate::cnv;
use crate::error::CoreError;
use crate::model::{CoverageOptions, CoverageWindow, Region};
use crate::stats;
use crate::{bam, reference_list};

/// Computed coverage windows plus the summary statistics the CNV assembler and
/// the JSON wrapper need. This is the typed product of a coverage pass; the
/// `cnvs` array is derived from it separately.
pub struct CoverageData {
    pub windows: Vec<CoverageWindow>,
    pub total_reads: u64,
    pub median: f64,
    pub mean: f64,
    pub class: &'static str,
    pub seg_method: String,
    pub gc_corrected: bool,
    pub chromosomes: Vec<String>,
}

/// Coverage + CNV analysis, JSON-out. Retained for the CNVLens WASM shim/UI.
///
/// New native callers should use [`coverage_windows`] / [`stream`] /
/// [`analyze_coverage_region`], which return typed [`CoverageWindow`]s and a
/// typed [`CoreError`].
#[deprecated(
    since = "0.2.0",
    note = "use coverage_windows() / stream() / analyze_coverage_region() for typed, streamable results"
)]
pub fn analyze_coverage(bam_bytes: &[u8], bai: Option<&[u8]>, opts: &CoverageOptions) -> Value {
    match compute_coverage(bam_bytes, bai, opts, None) {
        Ok(data) => coverage_result_json(data, bai, opts),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// Streaming coverage: yields [`CoverageWindow`]s lazily. (The global median
/// normalization requires a full counting pass first, so windows are computed
/// up front and then streamed; the API shape matches `variants::stream`.)
pub fn stream(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &CoverageOptions,
) -> Result<impl Iterator<Item = CoverageWindow>, CoreError> {
    Ok(coverage_windows(bam_bytes, bai, opts)?.into_iter())
}

/// Full-file coverage windows (no CNV/stats wrapping).
pub fn coverage_windows(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &CoverageOptions,
) -> Result<Vec<CoverageWindow>, CoreError> {
    Ok(compute_coverage(bam_bytes, bai, opts, None)?.windows)
}

/// Region-restricted coverage windows via BAI seeking.
pub fn analyze_coverage_region(
    bam_bytes: &[u8],
    bai_bytes: &[u8],
    region: &Region,
    opts: &CoverageOptions,
) -> Result<Vec<CoverageWindow>, CoreError> {
    Ok(compute_coverage(bam_bytes, Some(bai_bytes), opts, Some(region))?.windows)
}

/// Region-restricted coverage windows, with the per-window READ COUNTING fanned
/// out across `shards` OS threads. The result is byte-identical to
/// [`analyze_coverage_region`]: only stage A (counting) is parallel; the global
/// reductions (median, GC fit, masking) and all downstream segmentation run
/// once over the assembled window array via [`finalize_coverage`].
///
/// ## Why this is correct (and race-free by construction)
/// - **Each read counted exactly once** — window-ownership. Shard `k` owns a
///   contiguous window range and counts a read only when `pos / window_size`
///   lands in that range. Adjacent shards' BAI queries overlap at block
///   boundaries, but a read returned by two shards is owned by exactly one, so
///   never double-counted; the two end shards' ownership is open-ended to absorb
///   reads that overhang the region edges (which the serial pass also counts).
/// - **No data race** — each shard accumulates into its OWN `HashMap` (private,
///   moved into the thread) and returns it by value. The merge is a plain
///   integer sum performed by the parent AFTER every thread has joined; there is
///   no shared mutable buffer and no concurrent write. Integer `+=` is
///   associative/commutative, so the merged counts do not depend on thread
///   finish order. (The borrow checker also rejects any `&mut` shared into a
///   scoped thread — this is enforced, not merely intended.)
pub fn compute_coverage_region_parallel(
    bam_bytes: &[u8],
    bai_bytes: &[u8],
    region: &Region,
    opts: &CoverageOptions,
    shards: usize,
) -> Result<Vec<CoverageWindow>, CoreError> {
    // Degenerate shard counts (and an unbounded region, where there is no window
    // span to split) fall straight back to the proven serial path.
    if shards <= 1 || region.start.is_none() || region.end.is_none() {
        return analyze_coverage_region(bam_bytes, bai_bytes, region, opts);
    }

    // WASM (this target) has no native OS threads: counting runs single-threaded.
    // Threading is a speed enhancement, never load-bearing — the depth-based CNV
    // path produces identical windows either way, so the fallback is transparent.
    // (Cross-origin-isolated Web Worker + SharedArrayBuffer threading is the
    // separate, JS-side enhancement; the engine is correct without it.)
    #[cfg(target_arch = "wasm32")]
    return analyze_coverage_region(bam_bytes, bai_bytes, region, opts);

    #[cfg(not(target_arch = "wasm32"))]
    {
    let window_size = opts.window_size as i64;
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);

    // A region pins exactly one chromosome; find its header index + length.
    let (chrom_refidx, chrom_len) = refs
        .iter()
        .enumerate()
        .find(|(_, (name, _))| name.as_str() == region.chrom.as_str())
        .map(|(idx, (_, len))| (idx as i32, *len as i64))
        .ok_or_else(|| {
            CoreError::InvalidRegion(format!("chromosome {:?} not in BAM header", region.chrom))
        })?;

    // Whole-chromosome window array — identical sizing to the serial path, so
    // window indices line up exactly.
    let num_windows = (chrom_len / window_size + 1) as usize;
    let r_start = region.start.unwrap();
    let r_end = region.end.unwrap();
    let r_lo_w = (r_start / window_size).clamp(0, num_windows as i64) as usize;
    let r_hi_w = ((r_end / window_size) + 1).clamp(0, num_windows as i64) as usize;
    let span = r_hi_w.saturating_sub(r_lo_w);
    if span == 0 {
        return analyze_coverage_region(bam_bytes, bai_bytes, region, opts);
    }

    // Never more shards than windows to split; tile [r_lo_w, r_hi_w) evenly.
    let n = shards.min(span);
    let bounds: Vec<usize> = (0..=n).map(|k| r_lo_w + span * k / n).collect();

    let counts: Vec<i64> = std::thread::scope(|scope| -> Result<Vec<i64>, CoreError> {
        let handles: Vec<_> = (0..n)
            .map(|k| {
                let w_lo = bounds[k];
                let w_hi = bounds[k + 1];
                // Ownership: end shards absorb reads overhanging the region edges
                // (the serial scan counts those too); interior shards own exactly
                // their tile. Disjoint ⇒ each read counted once.
                let own_lo = if k == 0 { 0 } else { w_lo };
                let own_hi = if k == n - 1 { num_windows } else { w_hi };
                // Query coords clamped to the ORIGINAL region, so no shard sees a
                // read the serial pass wouldn't (which queries exactly [r_start,
                // r_end]).
                let q_start = (w_lo as i64 * window_size).max(r_start);
                let q_end = (w_hi as i64 * window_size).min(r_end);
                let chrom = region.chrom.clone();
                scope.spawn(move || -> Result<HashMap<usize, i64>, CoreError> {
                    let mut local: HashMap<usize, i64> = HashMap::new();
                    if q_start >= q_end {
                        return Ok(local);
                    }
                    let sub = Region::with_bounds(chrom, Some(q_start), Some(q_end));
                    bam::for_each_region_core(bam_bytes, bai_bytes, &sub, |ref_id, pos, flag| {
                        if ref_id != chrom_refidx || bam::is_filtered(flag) {
                            return;
                        }
                        let w = pos / window_size;
                        if w < 0 {
                            return;
                        }
                        let w = w as usize;
                        if w < num_windows && w >= own_lo && w < own_hi {
                            *local.entry(w).or_insert(0) += 1;
                        }
                    })?;
                    Ok(local)
                })
            })
            .collect();

        // Merge: clean integer sum into a parent-local array, strictly AFTER each
        // thread has joined. No shared mutable state was touched concurrently.
        let mut counts = vec![0i64; num_windows];
        for h in handles {
            let local = h
                .join()
                .map_err(|_| CoreError::BamParse("coverage shard thread panicked".into()))??;
            for (w, c) in local {
                counts[w] += c;
            }
        }
        Ok(counts)
    })?;

    let total_reads = counts.iter().sum::<i64>() as u64;
    let slot = Slot {
        name: region.chrom.clone(),
        counts,
    };
    Ok(finalize_coverage(vec![slot], total_reads, opts, window_size)?.windows)
    }
}

/// One chromosome's raw per-window read counts. The unit of work shared by the
/// serial scan and the parallel (sharded) counter: both produce `Slot`s, then
/// hand them to [`finalize_coverage`] for the GLOBAL median/normalize/GC pass.
struct Slot {
    name: String,
    counts: Vec<i64>,
}

/// GLOBAL stage of coverage: turn raw per-window counts into normalized,
/// GC-corrected, N-masked [`CoverageWindow`]s plus summary stats. This must see
/// the complete window set (the median, the GC polynomial fit, and downstream
/// segmentation are all whole-region reductions) — so it is never sharded. It
/// is the single code path both [`compute_coverage`] and
/// [`compute_coverage_region_parallel`] funnel through, which is what makes the
/// parallel result byte-identical to the serial one: only the COUNTING differs.
fn finalize_coverage(
    slots: Vec<Slot>,
    total_reads: u64,
    opts: &CoverageOptions,
    window_size: i64,
) -> Result<CoverageData, CoreError> {
    let mut windows: Vec<CoverageWindow> = Vec::new();
    for slot in &slots {
        for (i, &depth) in slot.counts.iter().enumerate() {
            let i = i as i64;
            windows.push(CoverageWindow {
                chromosome: slot.name.clone(),
                start: i * window_size,
                end: (i + 1) * window_size,
                coverage: depth,
                normalized: 0.0,
                masked: None,
            });
        }
    }

    let nonzero: Vec<f64> = windows
        .iter()
        .filter(|w| w.coverage > 0)
        .map(|w| w.coverage as f64)
        .collect();
    if nonzero.is_empty() {
        return Err(CoreError::NoReadsInRegion("No coverage data found".to_string()));
    }

    let median_cov = stats::median(&nonzero);
    let mean_cov = stats::mean(&nonzero);
    let coverage_class = if median_cov < 15.0 {
        "low"
    } else if median_cov < 30.0 {
        "medium"
    } else {
        "high"
    };

    for w in windows.iter_mut() {
        w.normalized = if median_cov > 0.0 {
            w.coverage as f64 / median_cov
        } else {
            0.0
        };
    }

    let mut gc_corrected = false;
    if let Some(ref_seqs) = &opts.reference_seqs {
        if cnv::apply_gc_correction(&mut windows, ref_seqs, opts.window_size) {
            gc_corrected = true;
        }
        cnv::apply_n_mask(&mut windows, ref_seqs, 0.5);
    }

    let seg_method: String = match &opts.segmentation_method {
        Some(m) => m.clone(),
        None => {
            if opts.reference_seqs.is_some() {
                "cbs_lite".to_string()
            } else {
                "threshold".to_string()
            }
        }
    };

    let chromosomes: Vec<String> = slots.iter().map(|s| s.name.clone()).collect();

    Ok(CoverageData {
        windows,
        total_reads,
        median: median_cov,
        mean: mean_cov,
        class: coverage_class,
        seg_method,
        gc_corrected,
        chromosomes,
    })
}

/// Core coverage computation: bin reads into windows, normalize by the median,
/// apply GC correction + N-masking if a reference FASTA is present. When
/// `region` is set and a BAI is available, only the overlapping BGZF blocks are
/// scanned (otherwise a full sequential scan, optionally chromosome-filtered).
pub fn compute_coverage(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &CoverageOptions,
    region: Option<&Region>,
) -> Result<CoverageData, CoreError> {
    let window_size = opts.window_size as i64;
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);

    // Chromosome filter: an explicit region pins to one chromosome; otherwise
    // honor the options' chromosome list.
    let chrom_filter: Option<HashSet<&str>> = if let Some(r) = region {
        let mut s = HashSet::new();
        s.insert(r.chrom.as_str());
        Some(s)
    } else if let Some(cs) = &opts.chromosomes {
        Some(cs.iter().map(|s| s.as_str()).collect())
    } else {
        opts.chromosome.as_deref().map(|c| {
            let mut s = HashSet::new();
            s.insert(c);
            s
        })
    };

    let mut slots: Vec<Slot> = Vec::new();
    let mut refidx_to_slot: HashMap<i32, usize> = HashMap::new();

    for (ref_idx, (name, len)) in refs.iter().enumerate() {
        if let Some(filter) = &chrom_filter {
            if !filter.contains(name.as_str()) {
                continue;
            }
        }
        let num_windows = (*len as i64 / window_size) + 1;
        let slot = slots.len();
        slots.push(Slot {
            name: name.clone(),
            counts: vec![0; num_windows as usize],
        });
        refidx_to_slot.insert(ref_idx as i32, slot);
    }

    if slots.is_empty() {
        if let Some(r) = region {
            return Err(CoreError::InvalidRegion(format!(
                "chromosome {:?} not in BAM header",
                r.chrom
            )));
        }
        return Err(CoreError::NoReadsInRegion("No coverage data found".to_string()));
    }

    // Count reads into windows. Region + BAI ⇒ seeked scan; otherwise full scan.
    let count_into = |ref_id: i32, pos: i64, flag: u16, slots: &mut [Slot]| {
        if bam::is_filtered(flag) {
            return;
        }
        if let Some(&slot) = refidx_to_slot.get(&ref_id) {
            let window_idx = pos / window_size;
            if window_idx >= 0 && (window_idx as usize) < slots[slot].counts.len() {
                slots[slot].counts[window_idx as usize] += 1;
            }
        }
    };

    let total_reads = match (region, bai) {
        (Some(r), Some(bai_bytes)) => {
            bam::for_each_region_core(bam_bytes, bai_bytes, r, |ref_id, pos, flag| {
                count_into(ref_id, pos, flag, &mut slots)
            })?
        }
        _ => bam::for_each_core(bam_bytes, |ref_id, pos, flag| {
            count_into(ref_id, pos, flag, &mut slots)
        })?,
    };

    finalize_coverage(slots, total_reads, opts, window_size)
}

/// Assemble the legacy CNV/stats JSON object from computed coverage data,
/// preserving the exact shape the CNVLens UI expects.
fn coverage_result_json(data: CoverageData, bai: Option<&[u8]>, opts: &CoverageOptions) -> Value {
    let CoverageData {
        windows,
        total_reads,
        median,
        mean,
        class,
        seg_method,
        gc_corrected,
        chromosomes,
    } = data;

    let cnvs: Vec<Value> = if opts.use_manual_thresholds {
        cnv::detect_cnvs_manual(
            &windows,
            opts.amp_threshold.unwrap_or(1.5),
            opts.del_threshold.unwrap_or(0.5),
            opts.min_windows.unwrap_or(3),
        )
    } else if seg_method == "cbs_lite" {
        cnv::detect_cnvs_cbs_lite(&windows, class, 3, 3.0)
    } else {
        cnv::detect_cnvs_adaptive(&windows, class)
    };

    let mut warnings: Vec<String> = Vec::new();
    if opts.reference_seqs.is_none() {
        warnings.push("No reference FASTA - GC correction skipped".to_string());
    }
    if bai.is_none() {
        warnings.push("No BAI index - full file scan performed".to_string());
    }
    warnings.push("Tumor-only calling - no normal reference panel used".to_string());
    warnings.push(format!("Detection method: {seg_method}"));

    let thresholds_used = if opts.use_manual_thresholds {
        json!({
            "mode": "manual",
            "amp_threshold": opts.amp_threshold,
            "del_threshold": opts.del_threshold,
            "min_windows": opts.min_windows,
        })
    } else {
        json!({
            "mode": seg_method,
            "amp_threshold": Value::Null,
            "del_threshold": Value::Null,
            "min_windows": Value::Null,
        })
    };

    json!({
        "total_reads": total_reads,
        "coverageData": windows,
        "cnvs": cnvs,
        "windowSize": opts.window_size,
        "chromosomes": chromosomes,
        "method": "rust-wasm",
        "coverage_stats": {
            "median": median,
            "mean": mean,
            "class": class,
        },
        "thresholds_used": thresholds_used,
        "gc_corrected": gc_corrected,
        "warnings": warnings,
    })
}
