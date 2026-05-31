//! CNV detection: GC correction, N-mask, threshold/adaptive/CBS-lite
//! segmentation, and confidence scoring. Mirrors the reference pipeline.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::model::CoverageWindow;
use crate::stats;

/// Degree-2 GC correction in log-space. Returns true when the correction was
/// actually applied (matching the reference's "skipped" guards). Mutates
/// `normalized` in place.
pub fn apply_gc_correction(
    windows: &mut [CoverageWindow],
    reference_seqs: &HashMap<String, String>,
    window_size: u32,
) -> bool {
    let win = window_size as f64;
    let mut gc_fractions: Vec<f64> = Vec::new();
    let mut valid_indices: Vec<usize> = Vec::new();

    for (i, w) in windows.iter().enumerate() {
        let seq = match reference_seqs.get(&w.chromosome) {
            Some(s) => s.as_bytes(),
            None => continue,
        };
        let start = w.start as usize;
        let end = (w.end as usize).min(seq.len());
        if end <= start {
            continue;
        }
        let mut gc_count = 0usize;
        let mut n_count = 0usize;
        for &b in &seq[start..end] {
            match b.to_ascii_uppercase() {
                b'G' | b'C' => gc_count += 1,
                b'N' => n_count += 1,
                _ => {}
            }
        }
        let total = (end - start) - n_count;
        if (total as f64) < win * 0.5 {
            continue;
        }
        let gc_frac = gc_count as f64 / total as f64;
        gc_fractions.push(gc_frac);
        valid_indices.push(i);
    }

    if gc_fractions.len() < 10 {
        return false;
    }

    // Fit only over windows with normalized coverage > 0 (log-space).
    let mut fit_gc: Vec<f64> = Vec::new();
    let mut fit_logcov: Vec<f64> = Vec::new();
    for (j, &idx) in valid_indices.iter().enumerate() {
        let cov = windows[idx].normalized;
        if cov > 0.0 {
            fit_gc.push(gc_fractions[j]);
            fit_logcov.push(cov.ln());
        }
    }
    if fit_gc.len() < 10 {
        return false;
    }

    let coeffs = stats::polyfit2(&fit_gc, &fit_logcov);

    for (j, &idx) in valid_indices.iter().enumerate() {
        let log_pred = stats::polyval(&coeffs, gc_fractions[j]);
        let predicted = log_pred.exp();
        if predicted > 0.1 {
            windows[idx].normalized /= predicted;
        }
    }

    true
}

/// Mask windows whose reference is mostly Ns (assembly gaps).
pub fn apply_n_mask(
    windows: &mut [CoverageWindow],
    reference_seqs: &HashMap<String, String>,
    n_threshold: f64,
) {
    for w in windows.iter_mut() {
        let seq = match reference_seqs.get(&w.chromosome) {
            Some(s) => s.as_bytes(),
            None => continue,
        };
        let start = w.start as usize;
        let end = (w.end as usize).min(seq.len());
        if end <= start {
            continue;
        }
        let span = end - start;
        let n_count = seq[start..end]
            .iter()
            .filter(|&&b| b.to_ascii_uppercase() == b'N')
            .count();
        let n_frac = n_count as f64 / span as f64;
        if n_frac > n_threshold {
            w.masked = Some(true);
            w.normalized = 0.0;
        }
    }
}

// ── Threshold-based detection (manual + adaptive share the run-merge loop) ──

struct Region<'a> {
    chromosome: String,
    start: i64,
    end: i64,
    kind: &'static str,
    windows: Vec<&'a CoverageWindow>,
}

fn is_masked(w: &CoverageWindow) -> bool {
    w.masked == Some(true)
}

/// Manual CNV detection with user thresholds.
pub fn detect_cnvs_manual(
    windows: &[CoverageWindow],
    amp_threshold: f64,
    del_threshold: f64,
    min_windows: usize,
) -> Vec<Value> {
    detect_threshold(windows, amp_threshold, del_threshold, min_windows, true, "")
}

/// Adaptive CNV detection: thresholds chosen from coverage class.
pub fn detect_cnvs_adaptive(windows: &[CoverageWindow], coverage_class: &str) -> Vec<Value> {
    let (amp, del, min_windows) = match coverage_class {
        "low" => (2.0, 0.3, 5),
        "medium" => (1.5, 0.5, 3),
        _ => (1.3, 0.7, 2),
    };
    detect_threshold(windows, amp, del, min_windows, false, coverage_class)
}

fn detect_threshold(
    windows: &[CoverageWindow],
    amp_threshold: f64,
    del_threshold: f64,
    min_windows: usize,
    manual: bool,
    coverage_class: &str,
) -> Vec<Value> {
    let mut cnvs: Vec<Value> = Vec::new();
    let mut current: Option<Region> = None;

    let flush = |cnvs: &mut Vec<Value>, region: &Region| {
        if region.windows.len() >= min_windows {
            cnvs.push(if manual {
                summarize_manual(region)
            } else {
                summarize(region, coverage_class, None)
            });
        }
    };

    for w in windows {
        if is_masked(w) {
            continue;
        }
        let norm = w.normalized;
        let is_amp = norm >= amp_threshold;
        let is_del = norm <= del_threshold && norm > 0.0;

        if is_amp || is_del {
            let kind = if is_amp { "amplification" } else { "deletion" };
            let extend = matches!(&current, Some(c) if c.kind == kind && c.chromosome == w.chromosome);
            if extend {
                let c = current.as_mut().unwrap();
                c.end = w.end;
                c.windows.push(w);
            } else {
                if let Some(c) = &current {
                    flush(&mut cnvs, c);
                }
                current = Some(Region {
                    chromosome: w.chromosome.clone(),
                    start: w.start,
                    end: w.end,
                    kind,
                    windows: vec![w],
                });
            }
        } else {
            if let Some(c) = &current {
                flush(&mut cnvs, c);
            }
            current = None;
        }
    }
    if let Some(c) = &current {
        flush(&mut cnvs, c);
    }
    cnvs
}

// ── CBS-lite recursive binary segmentation ──

pub fn detect_cnvs_cbs_lite(
    windows: &[CoverageWindow],
    coverage_class: &str,
    min_segment_windows: usize,
    t_threshold: f64,
) -> Vec<Value> {
    // Group windows by chromosome in encounter order.
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<&CoverageWindow>> = HashMap::new();
    for w in windows {
        if is_masked(w) || w.normalized <= 0.0 {
            continue;
        }
        groups
            .entry(w.chromosome.clone())
            .or_insert_with(|| {
                order.push(w.chromosome.clone());
                Vec::new()
            })
            .push(w);
    }

    let mut cnvs: Vec<Value> = Vec::new();
    for chrom in &order {
        let chrom_wins = &groups[chrom];
        if chrom_wins.len() < min_segment_windows * 2 {
            continue;
        }
        let norm_values: Vec<f64> = chrom_wins.iter().map(|w| w.normalized).collect();
        let mut segments: Vec<(usize, usize, f64, f64)> = Vec::new();
        segment_recursive(
            &norm_values,
            0,
            norm_values.len(),
            t_threshold,
            min_segment_windows,
            &mut segments,
        );

        for (seg_start, seg_end, seg_mean, seg_t) in segments {
            let kind = if seg_mean > 1.3 {
                "amplification"
            } else if seg_mean < 0.7 {
                "deletion"
            } else {
                continue;
            };
            let seg_windows: Vec<&CoverageWindow> = chrom_wins[seg_start..seg_end].to_vec();
            let region = Region {
                chromosome: chrom.clone(),
                start: seg_windows[0].start,
                end: seg_windows[seg_windows.len() - 1].end,
                kind,
                windows: seg_windows,
            };
            cnvs.push(summarize(&region, coverage_class, Some(seg_t)));
        }
    }
    cnvs
}

fn segment_recursive(
    values: &[f64],
    start: usize,
    end: usize,
    t_threshold: f64,
    min_size: usize,
    out: &mut Vec<(usize, usize, f64, f64)>,
) {
    let length = end - start;
    if length < min_size * 2 {
        let mean_val = stats::mean(&values[start..end]);
        out.push((start, end, mean_val, 0.0));
        return;
    }

    let segment = &values[start..end];
    let n = segment.len();

    // Cumulative sums of x and x^2.
    let mut cumsum = vec![0.0f64; n];
    let mut cumsum2 = vec![0.0f64; n];
    let mut acc = 0.0;
    let mut acc2 = 0.0;
    for (i, &v) in segment.iter().enumerate() {
        acc += v;
        acc2 += v * v;
        cumsum[i] = acc;
        cumsum2[i] = acc2;
    }

    let mut best_t = 0.0;
    let mut best_pos: i64 = -1;

    for i in min_size..(n - min_size) {
        let n_left = i as f64;
        let n_right = (n - i) as f64;
        let sum_left = cumsum[i - 1];
        let sum_right = cumsum[n - 1] - cumsum[i - 1];
        let mean_left = sum_left / n_left;
        let mean_right = sum_right / n_right;
        let sum2_left = cumsum2[i - 1];
        let sum2_right = cumsum2[n - 1] - cumsum2[i - 1];
        let mut var_left = sum2_left / n_left - mean_left * mean_left;
        let mut var_right = sum2_right / n_right - mean_right * mean_right;
        var_left = var_left.max(1e-10);
        var_right = var_right.max(1e-10);
        let se = (var_left / n_left + var_right / n_right).sqrt();
        if se > 0.0 {
            let t_stat = (mean_left - mean_right).abs() / se;
            if t_stat > best_t {
                best_t = t_stat;
                best_pos = i as i64;
            }
        }
    }

    if best_t > t_threshold && best_pos > 0 {
        let split = start + best_pos as usize;
        segment_recursive(values, start, split, t_threshold, min_size, out);
        segment_recursive(values, split, end, t_threshold, min_size, out);
    } else {
        let mean_val = stats::mean(&values[start..end]);
        out.push((start, end, mean_val, best_t));
    }
}

// ── Summaries ──

fn summarize_manual(region: &Region) -> Value {
    let coverages: Vec<f64> = region.windows.iter().map(|w| w.coverage as f64).collect();
    let normalized: Vec<f64> = region.windows.iter().map(|w| w.normalized).collect();
    let avg_norm = stats::mean(&normalized);
    let std_norm = stats::std(&normalized);
    let n = region.windows.len();

    let confidence = if n >= 7 && std_norm < 0.3 {
        "high"
    } else if n >= 3 && std_norm < 0.5 {
        "medium"
    } else {
        "low"
    };

    json!({
        "chromosome": region.chromosome,
        "start": region.start,
        "end": region.end,
        "length": region.end - region.start,
        "type": region.kind,
        "copyNumber": avg_norm,
        "avgCoverage": stats::mean(&coverages),
        "confidence": confidence,
        "num_windows": n,
    })
}

fn summarize(region: &Region, coverage_class: &str, t_stat: Option<f64>) -> Value {
    let coverages: Vec<f64> = region.windows.iter().map(|w| w.coverage as f64).collect();
    let normalized: Vec<f64> = region.windows.iter().map(|w| w.normalized).collect();
    let avg_norm = stats::mean(&normalized);
    let std_norm = stats::std(&normalized);
    let n = region.windows.len();

    let confidence = match t_stat {
        Some(t) => {
            let abs_t = t.abs();
            if abs_t > 5.0 && n >= 5 {
                "high"
            } else if abs_t > 3.0 && n >= 3 {
                "medium"
            } else {
                "low"
            }
        }
        None => match coverage_class {
            "low" => {
                if n >= 10 && std_norm < 0.3 {
                    "high"
                } else if n >= 5 && std_norm < 0.5 {
                    "medium"
                } else {
                    "low"
                }
            }
            "medium" => {
                if n >= 7 && std_norm < 0.3 {
                    "high"
                } else if n >= 3 && std_norm < 0.5 {
                    "medium"
                } else {
                    "low"
                }
            }
            _ => {
                if n >= 5 && std_norm < 0.4 {
                    "high"
                } else if n >= 2 && std_norm < 0.6 {
                    "medium"
                } else {
                    "low"
                }
            }
        },
    };

    json!({
        "chromosome": region.chromosome,
        "start": region.start,
        "end": region.end,
        "length": region.end - region.start,
        "type": region.kind,
        "avgCoverage": stats::mean(&coverages),
        "copyNumber": avg_norm * 2.0,
        "confidence": confidence,
        "num_windows": n,
        "t_statistic": t_stat,
    })
}
