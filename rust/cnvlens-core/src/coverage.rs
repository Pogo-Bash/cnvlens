//! Coverage-window computation + CNV result assembly (the `analyzeBam`
//! contract). Mirrors the reference `analyze_bam_coverage`.

use std::collections::{HashMap, HashSet};
use std::io;

use serde_json::{json, Value};

use crate::cnv;
use crate::model::{CoverageOptions, CoverageWindow};
use crate::stats;
use crate::{bam, reference_list};

pub fn analyze_coverage(bam_bytes: &[u8], _bai: Option<&[u8]>, opts: &CoverageOptions) -> Value {
    match analyze_coverage_inner(bam_bytes, _bai, opts) {
        Ok(v) => v,
        Err(e) => json!({ "error": e.to_string() }),
    }
}

fn analyze_coverage_inner(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &CoverageOptions,
) -> io::Result<Value> {
    let window_size = opts.window_size as i64;
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);

    // Chromosome filter.
    let chrom_filter: Option<HashSet<&str>> = if let Some(cs) = &opts.chromosomes {
        Some(cs.iter().map(|s| s.as_str()).collect())
    } else {
        opts.chromosome.as_deref().map(|c| {
            let mut s = HashSet::new();
            s.insert(c);
            s
        })
    };

    // Coverage slots in header order, filtered.
    struct Slot {
        name: String,
        counts: Vec<i64>,
    }
    let mut slots: Vec<Slot> = Vec::new();
    let mut name_to_slot: HashMap<String, usize> = HashMap::new();
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
        name_to_slot.insert(name.clone(), slot);
        refidx_to_slot.insert(ref_idx as i32, slot);
    }

    if slots.is_empty() {
        return Ok(json!({ "error": "No coverage data found" }));
    }

    // Full-scan count. total_reads counts every record (matching the reference,
    // which increments read_count before filtering).
    let total_reads = bam::for_each_core(bam_bytes, |ref_id, pos, flag| {
        if bam::is_filtered(flag) {
            return;
        }
        let slot = match refidx_to_slot.get(&ref_id) {
            Some(&s) => s,
            None => return,
        };
        let window_idx = pos / window_size;
        if window_idx >= 0 && (window_idx as usize) < slots[slot].counts.len() {
            slots[slot].counts[window_idx as usize] += 1;
        }
    })?;

    // Build windows in slot order.
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
        return Ok(json!({ "error": "No coverage data found" }));
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

    // GC correction + N-mask (only with a reference FASTA).
    let mut gc_corrected = false;
    if let Some(ref_seqs) = &opts.reference_seqs {
        if cnv::apply_gc_correction(&mut windows, ref_seqs, opts.window_size) {
            gc_corrected = true;
        }
        cnv::apply_n_mask(&mut windows, ref_seqs, 0.5);
    }

    // Segmentation method default.
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

    let cnvs: Vec<Value> = if opts.use_manual_thresholds {
        cnv::detect_cnvs_manual(
            &windows,
            opts.amp_threshold.unwrap_or(1.5),
            opts.del_threshold.unwrap_or(0.5),
            opts.min_windows.unwrap_or(3),
        )
    } else if seg_method == "cbs_lite" {
        cnv::detect_cnvs_cbs_lite(&windows, coverage_class, 3, 3.0)
    } else {
        cnv::detect_cnvs_adaptive(&windows, coverage_class)
    };

    // Warnings.
    let mut warnings: Vec<String> = Vec::new();
    if opts.reference_seqs.is_none() {
        warnings.push("No reference FASTA - GC correction skipped".to_string());
    }
    if bai.is_none() {
        warnings.push("No BAI index - full file scan performed".to_string());
    }
    warnings.push("Tumor-only calling - no normal reference panel used".to_string());
    warnings.push(format!("Detection method: {seg_method}"));

    let chromosomes: Vec<String> = slots.iter().map(|s| s.name.clone()).collect();

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

    Ok(json!({
        "total_reads": total_reads,
        "coverageData": windows,
        "cnvs": cnvs,
        "windowSize": opts.window_size,
        "chromosomes": chromosomes,
        "method": "rust-wasm",
        "coverage_stats": {
            "median": median_cov,
            "mean": mean_cov,
            "class": coverage_class,
        },
        "thresholds_used": thresholds_used,
        "gc_corrected": gc_corrected,
        "warnings": warnings,
    }))
}
