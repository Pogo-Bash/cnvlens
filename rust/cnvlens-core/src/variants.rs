//! SNV variant calling. Mirrors the reference `call_variants_from_bam` /
//! `call_variants_from_pileup`: 1MB-window read binning, per-position base
//! pileup with strand + position-in-read filters, and a binomial Phred score.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::error::CoreError;
use crate::model::{Region, Variant, VariantOptions};
use crate::stats;
use crate::{bam, reference_list, AlnRecord, CigarOp};

const WINDOW_SIZE: i64 = 1_000_000;
const ERROR_RATE: f64 = 0.01;

/// An indel event surfaced by walking a CIGAR string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CigarEvent {
    Ins(Vec<u8>),
    Del(usize),
}

/// One span emitted by the full CIGAR walk. Either an aligned run of bases
/// (`M`/`=`/`X`) that maps consecutive read indices to consecutive reference
/// positions, or an indel event. This is the single source of cursor truth: the
/// indel-only [`walk_cigar`] and the pileup both consume the SAME walk, so their
/// ref/read arithmetic can never diverge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CigarSpan {
    /// `len` read bases at indices `read_idx..read_idx+len` align to reference
    /// positions `ref0..ref0+len` (0-based).
    Aligned {
        ref0: i64,
        read_idx: usize,
        len: usize,
    },
    /// An indel anchored on the last reference base consumed before it.
    Indel { anchor: i64, event: CigarEvent },
}

/// Pure dual-cursor CIGAR walk yielding every span (aligned runs + indels) in
/// CIGAR order. `Match/=/X` become [`CigarSpan::Aligned`]; `I`/`D` become
/// [`CigarSpan::Indel`]; `N/S/H/P` advance the cursors per spec without emitting.
pub fn walk_cigar_full(
    read_pos: i64,
    cigar: &[(CigarOp, usize)],
    seq: &[u8],
) -> Vec<CigarSpan> {
    let mut spans = Vec::new();
    let mut ref_cur: i64 = read_pos; // 0-based reference position
    let mut read_cur: usize = 0; // index into seq

    for &(op, len) in cigar {
        match op {
            CigarOp::Match | CigarOp::SeqMatch | CigarOp::SeqMismatch => {
                spans.push(CigarSpan::Aligned {
                    ref0: ref_cur,
                    read_idx: read_cur,
                    len,
                });
                ref_cur += len as i64;
                read_cur += len;
            }
            CigarOp::Ins => {
                // Anchor on the last ref base consumed BEFORE this op (VCF 4.2).
                let anchor = ref_cur - 1;
                // Guard: a truncated/malformed read may claim more inserted bytes
                // than `seq` holds. Skip the op (don't panic) and stop walking,
                // since the read cursor can no longer be trusted.
                if read_cur + len > seq.len() {
                    break;
                }
                // Read the inserted bytes BEFORE advancing the read cursor.
                let payload = seq[read_cur..read_cur + len].to_vec();
                read_cur += len;
                if anchor >= read_pos {
                    spans.push(CigarSpan::Indel {
                        anchor,
                        event: CigarEvent::Ins(payload),
                    });
                }
            }
            CigarOp::Del => {
                let anchor = ref_cur - 1;
                ref_cur += len as i64;
                if anchor >= read_pos {
                    spans.push(CigarSpan::Indel {
                        anchor,
                        event: CigarEvent::Del(len),
                    });
                }
            }
            CigarOp::Skip => {
                ref_cur += len as i64;
            }
            CigarOp::SoftClip => {
                read_cur += len;
            }
            CigarOp::HardClip | CigarOp::Pad => {
                // Consume neither reference nor read.
            }
        }
    }

    spans
}

/// Pure dual-cursor CIGAR walk. Returns (anchor_0based_ref_pos, event) for each
/// indel. Thin filter over [`walk_cigar_full`] so the indel anchors are computed
/// by the exact same cursor logic the pileup uses.
pub fn walk_cigar(read_pos: i64, cigar: &[(CigarOp, usize)], seq: &[u8]) -> Vec<(i64, CigarEvent)> {
    walk_cigar_full(read_pos, cigar, seq)
        .into_iter()
        .filter_map(|s| match s {
            CigarSpan::Indel { anchor, event } => Some((anchor, event)),
            CigarSpan::Aligned { .. } => None,
        })
        .collect()
}

/// Build VCF 4.2 anchor-prefixed REF/ALT alleles from a [`CigarEvent`] and the
/// chromosome reference sequence. `anchor0` is the 0-based index of the anchor
/// base (the last reference base consumed before the indel, per `walk_cigar`).
///
/// Per design §3 / D5:
/// - `Ins(ins)`: REF = anchor base `b`; ALT = `b` + `ins`; kind = "INS".
/// - `Del(n)`: REF = `ref_seq[anchor0..=anchor0+n]` (anchor + n deleted bases);
///   ALT = `b`; kind = "DEL".
///
/// Returns `None` when the required reference bytes are out of bounds.
pub fn build_indel_alleles(
    ref_seq: &[u8],
    anchor0: usize,
    ev: &CigarEvent,
) -> Option<(String, String, &'static str)> {
    if anchor0 >= ref_seq.len() {
        return None;
    }
    let b = ref_seq[anchor0].to_ascii_uppercase();
    match ev {
        CigarEvent::Ins(ins) => {
            let mut alt = Vec::with_capacity(1 + ins.len());
            alt.push(b);
            alt.extend(ins.iter().map(|c| c.to_ascii_uppercase()));
            let ref_str = String::from(b as char);
            let alt = String::from_utf8(alt).ok()?;
            Some((ref_str, alt, "INS"))
        }
        CigarEvent::Del(n) => {
            let end = anchor0 + n;
            if end >= ref_seq.len() {
                return None;
            }
            let ref_str: String = ref_seq[anchor0..=end]
                .iter()
                .map(|c| c.to_ascii_uppercase() as char)
                .collect();
            let alt = String::from(b as char);
            Some((ref_str, alt, "DEL"))
        }
    }
}

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
            "No reference FASTA provided - homozygous variants undetectable (reference base inferred from reads); indels not called (REF/anchor bases require a reference)".to_string(),
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
    // Indel support anchored AT this offset (anchor = last ref base before the
    // indel). Keyed by inserted bytes / deleted length; [fwd, rev] by strand.
    insertions: HashMap<Vec<u8>, [i64; 2]>,
    deletions: HashMap<usize, [i64; 2]>,
}

impl OffsetData {
    fn new() -> Self {
        OffsetData {
            counts: [[0; 2]; 5],
            order: Vec::new(),
            seen: [false; 5],
            positions: Default::default(),
            insertions: HashMap::new(),
            deletions: HashMap::new(),
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

        // Pass 2: CIGAR-aware base + indel pileup at candidate offsets. A single
        // dual-cursor walk (`walk_cigar_full`) drives BOTH the SNV accumulators
        // (per-base on aligned M/=/X runs, at the CORRECT ref position) and the
        // new indel accumulators — no second, hand-rolled cursor.
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

            // Reads decoded without a CIGAR fall back to a single pure-M run,
            // which reproduces the previous ungapped behaviour exactly.
            let fallback;
            let cigar: &[(CigarOp, usize)] = if read.cigar.is_empty() {
                fallback = [(CigarOp::Match, seq_len)];
                &fallback
            } else {
                &read.cigar
            };

            for span in walk_cigar_full(read_start, cigar, &read.seq) {
                match span {
                    CigarSpan::Aligned { ref0, read_idx, len } => {
                        for k in 0..len {
                            let pos = ref0 + k as i64;
                            let offset = pos - window_start;
                            if offset < 0 || offset as usize >= ws {
                                continue;
                            }
                            let offset = offset as usize;
                            if !is_candidate[offset] {
                                continue;
                            }
                            let i = read_idx + k;
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
                    CigarSpan::Indel { anchor, event } => {
                        let offset = anchor - window_start;
                        if offset < 0 || offset as usize >= ws {
                            continue;
                        }
                        let offset = offset as usize;
                        if !is_candidate[offset] {
                            continue;
                        }
                        let data = pileup.entry(offset).or_insert_with(OffsetData::new);
                        match event {
                            CigarEvent::Ins(payload) => {
                                data.insertions.entry(payload).or_insert([0, 0])[strand_idx] += 1;
                            }
                            CigarEvent::Del(n) => {
                                data.deletions.entry(n).or_insert([0, 0])[strand_idx] += 1;
                            }
                        }
                    }
                }
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

            // Indel emission. Both REF and (for insertions) the anchor base come
            // from the reference, so indels are only callable with a FASTA; the
            // missing-FASTA case is surfaced as a warning, not a panic.
            if let Some(rseq) = ref_seq {
                let anchor0 = pos as usize;

                // Insertions (deterministic order for stable output).
                let mut ins_keys: Vec<Vec<u8>> = data.insertions.keys().cloned().collect();
                ins_keys.sort();
                for key in ins_keys {
                    let [fwd, rev] = data.insertions[&key];
                    let alt_count = fwd + rev;
                    if alt_count < opts.min_variant_reads {
                        continue;
                    }
                    let allele_freq = alt_count as f64 / total_depth as f64;
                    if allele_freq < opts.min_allele_freq {
                        continue;
                    }
                    let ev = CigarEvent::Ins(key.clone());
                    if let Some((ref_str, alt_str, kind)) =
                        build_indel_alleles(rseq, anchor0, &ev)
                    {
                        let minority = fwd.min(rev);
                        let strand_bias = if alt_count > 0 {
                            minority as f64 / alt_count as f64
                        } else {
                            0.0
                        };
                        let qual =
                            stats::binomial_qual_score(alt_count, total_depth, ERROR_RATE);
                        out.push(Variant {
                            chrom: chrom_name.to_string(),
                            pos: pos + 1, // VCF 1-based, anchor+1 (matches SNV)
                            ref_base: ref_str,
                            alt: alt_str,
                            qual,
                            kind: kind.to_string(),
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

                // Deletions.
                let mut del_keys: Vec<usize> = data.deletions.keys().copied().collect();
                del_keys.sort_unstable();
                for n in del_keys {
                    let [fwd, rev] = data.deletions[&n];
                    let alt_count = fwd + rev;
                    if alt_count < opts.min_variant_reads {
                        continue;
                    }
                    let allele_freq = alt_count as f64 / total_depth as f64;
                    if allele_freq < opts.min_allele_freq {
                        continue;
                    }
                    let ev = CigarEvent::Del(n);
                    if let Some((ref_str, alt_str, kind)) =
                        build_indel_alleles(rseq, anchor0, &ev)
                    {
                        let minority = fwd.min(rev);
                        let strand_bias = if alt_count > 0 {
                            minority as f64 / alt_count as f64
                        } else {
                            0.0
                        };
                        let qual =
                            stats::binomial_qual_score(alt_count, total_depth, ERROR_RATE);
                        out.push(Variant {
                            chrom: chrom_name.to_string(),
                            pos: pos + 1, // VCF 1-based, anchor+1 (matches SNV)
                            ref_base: ref_str,
                            alt: alt_str,
                            qual,
                            kind: kind.to_string(),
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
            cigar: vec![],
        };
        assert!(keep_read(&base(0x2), &opts), "normal paired read kept");
        assert!(!keep_read(&base(0x800), &opts), "supplementary excluded");
        assert!(!keep_read(&base(0x200), &opts), "qcfail excluded");
        assert!(!keep_read(&base(0x400), &opts), "duplicate still excluded");
    }

    #[test]
    fn walk_cigar_simple_insertion() {
        let seq = b"AAAACCGGGG";
        let cig = vec![(CigarOp::Match, 4), (CigarOp::Ins, 2), (CigarOp::Match, 4)];
        assert_eq!(
            walk_cigar(100, &cig, seq),
            vec![(103, CigarEvent::Ins(b"CC".to_vec()))]
        ); // 100+4-1
    }

    #[test]
    fn walk_cigar_simple_deletion() {
        let seq = b"AAAAAAAACCCCCCCCC"; // 8M + 9M read bases (D consumes ref only)
        let cig = vec![(CigarOp::Match, 8), (CigarOp::Del, 3), (CigarOp::Match, 9)];
        assert_eq!(
            walk_cigar(200, &cig, seq),
            vec![(207, CigarEvent::Del(3))]
        ); // 200+8-1
    }

    #[test]
    fn walk_cigar_leading_softclip_then_insertion() {
        let mut seq = vec![b'N'; 5];
        seq.extend_from_slice(&[b'A'; 20]);
        seq.push(b'T');
        seq.extend_from_slice(&[b'A'; 4]);
        let cig = vec![
            (CigarOp::SoftClip, 5),
            (CigarOp::Match, 20),
            (CigarOp::Ins, 1),
            (CigarOp::Match, 4),
        ];
        // softclip consumes read only (not ref); ref starts at read_pos; ins anchor = read_pos+20-1
        assert_eq!(
            walk_cigar(300, &cig, &seq),
            vec![(319, CigarEvent::Ins(b"T".to_vec()))]
        );
    }

    #[test]
    fn walk_cigar_skip_and_seqmatch_mismatch_no_indels() {
        let seq = b"AAAAACCCCC";
        let cig = vec![
            (CigarOp::SeqMatch, 5),
            (CigarOp::Skip, 10),
            (CigarOp::SeqMismatch, 5),
        ];
        assert_eq!(walk_cigar(0, &cig, seq), vec![]); // must not panic / mis-index
    }

    #[test]
    fn walk_cigar_drops_leading_indel() {
        let seq: Vec<u8> = std::iter::repeat(b'A').take(12).collect();
        let cig = vec![(CigarOp::Ins, 2), (CigarOp::Match, 10)]; // insertion as first op: anchor would be read_pos-1 < read_pos
        assert_eq!(walk_cigar(50, &cig, &seq), vec![]);
    }

    #[test]
    fn walk_cigar_multiple_indels_one_read() {
        // 4M 1I 4M 1D 6M : ins at 0+4-1=3 ; del at (4+1ins? no—ins doesn't move ref) so after 4M+4M ref=read_pos+8, del anchor=read_pos+8-1
        let seq = b"AAAATGGGGCCCCCC"; // 4 +1ins +4 +6 = 15 read bases
        let cig = vec![
            (CigarOp::Match, 4),
            (CigarOp::Ins, 1),
            (CigarOp::Match, 4),
            (CigarOp::Del, 1),
            (CigarOp::Match, 6),
        ];
        assert_eq!(
            walk_cigar(0, &cig, seq),
            vec![
                (3, CigarEvent::Ins(b"T".to_vec())),
                (7, CigarEvent::Del(1))
            ]
        );
    }

    #[test]
    fn alleles_insertion() {
        let r = b"ACTGACTG"; // anchor0=0 -> b='A'
        assert_eq!(build_indel_alleles(r, 0, &CigarEvent::Ins(b"CC".to_vec())), Some(("A".into(),"ACC".into(),"INS")));
    }
    #[test]
    fn alleles_deletion() {
        let r = b"GATTACA"; // anchor0=0 b='G', del 1 -> REF=r[0..=1]="GA", ALT="G"
        assert_eq!(build_indel_alleles(r, 0, &CigarEvent::Del(1)), Some(("GA".into(),"G".into(),"DEL")));
    }
    #[test]
    fn alleles_deletion_multibase() {
        let r = b"GAACT"; // anchor0=0 b='G', del 2 -> REF=r[0..=2]="GAA", ALT="G"
        assert_eq!(build_indel_alleles(r, 0, &CigarEvent::Del(2)), Some(("GAA".into(),"G".into(),"DEL")));
    }
    #[test]
    fn alleles_out_of_bounds_is_none() {
        let r = b"AC";
        assert_eq!(build_indel_alleles(r, 1, &CigarEvent::Del(5)), None); // 1+5 >= len
        assert_eq!(build_indel_alleles(r, 9, &CigarEvent::Ins(b"X".to_vec())), None); // anchor oob
    }
    #[test]
    fn alleles_uppercases() {
        let r = b"gattaca";
        assert_eq!(build_indel_alleles(r, 0, &CigarEvent::Ins(b"cc".to_vec())), Some(("G".into(),"GCC".into(),"INS")));
    }

    #[test]
    fn walk_cigar_trailing_clip_and_hardclip() {
        let seq = b"AAAAACCC"; // 5M then 3S (hardclip consumes nothing, not in seq)
        let cig = vec![
            (CigarOp::HardClip, 2),
            (CigarOp::Match, 5),
            (CigarOp::SoftClip, 3),
        ];
        assert_eq!(walk_cigar(10, &cig, seq), vec![]); // no indels, must handle H at start
    }

    // ── 1.4 walk_cigar hardening (review fold-ins) ──

    #[test]
    fn walk_cigar_pad_op_no_indel() {
        // Pad (P) consumes neither ref nor read; must not mis-index or emit events.
        let seq = b"AAAAACCCCC"; // 5M P 5M
        let cig = vec![
            (CigarOp::Match, 5),
            (CigarOp::Pad, 3),
            (CigarOp::Match, 5),
        ];
        assert_eq!(walk_cigar(40, &cig, seq), vec![]);
    }

    #[test]
    fn walk_cigar_trailing_insertion() {
        // Insertion as the LAST op, perfectly in range: must be captured.
        let seq = b"AAAATT"; // 4M 2I
        let cig = vec![(CigarOp::Match, 4), (CigarOp::Ins, 2)];
        assert_eq!(
            walk_cigar(0, &cig, seq),
            vec![(3, CigarEvent::Ins(b"TT".to_vec()))]
        );
    }

    #[test]
    fn walk_cigar_insertion_out_of_range_does_not_panic() {
        // CIGAR claims a longer insertion than seq holds: guard, don't panic.
        let seq = b"AAAATT"; // 6 bytes, but cigar wants 4M then 5I
        let cig = vec![(CigarOp::Match, 4), (CigarOp::Ins, 5)];
        assert_eq!(walk_cigar(0, &cig, seq), vec![]); // skipped, no panic
    }

    // ── 1.4 pileup integration: build synthetic reads, run the pileup ──

    fn aln(pos: i64, cigar: Vec<(CigarOp, usize)>, seq: &[u8], reverse: bool) -> AlnRecord {
        AlnRecord {
            ref_id: 0,
            pos,
            mapq: 60,
            flag: if reverse { 0x10 } else { 0x0 },
            seq: seq.to_vec(),
            qual: vec![30; seq.len()],
            cigar,
        }
    }

    fn ref_all_a(len: usize) -> Vec<u8> {
        vec![b'A'; len]
    }

    #[test]
    fn pileup_snv_ungapped_regression() {
        // 12 pure-M reads of length 20 starting at 100. Reference all 'A'.
        // 4 reads carry a 'C' at read index 10 (ref pos 110), split 2 fwd / 2 rev.
        let opts = VariantOptions::default();
        let rseq = ref_all_a(1000);
        let mut reads: Vec<AlnRecord> = Vec::new();
        for k in 0..12usize {
            let mut s = vec![b'A'; 20];
            let reverse = k % 2 == 1;
            if k < 4 {
                s[10] = b'C'; // alt at the middle (avoid edge filter)
            }
            reads.push(aln(100, vec![(CigarOp::Match, 20)], &s, reverse));
        }
        let mut out = Vec::new();
        call_from_pileup(&reads, "chr1", 1000, &opts, Some(&rseq), &mut out, None);

        // Exactly one SNV, A->C at 1-based pos 111, depth 12, ref 8, alt 4.
        assert_eq!(out.len(), 1, "exactly one variant expected: {out:?}");
        let v = &out[0];
        assert_eq!(v.kind, "SNV");
        assert_eq!(v.pos, 111);
        assert_eq!(v.ref_base, "A");
        assert_eq!(v.alt, "C");
        assert_eq!(v.depth, 12);
        assert_eq!(v.ref_count, 8);
        assert_eq!(v.alt_count, 4);
        assert!((v.allele_freq - 4.0 / 12.0).abs() < 1e-9);
        assert!(v.qual.is_finite() && v.qual >= 0.0);
    }

    #[test]
    fn pileup_emits_deletion() {
        // 12 reads of 8M3D9M at pos 100. Deleted ref region = positions 108,109,110.
        // anchor (0-based) = 100+8-1 = 107.  REF = ref[107..=110], ALT = ref[107].
        let opts = VariantOptions::default();
        let mut rseq = ref_all_a(1000);
        rseq[107] = b'G';
        rseq[109] = b'T';
        rseq[110] = b'C'; // REF spelled "GATC" (108 stays 'A')
        // seq: 7 'A' + 'G' (matches ref 100..=107), then 9 'A' (matches ref 111..=119)
        let mut s = vec![b'A'; 7];
        s.push(b'G');
        s.extend_from_slice(&[b'A'; 9]); // total 17 read bases
        let cig = vec![(CigarOp::Match, 8), (CigarOp::Del, 3), (CigarOp::Match, 9)];
        let mut reads = Vec::new();
        for k in 0..12usize {
            reads.push(aln(100, cig.clone(), &s, k % 2 == 1));
        }
        let mut out = Vec::new();
        call_from_pileup(&reads, "chr1", 1000, &opts, Some(&rseq), &mut out, None);

        // No spurious SNVs (the old ungapped loop would mis-place bases 109/110).
        assert_eq!(
            out.iter().filter(|v| v.kind == "SNV").count(),
            0,
            "ungapped SNV bug must be fixed: {out:?}"
        );
        let dels: Vec<&Variant> = out.iter().filter(|v| v.kind == "DEL").collect();
        assert_eq!(dels.len(), 1, "exactly one DEL expected: {out:?}");
        let v = dels[0];
        assert_eq!(v.pos, 108); // anchor 107 (0-based) + 1
        assert_eq!(v.ref_base, "GATC");
        assert_eq!(v.alt, "G");
        assert_eq!(v.depth, 12);
        assert_eq!(v.alt_count, 12);
        assert!((v.allele_freq - 1.0).abs() < 1e-9);
    }

    #[test]
    fn pileup_emits_insertion() {
        // 12 reads of 4M2I4M at pos 100. anchor (0-based) = 100+4-1 = 103.
        let opts = VariantOptions::default();
        let mut rseq = ref_all_a(1000);
        rseq[103] = b'C'; // anchor base
        // seq: 3 'A' + 'C' (ref 100..=103), 2 inserted 'T', 4 'A' (ref 104..=107)
        let mut s = vec![b'A'; 3];
        s.push(b'C');
        s.extend_from_slice(b"TT");
        s.extend_from_slice(&[b'A'; 4]); // total 10 read bases
        let cig = vec![(CigarOp::Match, 4), (CigarOp::Ins, 2), (CigarOp::Match, 4)];
        let mut reads = Vec::new();
        for k in 0..12usize {
            reads.push(aln(100, cig.clone(), &s, k % 2 == 1));
        }
        let mut out = Vec::new();
        call_from_pileup(&reads, "chr1", 1000, &opts, Some(&rseq), &mut out, None);

        assert_eq!(
            out.iter().filter(|v| v.kind == "SNV").count(),
            0,
            "no spurious SNVs: {out:?}"
        );
        let ins: Vec<&Variant> = out.iter().filter(|v| v.kind == "INS").collect();
        assert_eq!(ins.len(), 1, "exactly one INS expected: {out:?}");
        let v = ins[0];
        assert_eq!(v.pos, 104); // anchor 103 + 1
        assert_eq!(v.ref_base, "C");
        assert_eq!(v.alt, "CTT");
        assert_eq!(v.depth, 12);
        assert_eq!(v.alt_count, 12);
    }

    #[test]
    fn pileup_deletion_needs_reference() {
        // Same deletion reads, but no reference: must NOT emit a DEL and must not panic.
        let opts = VariantOptions::default();
        let mut s = vec![b'A'; 7];
        s.push(b'G');
        s.extend_from_slice(&[b'A'; 9]);
        let cig = vec![(CigarOp::Match, 8), (CigarOp::Del, 3), (CigarOp::Match, 9)];
        let mut reads = Vec::new();
        for k in 0..12usize {
            reads.push(aln(100, cig.clone(), &s, k % 2 == 1));
        }
        let mut out = Vec::new();
        call_from_pileup(&reads, "chr1", 1000, &opts, None, &mut out, None);
        assert_eq!(
            out.iter().filter(|v| v.kind == "DEL").count(),
            0,
            "no DEL without reference: {out:?}"
        );
    }
}
