//! Phase 4 cnvlens-core gap tests: BAI random access actually seeks, the
//! streaming entry points yield typed records, and structured errors surface.
//!
//! Fixture: the bundled NA12878 EGFR sample (GRCh37 contig names: "7" carries
//! ~31k reads around EGFR at ~55 Mb; every other contig is empty).

use std::path::PathBuf;

use cnvlens_core::error::CoreError;
use cnvlens_core::model::{Region, VariantOptions};
use cnvlens_core::{bam, variants};

fn sample() -> (Vec<u8>, Vec<u8>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // crate is cnvlens/rust/cnvlens-core → repo root is three levels up.
    let base = root.join("../../public/sample-data");
    let bam = std::fs::read(base.join("NA12878_EGFR.bam")).expect("sample bam");
    let bai = std::fs::read(base.join("NA12878_EGFR.bam.bai")).expect("sample bai");
    (bam, bai)
}

#[test]
fn full_scan_visits_every_record() {
    let (bam_bytes, _) = sample();
    let mut total = 0u64;
    let count = bam::for_each_core(&bam_bytes, |_, _, _| total += 1).unwrap();
    assert_eq!(count, total);
    assert!(total > 30_000, "sample should hold ~31k reads, got {total}");
}

#[test]
fn region_seek_skips_empty_chromosomes() {
    let (bam_bytes, bai_bytes) = sample();

    // Chromosome "1" has zero reads — a true index seek must visit 0 records
    // rather than scanning the whole file.
    let empty = Region::new("1");
    let mut visited = 0u64;
    let count =
        bam::for_each_region_core(&bam_bytes, &bai_bytes, &empty, |_, _, _| visited += 1).unwrap();
    assert_eq!(count, 0, "seek to empty chromosome must not scan reads");
    assert_eq!(visited, 0);
}

#[test]
fn region_seek_only_visits_target_chromosome() {
    let (bam_bytes, bai_bytes) = sample();

    // Resolve "7"'s ref_id so we can assert no foreign records leak through.
    let header = bam::read_header(&bam_bytes).unwrap();
    let refs = cnvlens_core::reference_list(&header);
    let chr7_id = refs.iter().position(|(n, _)| n == "7").unwrap() as i32;

    let region = Region::new("7");
    let mut foreign = 0u64;
    let visited =
        bam::for_each_region_core(&bam_bytes, &bai_bytes, &region, |ref_id, _, _| {
            if ref_id != chr7_id {
                foreign += 1;
            }
        })
        .unwrap();

    assert!(visited > 30_000, "chr7 region should hold ~31k reads");
    assert_eq!(foreign, 0, "index seek must not surface other chromosomes");
}

#[test]
fn region_with_position_bounds_constrains_window() {
    let (bam_bytes, bai_bytes) = sample();

    let whole_chr7 =
        bam::for_each_region_core(&bam_bytes, &bai_bytes, &Region::new("7"), |_, _, _| {}).unwrap();

    // EGFR sits ~55.08–55.28 Mb; a tight window must visit strictly fewer reads.
    let egfr = Region::with_bounds("7", Some(55_086_000), Some(55_280_000));
    let windowed =
        bam::for_each_region_core(&bam_bytes, &bai_bytes, &egfr, |_, _, _| {}).unwrap();

    assert!(windowed > 0, "EGFR window should contain reads");
    assert!(
        windowed < whole_chr7,
        "position bounds must constrain the scan ({windowed} vs {whole_chr7})"
    );
}

#[test]
fn region_variant_calling_matches_full_scan_on_chr7() {
    let (bam_bytes, bai_bytes) = sample();
    let opts = VariantOptions::default();

    // Full scan restricted to chr7 via options vs. BAI-seeked region call must
    // produce identical variants (regression: seeking changes performance, not
    // results).
    let mut full_opts = VariantOptions::default();
    full_opts.chromosomes = Some(vec!["7".to_string()]);
    let full = variants::collect_variants(&bam_bytes, None, &full_opts).unwrap();

    let region = Region::new("7");
    let seeked = variants::call_variants_region(&bam_bytes, &bai_bytes, &region, &opts).unwrap();

    assert_eq!(full.len(), seeked.len(), "variant counts must match");
    for (a, b) in full.iter().zip(seeked.iter()) {
        assert_eq!((&a.chrom, a.pos, &a.alt), (&b.chrom, b.pos, &b.alt));
    }
}

#[test]
fn streaming_variants_are_iterable() {
    let (bam_bytes, _) = sample();
    let mut opts = VariantOptions::default();
    opts.chromosomes = Some(vec!["7".to_string()]);
    let iter = variants::stream(&bam_bytes, None, &opts).unwrap();
    // Consuming the iterator partially must work without materializing a Value.
    let first_five: Vec<_> = iter.take(5).collect();
    assert!(!first_five.is_empty(), "expected at least one variant on chr7");
}

#[test]
fn unknown_region_is_a_structured_error() {
    let (bam_bytes, bai_bytes) = sample();
    let opts = VariantOptions::default();
    let region = Region::new("nonexistent_contig");
    let err = variants::call_variants_region(&bam_bytes, &bai_bytes, &region, &opts).unwrap_err();
    assert!(matches!(err, CoreError::InvalidRegion(_)), "got {err:?}");
}
