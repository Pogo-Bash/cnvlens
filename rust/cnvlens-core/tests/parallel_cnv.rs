//! Track: correct parallel CNV calling (global-segmentation-first).
//!
//! The gold-standard contract: per-window depth computed in PARALLEL must yield
//! windows byte-identical to the SERIAL pass, so that global segmentation
//! (`detect_cnvs_*`) produces identical CNV calls — including a CNV that spans
//! what would have been a shard boundary.
//!
//! Race-freedom is structural, not luck: each shard counts into PRIVATE storage
//! and the merge is a clean integer sum after the threads join (see
//! `coverage::count_region_sharded`). These tests pin the *result*; the race
//! argument is in the code structure, which the byte-identical run corroborates
//! but does not, alone, prove.

use std::path::PathBuf;

use cnvlens_core::coverage;
use cnvlens_core::model::{CoverageOptions, Region};

fn sample() -> (Vec<u8>, Vec<u8>) {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../public/sample-data");
    let bam = std::fs::read(base.join("NA12878_EGFR.bam")).expect("sample bam");
    let bai = std::fs::read(base.join("NA12878_EGFR.bam.bai")).expect("sample bai");
    (bam, bai)
}

fn egfr_opts() -> CoverageOptions {
    let mut o = CoverageOptions::default();
    o.window_size = 500;
    o
}

fn egfr_region() -> Region {
    Region::with_bounds("7", Some(55_000_000), Some(55_300_000))
}

/// Byte-identity = the serialized window stream is equal. Floats included: same
/// finalize code path ⇒ identical bits ⇒ identical JSON.
fn windows_json(windows: &[cnvlens_core::model::CoverageWindow]) -> String {
    serde_json::to_string(windows).expect("serialize windows")
}

// ── Task 1 guard: characterization of the current serial behavior ────────────

#[test]
fn serial_baseline_is_stable() {
    let (bam, bai) = sample();
    let windows =
        coverage::analyze_coverage_region(&bam, &bai, &egfr_region(), &egfr_opts()).expect("serial");

    assert_eq!(windows.len(), 318_278, "whole-chromosome window array");
    assert_eq!(
        windows.iter().filter(|w| w.coverage > 0).count(),
        600,
        "nonzero windows over the EGFR region"
    );
    assert_eq!(
        windows.iter().map(|w| w.coverage).sum::<i64>(),
        28_447,
        "total reads counted into windows"
    );
    // The first nonzero window starts BELOW the region floor (a left-overhanging
    // read): the BAI over-return the parallel boundary-ownership must absorb.
    let first_nz = windows.iter().find(|w| w.coverage > 0).unwrap();
    assert_eq!(first_nz.start, 54_999_500);
}

// ── Task 2/4.1 gold standard: parallel windows byte-identical to serial ──────

#[test]
fn parallel_windows_byte_identical_to_serial() {
    let (bam, bai) = sample();
    let opts = egfr_opts();
    let region = egfr_region();

    let serial = coverage::analyze_coverage_region(&bam, &bai, &region, &opts).expect("serial");
    let baseline = windows_json(&serial);

    for shards in [2usize, 3, 4, 8, 16] {
        let parallel =
            coverage::compute_coverage_region_parallel(&bam, &bai, &region, &opts, shards)
                .expect("parallel");
        assert_eq!(
            windows_json(&parallel),
            baseline,
            "parallel ({shards} shards) must be byte-identical to serial"
        );
    }
}

// ── Task 4.4: no read lost or double-counted at a seam ───────────────────────

#[test]
fn parallel_conserves_total_coverage_across_seams() {
    let (bam, bai) = sample();
    let opts = egfr_opts();
    let region = egfr_region();
    let serial_total: i64 = coverage::analyze_coverage_region(&bam, &bai, &region, &opts)
        .unwrap()
        .iter()
        .map(|w| w.coverage)
        .sum();

    for shards in [2usize, 3, 5, 8] {
        let total: i64 =
            coverage::compute_coverage_region_parallel(&bam, &bai, &region, &opts, shards)
                .unwrap()
                .iter()
                .map(|w| w.coverage)
                .sum();
        assert_eq!(
            total, serial_total,
            "{shards} shards: every read counted exactly once (no seam loss/dup)"
        );
    }
}

// ── Task 4.2: THE key test — a CNV straddling a shard boundary stays whole ───
//
// Two independent facts compose into the correctness claim:
//   (A) the byte-identical test proves the parallel COUNTING seam is exact at
//       every shard boundary (a dropped/duplicated boundary window would break
//       byte-identity), and counting is linear in reads — so a 3x depth bump is
//       faithfully equivalent whether applied to reads or to the assembled
//       counts;
//   (B) this test proves global SEGMENTATION emits an amplification that spans
//       the exact coordinate where the 8-shard counter places a boundary as ONE
//       contiguous call — because `detect_cnvs_*` runs once over the whole
//       window array and never sees a shard at all.
// A fragmentation bug (segmentation accidentally sharded) would split this into
// two partial calls and fail the test.

/// Reproduce the implementation's shard-boundary coordinate for `n` shards over
/// the region, so the injected amplification is guaranteed to straddle a real
/// seam rather than an imagined one.
fn shard_boundary_coord(region: &Region, window_size: i64, n: usize, k: usize) -> i64 {
    let num_windows = i64::MAX; // region is far from chromosome end; no clamp needed
    let r_lo_w = (region.start.unwrap() / window_size).clamp(0, num_windows) as usize;
    let r_hi_w = ((region.end.unwrap() / window_size) + 1).clamp(0, num_windows) as usize;
    let span = r_hi_w - r_lo_w;
    let w = r_lo_w + span * k / n;
    w as i64 * window_size
}

#[test]
fn amplification_spanning_a_shard_boundary_is_one_call() {
    let (bam, bai) = sample();
    let opts = egfr_opts();
    let region = egfr_region();
    let ws = opts.window_size as i64;

    // The interior boundary an 8-shard count places (k=4 ⇒ coord 55_150_000).
    let boundary = shard_boundary_coord(&region, ws, 8, 4);
    assert_eq!(boundary % ws, 0, "boundary is window-aligned");

    // Build the positive control on the REAL parallel-assembled windows (proving
    // the assembly is intact end-to-end), then apply a 3x amplification across a
    // span that brackets the boundary on both sides.
    let mut windows =
        coverage::compute_coverage_region_parallel(&bam, &bai, &region, &opts, 8).unwrap();
    let amp_lo = boundary - 6 * ws; // 6 windows left of the seam
    let amp_hi = boundary + 6 * ws; // 6 windows right of the seam
    let mut bumped = 0;
    for w in windows.iter_mut() {
        if w.start >= amp_lo && w.start < amp_hi {
            w.coverage *= 3;
            w.normalized *= 3.0;
            bumped += 1;
        }
    }
    assert_eq!(bumped, 12, "amplified 12 windows straddling the seam");

    // Global segmentation over the whole array.
    let cnvs = cnvlens_core::cnv::detect_cnvs_manual(&windows, 1.5, 0.5, 3);
    let amps: Vec<&serde_json::Value> = cnvs
        .iter()
        .filter(|c| c["type"] == "amplification")
        .filter(|c| {
            let s = c["start"].as_i64().unwrap();
            let e = c["end"].as_i64().unwrap();
            s < boundary && boundary < e
        })
        .collect();

    assert_eq!(
        amps.len(),
        1,
        "exactly ONE amplification spans the seam (not two fragments): {cnvs:?}"
    );
    let amp = amps[0];
    // The single call covers the full injected span — start at/below amp_lo,
    // end at/above amp_hi — i.e. the seam is invisible to segmentation.
    assert!(amp["start"].as_i64().unwrap() <= amp_lo);
    assert!(amp["end"].as_i64().unwrap() >= amp_hi);
}

// ── Task 2 invariant: shards=1 is exactly the serial path ────────────────────

#[test]
fn one_shard_equals_serial() {
    let (bam, bai) = sample();
    let opts = egfr_opts();
    let region = egfr_region();
    let serial = coverage::analyze_coverage_region(&bam, &bai, &region, &opts).unwrap();
    let one = coverage::compute_coverage_region_parallel(&bam, &bai, &region, &opts, 1).unwrap();
    assert_eq!(windows_json(&one), windows_json(&serial));
}
