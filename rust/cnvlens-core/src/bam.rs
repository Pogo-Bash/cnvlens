//! BAM reading via noodles. Produces lightweight [`AlnRecord`]s for the rest
//! of the pipeline so downstream code is decoupled from noodles' API.

use std::io;

use noodles::bam;
use noodles::bam::bai;
use noodles::core::region::Interval;
use noodles::core::{Position, Region as NoodlesRegion};
use noodles::sam::alignment::record::Flags;
use noodles::sam::Header;

use crate::model::Region;
use crate::{AlnRecord, CigarOp};

/// Decode the minimal fields needed for coverage from a noodles record:
/// (ref_id, 0-based pos, flag bits). Avoids decoding sequence/quality.
fn decode_core(record: &bam::Record) -> io::Result<(i32, i64, u16)> {
    let ref_id = match record.reference_sequence_id() {
        Some(Ok(id)) => id as i32,
        Some(Err(e)) => return Err(e),
        None => -1,
    };
    let pos = match record.alignment_start() {
        Some(Ok(p)) => usize::from(p) as i64 - 1, // noodles is 1-based; BAM core is 0-based
        Some(Err(e)) => return Err(e),
        None => -1,
    };
    let flag = u16::from(record.flags());
    Ok((ref_id, pos, flag))
}

/// Decode a full [`AlnRecord`] including sequence (as ASCII bases) and quality.
fn decode_full(record: &bam::Record) -> io::Result<AlnRecord> {
    let (ref_id, pos, flag) = decode_core(record)?;

    let mapq = record.mapping_quality().map(|m| m.get()).unwrap_or(0);

    let sequence = record.sequence();
    let seq: Vec<u8> = sequence.iter().collect();

    let quality_scores = record.quality_scores();
    let qual: Vec<u8> = quality_scores.as_ref().to_vec();

    let cigar = decode_cigar(record)?;

    Ok(AlnRecord {
        ref_id,
        pos,
        mapq,
        flag,
        seq,
        qual,
        cigar,
    })
}

/// Decode a record's CIGAR into a local `(CigarOp, len)` vector, translating
/// noodles' `Kind` to our `CigarOp` so downstream code stays noodles-free.
fn decode_cigar(record: &bam::Record) -> io::Result<Vec<(CigarOp, usize)>> {
    use noodles::sam::alignment::record::cigar::op::Kind;

    let cigar = record.cigar();
    let mut ops = Vec::new();
    for op in cigar.iter() {
        let op = op?;
        let kind = match op.kind() {
            Kind::Match => CigarOp::Match,
            Kind::Insertion => CigarOp::Ins,
            Kind::Deletion => CigarOp::Del,
            Kind::Skip => CigarOp::Skip,
            Kind::SoftClip => CigarOp::SoftClip,
            Kind::HardClip => CigarOp::HardClip,
            Kind::Pad => CigarOp::Pad,
            Kind::SequenceMatch => CigarOp::SeqMatch,
            Kind::SequenceMismatch => CigarOp::SeqMismatch,
        };
        ops.push((kind, op.len()));
    }
    Ok(ops)
}

/// Read the header from an in-memory BAM byte slice.
pub fn read_header(bam_bytes: &[u8]) -> io::Result<Header> {
    let mut reader = bam::io::Reader::new(io::Cursor::new(bam_bytes));
    reader.read_header()
}

/// Full-scan iteration: invoke `f` for every record's core fields, in file
/// order. `f` receives (ref_id, 0-based pos, flag).
pub fn for_each_core<F>(bam_bytes: &[u8], mut f: F) -> io::Result<u64>
where
    F: FnMut(i32, i64, u16),
{
    let mut reader = bam::io::Reader::new(io::Cursor::new(bam_bytes));
    let _header = reader.read_header()?;
    let mut record = bam::Record::default();
    let mut count = 0u64;
    while reader.read_record(&mut record)? != 0 {
        let (ref_id, pos, flag) = decode_core(&record)?;
        f(ref_id, pos, flag);
        count += 1;
    }
    Ok(count)
}

/// Full-scan iteration yielding full records (sequence + quality decoded).
pub fn for_each_full<F>(bam_bytes: &[u8], mut f: F) -> io::Result<u64>
where
    F: FnMut(AlnRecord),
{
    let mut reader = bam::io::Reader::new(io::Cursor::new(bam_bytes));
    let _header = reader.read_header()?;
    let mut record = bam::Record::default();
    let mut count = 0u64;
    while reader.read_record(&mut record)? != 0 {
        f(decode_full(&record)?);
        count += 1;
    }
    Ok(count)
}

// ── BAI / CSI random access ──────────────────────────────────────────────────

/// Read a BAI index from in-memory bytes.
pub fn read_bai_index(bai_bytes: &[u8]) -> io::Result<bai::Index> {
    let mut reader = bai::io::Reader::new(io::Cursor::new(bai_bytes));
    reader.read_index()
}

/// Build a noodles [`Region`](NoodlesRegion) from our [`Region`]. The interval
/// is a coarse seek hint — over-fetching is harmless because callers re-filter
/// each record against the exact predicate — so unbounded sides collapse to a
/// full-reference scan of the named chromosome.
fn build_noodles_region(region: &Region) -> NoodlesRegion {
    let to_pos = |v: i64| Position::try_from((v.max(1)) as usize).unwrap_or(Position::MIN);
    let interval: Interval = match (region.start, region.end) {
        (Some(s), Some(e)) => (to_pos(s)..=to_pos(e)).into(),
        (Some(s), None) => (to_pos(s)..).into(),
        (None, Some(e)) => (..=to_pos(e)).into(),
        (None, None) => Interval::from(..),
    };
    NoodlesRegion::new(region.chrom.as_str(), interval)
}

/// Region-restricted core-field scan via BAI. Seeks straight to the BGZF blocks
/// that overlap `region` instead of scanning from byte 0; returns the number of
/// records visited (so callers/tests can prove the index was actually used).
pub fn for_each_region_core<F>(
    bam_bytes: &[u8],
    bai_bytes: &[u8],
    region: &Region,
    mut f: F,
) -> io::Result<u64>
where
    F: FnMut(i32, i64, u16),
{
    let mut reader = bam::io::Reader::new(io::Cursor::new(bam_bytes));
    let header = reader.read_header()?;
    let index = read_bai_index(bai_bytes)?;
    let noodles_region = build_noodles_region(region);
    let mut query = reader.query(&header, &index, &noodles_region)?;
    let mut record = bam::Record::default();
    let mut count = 0u64;
    while query.read_record(&mut record)? != 0 {
        let (ref_id, pos, flag) = decode_core(&record)?;
        f(ref_id, pos, flag);
        count += 1;
    }
    Ok(count)
}

/// Region-restricted full scan via BAI (sequence + quality decoded).
pub fn for_each_region_full<F>(
    bam_bytes: &[u8],
    bai_bytes: &[u8],
    region: &Region,
    mut f: F,
) -> io::Result<u64>
where
    F: FnMut(AlnRecord),
{
    let mut reader = bam::io::Reader::new(io::Cursor::new(bam_bytes));
    let header = reader.read_header()?;
    let index = read_bai_index(bai_bytes)?;
    let noodles_region = build_noodles_region(region);
    let mut query = reader.query(&header, &index, &noodles_region)?;
    let mut record = bam::Record::default();
    let mut count = 0u64;
    while query.read_record(&mut record)? != 0 {
        f(decode_full(&record)?);
        count += 1;
    }
    Ok(count)
}

/// True if the flags mark this read as unmapped/duplicate/secondary — the
/// records the pipeline skips.
#[inline]
pub fn is_filtered(flag: u16) -> bool {
    let f = Flags::from(flag);
    f.is_unmapped() || f.is_duplicate() || f.is_secondary()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CigarOp;
    use std::path::PathBuf;

    fn sample_bam() -> Vec<u8> {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // crate is cnvlens/rust/cnvlens-core → repo root is three levels up.
        let base = root.join("../../public/sample-data");
        std::fs::read(base.join("NA12878_EGFR.bam")).expect("sample bam")
    }

    #[test]
    fn decode_full_populates_cigar() {
        let bytes = sample_bam();
        let mut recs = vec![];
        for_each_full(&bytes, |a| recs.push(a)).unwrap();
        let r = recs
            .iter()
            .find(|r| !r.cigar.is_empty())
            .expect("some read has a cigar");
        // Read-consuming ops (M/I/S/=/X) must exactly cover the decoded sequence:
        // a real, non-tautological BAM invariant.
        let read_consuming: usize = r
            .cigar
            .iter()
            .filter(|(op, _)| {
                matches!(
                    op,
                    CigarOp::Match
                        | CigarOp::Ins
                        | CigarOp::SoftClip
                        | CigarOp::SeqMatch
                        | CigarOp::SeqMismatch
                )
            })
            .map(|(_, l)| l)
            .sum();
        assert_eq!(
            read_consuming,
            r.seq.len(),
            "read-consuming CIGAR ops must equal seq length"
        );
        // And at least one ref-consuming op exists for a mapped read.
        let ref_consuming: usize = r
            .cigar
            .iter()
            .filter(|(op, _)| {
                matches!(
                    op,
                    CigarOp::Match
                        | CigarOp::Del
                        | CigarOp::Skip
                        | CigarOp::SeqMatch
                        | CigarOp::SeqMismatch
                )
            })
            .map(|(_, l)| l)
            .sum();
        assert!(ref_consuming > 0, "mapped read must consume reference");
    }
}
