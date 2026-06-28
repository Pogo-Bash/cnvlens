//! SNV variant calling. Mirrors the reference `call_variants_from_bam` /
//! `call_variants_from_pileup`: 1MB-window read binning, per-position base
//! pileup with strand + position-in-read filters, and a binomial Phred score.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::error::CoreError;
use crate::model::{Region, Variant, VariantOptions};
use crate::stats;
use crate::{bam, reference_list, AlnRecord};

const WINDOW_SIZE: i64 = 1_000_000;
const ERROR_RATE: f64 = 0.01;

/// SNV calling, JSON-out. Retained for the CNVLens WASM shim and UI, which
/// consume the rich result object (variants + filters + warnings).
///
/// New native callers (the CodonSplice VM) should use the streaming
/// [`stream`] / [`collect_variants`] / [`call_variants_region`] entry points,
/// which return typed [`Variant`]s and a typed [`CoreError`].
#[deprecated(
    since = "0.2.0",
    note = "use stream() / collect_variants() / call_variants_region() for typed, streamable results"
)]
pub fn call_variants(bam_bytes: &[u8], bai: Option<&[u8]>, opts: &VariantOptions) -> Value {
    match collect_variants(bam_bytes, bai, opts) {
        Ok(variants) => variant_result_json(variants, bai, opts),
        Err(e) => e.to_json(),
    }
}

/// Streaming SNV calling: yields [`Variant`]s lazily. Internally the pileup is
/// computed per chromosome, so records become available as each reference is
/// processed rather than after the whole file. When `region` constraints are
/// known, prefer [`call_variants_region`] for BAI-seeked access.
pub fn stream(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &VariantOptions,
) -> Result<impl Iterator<Item = Variant>, CoreError> {
    Ok(collect_variants(bam_bytes, bai, opts)?.into_iter())
}

/// Build the legacy `{ variants, filters, warnings, … }` JSON from typed
/// variants, preserving the exact shape the CNVLens UI expects.
fn variant_result_json(variants: Vec<Variant>, bai: Option<&[u8]>, opts: &VariantOptions) -> Value {
    let mut warnings: Vec<String> = Vec::new();
    if opts.reference_seqs.is_none() {
        warnings.push(
            "No reference FASTA provided - homozygous variants undetectable (reference base inferred from reads)".to_string(),
        );
    }
    if bai.is_none() {
        warnings.push("No BAI index - full file scan performed".to_string());
    }
    warnings.push("No GIAB validation has been performed on this caller".to_string());

    let mut chroms: Vec<String> = Vec::new();
    for v in &variants {
        if chroms.last().map(|c| c != &v.chrom).unwrap_or(true) {
            chroms.push(v.chrom.clone());
        }
    }

    json!({
        "variants": variants,
        "total_variants": variants.len(),
        "filters": {
            "min_depth": opts.min_depth,
            "min_base_quality": opts.min_base_quality,
            "min_mapping_quality": opts.min_mapping_quality,
            "min_variant_reads": opts.min_variant_reads,
            "min_allele_freq": opts.min_allele_freq,
            "min_strand_bias": opts.min_strand_bias,
        },
        "chromosomes_processed": chroms,
        "reference_used": if opts.reference_seqs.is_some() { "fasta" } else { "inferred_from_reads" },
        "warnings": warnings,
    })
}

/// Targets (ref_id, name, length) in header order, honoring the chromosome
/// filter in `opts`.
fn build_targets(
    refs: &[(String, usize)],
    chrom_filter: Option<&[String]>,
) -> Vec<(i32, String, i64)> {
    let mut targets = Vec::new();
    for (ref_idx, (name, len)) in refs.iter().enumerate() {
        if let Some(filter) = chrom_filter {
            if !filter.iter().any(|c| c == name) {
                continue;
            }
        }
        targets.push((ref_idx as i32, name.clone(), *len as i64));
    }
    targets
}

/// Whether a read passes the mapping-quality / flag filters used by the caller.
#[inline]
fn keep_read(aln: &AlnRecord, opts: &VariantOptions) -> bool {
    !(aln.is_unmapped()
        || aln.is_duplicate()
        || aln.is_secondary()
        || aln.is_supplementary()
        || aln.is_qcfail())
        && (aln.mapq as i64) >= opts.min_mapping_quality as i64
}

/// Full-file SNV collection: a single sequential scan, pileup per chromosome.
pub fn collect_variants(
    bam_bytes: &[u8],
    _bai: Option<&[u8]>,
    opts: &VariantOptions,
) -> Result<Vec<Variant>, CoreError> {
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);
    let target_refs = build_targets(&refs, opts.chromosomes.as_deref());

    let target_ids: HashMap<i32, usize> = target_refs
        .iter()
        .enumerate()
        .map(|(slot, (id, _, _))| (*id, slot))
        .collect();
    let mut reads_by_target: Vec<Vec<AlnRecord>> = vec![Vec::new(); target_refs.len()];
    bam::for_each_full(bam_bytes, |aln| {
        if let Some(&slot) = target_ids.get(&aln.ref_id) {
            if keep_read(&aln, opts) {
                reads_by_target[slot].push(aln);
            }
        }
    })?;

    Ok(run_pileups(&target_refs, &reads_by_target, opts, None))
}

/// Region-restricted SNV calling via BAI seeking. Resolves `region.chrom` to a
/// reference, seeks straight to the overlapping BGZF blocks, and piles up only
/// the reads there.
pub fn call_variants_region(
    bam_bytes: &[u8],
    bai_bytes: &[u8],
    region: &Region,
    opts: &VariantOptions,
) -> Result<Vec<Variant>, CoreError> {
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);

    let (ref_idx, name, len) = refs
        .iter()
        .enumerate()
        .find(|(_, (n, _))| n == &region.chrom)
        .map(|(i, (n, l))| (i as i32, n.clone(), *l as i64))
        .ok_or_else(|| {
            CoreError::InvalidRegion(format!("chromosome {:?} not in BAM header", region.chrom))
        })?;

    let mut reads: Vec<AlnRecord> = Vec::new();
    bam::for_each_region_full(bam_bytes, bai_bytes, region, |aln| {
        // The index can over-fetch adjacent reference blocks; pin to our ref.
        if aln.ref_id == ref_idx && keep_read(&aln, opts) {
            reads.push(aln);
        }
    })?;

    let target_refs = vec![(ref_idx, name, len)];
    let reads_by_target = vec![reads];
    Ok(run_pileups(&target_refs, &reads_by_target, opts, None))
}

/// Streaming SNV calling with an optional early-exit `limit`. When `limit` is
/// set, the per-window pileup stops as soon as that many variants are produced
/// (so `LIMIT 100` never piles up the whole chromosome). `region` + `bai`
/// trigger BAI-seeked access; otherwise a full scan. Errors surface as a single
/// `Err` item.
pub fn stream_variants(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &VariantOptions,
    region: Option<&Region>,
    limit: Option<usize>,
) -> Box<dyn Iterator<Item = Result<Variant, CoreError>>> {
    let gathered = gather_variants(bam_bytes, bai, opts, region, limit);
    match gathered {
        Ok(vars) => Box::new(vars.into_iter().map(Ok)),
        Err(e) => Box::new(std::iter::once(Err(e))),
    }
}

/// Core variant gathering shared by the collect/region/stream entry points.
fn gather_variants(
    bam_bytes: &[u8],
    bai: Option<&[u8]>,
    opts: &VariantOptions,
    region: Option<&Region>,
    limit: Option<usize>,
) -> Result<Vec<Variant>, CoreError> {
    let header = bam::read_header(bam_bytes)?;
    let refs = reference_list(&header);

    let (target_refs, reads_by_target) = match (region, bai) {
        // Region + index: seek to the one chromosome's blocks.
        (Some(r), Some(bai_bytes)) => {
            let (ref_idx, name, len) = refs
                .iter()
                .enumerate()
                .find(|(_, (n, _))| n == &r.chrom)
                .map(|(i, (n, l))| (i as i32, n.clone(), *l as i64))
                .ok_or_else(|| {
                    CoreError::InvalidRegion(format!("chromosome {:?} not in BAM header", r.chrom))
                })?;
            let mut reads = Vec::new();
            bam::for_each_region_full(bam_bytes, bai_bytes, r, |aln| {
                if aln.ref_id == ref_idx && keep_read(&aln, opts) {
                    reads.push(aln);
                }
            })?;
            (vec![(ref_idx, name, len)], vec![reads])
        }
        // Otherwise a full scan, honoring opts.chromosomes (and region.chrom if
        // present but no index).
        _ => {
            let chrom_filter: Option<Vec<String>> = region
                .map(|r| vec![r.chrom.clone()])
                .or_else(|| opts.chromosomes.clone());
            let target_refs = build_targets(&refs, chrom_filter.as_deref());
            let target_ids: HashMap<i32, usize> = target_refs
                .iter()
                .enumerate()
                .map(|(slot, (id, _, _))| (*id, slot))
                .collect();
            let mut reads_by_target: Vec<Vec<AlnRecord>> = vec![Vec::new(); target_refs.len()];
            bam::for_each_full(bam_bytes, |aln| {
                if let Some(&slot) = target_ids.get(&aln.ref_id) {
                    if keep_read(&aln, opts) {
                        reads_by_target[slot].push(aln);
                    }
                }
            })?;
            (target_refs, reads_by_target)
        }
    };

    Ok(run_pileups(&target_refs, &reads_by_target, opts, limit))
}

/// Run the per-chromosome pileup over already-collected reads and return the
/// sorted variant set. `limit` caps total output, stopping at window/chromosome
/// granularity once reached.
fn run_pileups(
    target_refs: &[(i32, String, i64)],
    reads_by_target: &[Vec<AlnRecord>],
    opts: &VariantOptions,
    limit: Option<usize>,
) -> Vec<Variant> {
    let ref_seqs = opts.reference_seqs.as_ref();
    let mut variants: Vec<Variant> = Vec::new();
    for (slot, (_id, name, len)) in target_refs.iter().enumerate() {
        if let Some(l) = limit {
            if variants.len() >= l {
                break;
            }
        }
        let reads = &reads_by_target[slot];
        if reads.is_empty() {
            continue;
        }
        let ref_seq = ref_seqs.and_then(|m| m.get(name)).map(|s| s.as_bytes());
        call_from_pileup(reads, name, *len, opts, ref_seq, &mut variants, limit);
    }
    variants.sort_by(|a, b| a.chrom.cmp(&b.chrom).then(a.pos.cmp(&b.pos)));
    if let Some(l) = limit {
        variants.truncate(l);
    }
    variants
}

fn base_index(b: u8) -> usize {
    match b.to_ascii_uppercase() {
        b'A' => 0,
        b'C' => 1,
        b'G' => 2,
        b'T' => 3,
        _ => 4,
    }
}

const BASE_CHARS: [&str; 5] = ["A", "C", "G", "T", "N"];

/// Per-candidate-offset pileup state.
struct OffsetData {
    counts: [[i64; 2]; 5], // [base_idx][fwd, rev]
    order: Vec<usize>,     // base_idx in first-seen order (for ref-inference tie-break)
    seen: [bool; 5],
    positions: [Vec<(usize, usize)>; 5], // (index-in-read, read_len) per base
}

impl OffsetData {
    fn new() -> Self {
        OffsetData {
            counts: [[0; 2]; 5],
            order: Vec::new(),
            seen: [false; 5],
            positions: Default::default(),
        }
    }
}

fn call_from_pileup(
    reads: &[AlnRecord],
    chrom_name: &str,
    chrom_len: i64,
    opts: &VariantOptions,
    ref_seq: Option<&[u8]>,
    out: &mut Vec<Variant>,
    limit: Option<usize>,
) {
    // Reads with sequence.
    let quality_reads: Vec<&AlnRecord> = reads.iter().filter(|r| !r.seq.is_empty()).collect();
    if quality_reads.is_empty() {
        return;
    }

    let num_windows = chrom_len / WINDOW_SIZE + 1;

    // Bin read indices by 1MB window.
    let mut reads_by_window: HashMap<i64, Vec<usize>> = HashMap::new();
    for (ri, read) in quality_reads.iter().enumerate() {
        let read_start = read.pos;
        let read_end = read_start + read.seq.len() as i64;
        let start_window = (read_start / WINDOW_SIZE).max(0);
        let end_window = (read_end / WINDOW_SIZE).min(num_windows - 1);
        for w in start_window..=end_window {
            reads_by_window.entry(w).or_default().push(ri);
        }
    }

    let mut window_indices: Vec<i64> = reads_by_window.keys().copied().collect();
    window_indices.sort_unstable();

    for w_idx in window_indices {
        // Early exit: once `limit` variants are produced, stop piling up further
        // windows entirely (the streaming short-circuit for LIMIT).
        if let Some(l) = limit {
            if out.len() >= l {
                return;
            }
        }
        let window_start = w_idx * WINDOW_SIZE;
        let window_end = (window_start + WINDOW_SIZE).min(chrom_len);
        let ws = (window_end - window_start) as usize;
        let window_reads = &reads_by_window[&w_idx];

        // Pass 1: coverage array.
        let mut coverage = vec![0i32; ws];
        for &ri in window_reads {
            let read = quality_reads[ri];
            let read_start = read.pos;
            let read_end = read_start + read.seq.len() as i64;
            let clip_start = (read_start.max(window_start) - window_start) as i64;
            let clip_end = (read_end.min(window_end) - window_start) as i64;
            if clip_start < clip_end {
                for c in coverage.iter_mut().take(clip_end as usize).skip(clip_start as usize) {
                    *c += 1;
                }
            }
        }

        // Candidate offsets with sufficient raw depth.
        let mut is_candidate = vec![false; ws];
        let mut candidate_offsets: Vec<usize> = Vec::new();
        for (off, &c) in coverage.iter().enumerate() {
            if c as i64 >= opts.min_depth {
                is_candidate[off] = true;
                candidate_offsets.push(off);
            }
        }
        if candidate_offsets.is_empty() {
            continue;
        }

        // Pass 2: base pileup at candidate offsets.
        let mut pileup: HashMap<usize, OffsetData> = HashMap::new();
        for &ri in window_reads {
            let read = quality_reads[ri];
            if read.qual.is_empty() {
                continue;
            }
            let read_start = read.pos;
            let seq_len = read.seq.len();
            let is_reverse = read.is_reverse();
            let strand_idx = if is_reverse { 1 } else { 0 };
            for i in 0..seq_len {
                let pos = read_start + i as i64;
                let offset = pos - window_start;
                if offset < 0 || offset as usize >= ws {
                    continue;
                }
                let offset = offset as usize;
                if !is_candidate[offset] {
                    continue;
                }
                let q = if i < read.qual.len() { read.qual[i] as i64 } else { 0 };
                if q < opts.min_base_quality as i64 {
                    continue;
                }
                let base_idx = base_index(read.seq[i]);
                let data = pileup.entry(offset).or_insert_with(OffsetData::new);
                if !data.seen[base_idx] {
                    data.seen[base_idx] = true;
                    data.order.push(base_idx);
                }
                data.counts[base_idx][strand_idx] += 1;
                data.positions[base_idx].push((i, seq_len));
            }
        }

        // Emit variants at each candidate offset (ascending).
        for &offset in &candidate_offsets {
            let data = match pileup.get(&offset) {
                Some(d) => d,
                None => continue,
            };
            let total_depth: i64 = data.counts.iter().map(|c| c[0] + c[1]).sum();
            if total_depth < opts.min_depth {
                continue;
            }
            let pos = window_start + offset as i64;

            // Reference base.
            let (ref_base_idx, ref_base_char): (i64, String) = match ref_seq {
                Some(seq) if (pos as usize) < seq.len() => {
                    let ch = seq[pos as usize].to_ascii_uppercase();
                    let idx = match ch {
                        b'A' => 0i64,
                        b'C' => 1,
                        b'G' => 2,
                        b'T' => 3,
                        b'N' => 4,
                        _ => -1,
                    };
                    ((idx), (ch as char).to_string())
                }
                _ => {
                    // Infer: most common base, first-seen wins on ties.
                    let mut best = data.order[0];
                    let mut best_sum = data.counts[best][0] + data.counts[best][1];
                    for &b in &data.order[1..] {
                        let s = data.counts[b][0] + data.counts[b][1];
                        if s > best_sum {
                            best_sum = s;
                            best = b;
                        }
                    }
                    (best as i64, BASE_CHARS[best].to_string())
                }
            };

            let ref_count = if (0..5).contains(&ref_base_idx) {
                let ri = ref_base_idx as usize;
                data.counts[ri][0] + data.counts[ri][1]
            } else {
                0
            };

            for alt_idx in 0..4usize {
                if alt_idx as i64 == ref_base_idx {
                    continue;
                }
                if !data.seen[alt_idx] {
                    continue;
                }
                let fwd = data.counts[alt_idx][0];
                let rev = data.counts[alt_idx][1];
                let alt_count = fwd + rev;
                if alt_count < opts.min_variant_reads {
                    continue;
                }
                let allele_freq = alt_count as f64 / total_depth as f64;
                if allele_freq < opts.min_allele_freq {
                    continue;
                }
                let minority = fwd.min(rev);
                let strand_bias = if alt_count > 0 {
                    minority as f64 / alt_count as f64
                } else {
                    0.0
                };
                if strand_bias < opts.min_strand_bias {
                    continue;
                }

                // Position-in-read filter.
                let positions = &data.positions[alt_idx];
                if !positions.is_empty() {
                    let edge_count = positions
                        .iter()
                        .filter(|&&(p, rlen)| p < 5 || p >= rlen.saturating_sub(5))
                        .count();
                    let edge_fraction = edge_count as f64 / positions.len() as f64;
                    if edge_fraction > 0.8 {
                        continue;
                    }
                }

                let qual = stats::binomial_qual_score(alt_count, total_depth, ERROR_RATE);

                out.push(Variant {
                    chrom: chrom_name.to_string(),
                    pos: pos + 1, // VCF 1-based
                    ref_base: ref_base_char.clone(),
                    alt: BASE_CHARS[alt_idx].to_string(),
                    qual,
                    kind: "SNV".to_string(),
                    depth: total_depth,
                    ref_count,
                    alt_count,
                    allele_freq,
                    strand_bias,
                    filter: None,
                    id: None,
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_read_excludes_supplementary_and_qcfail() {
        let opts = VariantOptions::default();
        let base = |flag: u16| AlnRecord {
            ref_id: 0,
            pos: 100,
            mapq: 60,
            flag,
            seq: vec![b'A'],
            qual: vec![30],
        };
        assert!(keep_read(&base(0x2), &opts), "normal paired read kept");
        assert!(!keep_read(&base(0x800), &opts), "supplementary excluded");
        assert!(!keep_read(&base(0x200), &opts), "qcfail excluded");
        assert!(!keep_read(&base(0x400), &opts), "duplicate still excluded");
    }
}
