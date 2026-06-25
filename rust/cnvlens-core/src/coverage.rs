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

    struct Slot {
        name: String,
        counts: Vec<i64>,
    }
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
