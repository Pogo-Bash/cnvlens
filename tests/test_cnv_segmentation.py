"""
Synthetic tests for CBS-lite segmentation and GC correction.

Test 1: Flat-noise chromosome — verify false-positive rate is bounded.
Test 2: Single deletion recovery — verify breakpoint accuracy.
Test 3: Multi-event chromosome — verify 3+ segments detected.
Test 4: GC correction — verify residual bias reduction.

Run: python3 tests/test_cnv_segmentation.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np

# Load pipeline functions
exec(open(os.path.join(os.path.dirname(__file__), 'pipeline.py')).read())


def make_windows(coverages, chrom='chr7', window_size=10000):
    """Create window dicts from a coverage array."""
    median_cov = float(np.median(coverages))
    windows = []
    for i, cov in enumerate(coverages):
        windows.append({
            'chromosome': chrom,
            'start': i * window_size,
            'end': (i + 1) * window_size,
            'coverage': float(cov),
            'normalized': float(cov / median_cov) if median_cov > 0 else 0.0,
            'masked': False
        })
    return windows, median_cov


def test_flat_noise_false_positives():
    """
    Test 1: Flat Poisson chromosome should produce few false segments.

    With t_threshold=3.0 and ~1000 windows, expect < 5 false CNV calls
    on average across multiple seeds.
    """
    print("Test 1: Flat-noise false-positive rate...")
    n_windows = 1000
    lambda_cov = 100  # typical exome per-window count
    n_trials = 10
    total_false_cnvs = 0

    for seed in range(n_trials):
        rng = np.random.default_rng(seed + 42)
        coverages = rng.poisson(lambda_cov, n_windows).astype(float)
        windows, median_cov = make_windows(coverages)

        cnvs = detect_cnvs_cbs_lite(windows, 'high', median_cov,
                                     min_segment_windows=3, t_threshold=3.0)
        total_false_cnvs += len(cnvs)

    mean_false = total_false_cnvs / n_trials
    print(f"  Mean false CNV calls on flat input: {mean_false:.1f} (threshold: < 5)")
    assert mean_false < 5, f"Too many false positives: {mean_false:.1f} (expected < 5)"
    print("  PASSED\n")


def test_single_deletion_recovery():
    """
    Test 2: Single 50-window deletion should be recovered with accurate breakpoints.

    Background: Poisson(100), Deletion region: Poisson(50) → ~0.5 normalized.
    Expect: at least one deletion call overlapping truth, breakpoints within ±2 windows.
    """
    print("Test 2: Single deletion recovery...")
    rng = np.random.default_rng(123)
    n_windows = 500
    del_start = 200
    del_end = 250  # 50-window deletion

    coverages = rng.poisson(100, n_windows).astype(float)
    coverages[del_start:del_end] = rng.poisson(50, del_end - del_start).astype(float)

    windows, median_cov = make_windows(coverages)
    cnvs = detect_cnvs_cbs_lite(windows, 'high', median_cov,
                                 min_segment_windows=3, t_threshold=3.0)

    # Find deletion calls
    deletions = [c for c in cnvs if c['type'] == 'deletion']
    assert len(deletions) >= 1, f"No deletions found (got {len(cnvs)} total CNVs)"

    # Find the one overlapping truth
    truth_start = del_start * 10000
    truth_end = del_end * 10000
    overlapping = [d for d in deletions
                   if d['start'] < truth_end and d['end'] > truth_start]
    assert len(overlapping) >= 1, f"No deletion overlaps truth region [{del_start}, {del_end}]"

    best = overlapping[0]
    bp_start_window = best['start'] // 10000
    bp_end_window = best['end'] // 10000

    start_error = abs(bp_start_window - del_start)
    end_error = abs(bp_end_window - del_end)

    print(f"  Truth: windows [{del_start}, {del_end}]")
    print(f"  Called: windows [{bp_start_window}, {bp_end_window}]")
    print(f"  Breakpoint error: start={start_error}, end={end_error} windows")
    assert start_error <= 2, f"Start breakpoint off by {start_error} windows (max 2)"
    assert end_error <= 2, f"End breakpoint off by {end_error} windows (max 2)"

    # Verify segment mean is in deletion range
    assert best['copyNumber'] < 1.4, f"Copy number {best['copyNumber']:.2f} too high for deletion"
    print(f"  Copy number: {best['copyNumber']:.2f} (expected ~1.0)")
    print("  PASSED\n")


def test_multi_event_chromosome():
    """
    Test 3: Chromosome with 3 events — verify all are found.

    Background(100) | Deletion(40) | Background(100) | Amplification(180) | Background(100) | Deletion(45)
    """
    print("Test 3: Multi-event chromosome...")
    rng = np.random.default_rng(456)

    segments = [
        (100, 100),   # normal: 100 windows
        (40, 30),     # deletion: 30 windows
        (100, 80),    # normal: 80 windows
        (180, 40),    # amplification: 40 windows
        (100, 100),   # normal: 100 windows
        (45, 25),     # deletion: 25 windows
        (100, 50),    # normal: 50 windows
    ]

    coverages = np.concatenate([
        rng.poisson(lam, size) for lam, size in segments
    ]).astype(float)

    windows, median_cov = make_windows(coverages)
    cnvs = detect_cnvs_cbs_lite(windows, 'high', median_cov,
                                 min_segment_windows=3, t_threshold=3.0)

    deletions = [c for c in cnvs if c['type'] == 'deletion']
    amplifications = [c for c in cnvs if c['type'] == 'amplification']

    print(f"  Found {len(deletions)} deletions, {len(amplifications)} amplifications")
    assert len(deletions) >= 2, f"Expected >=2 deletions, got {len(deletions)}"
    assert len(amplifications) >= 1, f"Expected >=1 amplification, got {len(amplifications)}"
    print("  PASSED\n")


def test_gc_correction_reduces_bias():
    """
    Test 4: GC correction should reduce correlation between GC and coverage.

    Simulate a GC-biased coverage profile (quadratic relationship) and
    verify that after correction, the residual GC-coverage correlation drops.
    """
    print("Test 4: GC correction reduces bias...")
    rng = np.random.default_rng(789)
    n_windows = 200
    window_size = 10000

    # Generate synthetic reference with varying GC content
    reference_seqs = {}
    gc_fractions = np.linspace(0.25, 0.75, n_windows)
    chrom_seq = []

    for i, gc_frac in enumerate(gc_fractions):
        gc_count = int(window_size * gc_frac)
        at_count = window_size - gc_count
        # Build window: GC bases then AT bases (order doesn't matter for counting)
        window_seq = 'G' * (gc_count // 2) + 'C' * (gc_count - gc_count // 2) + \
                     'A' * (at_count // 2) + 'T' * (at_count - at_count // 2)
        chrom_seq.append(window_seq)

    reference_seqs['chr1'] = ''.join(chrom_seq)

    # Simulate GC-biased coverage: quadratic dip at extremes
    # True coverage = 100 * (1 - 2*(gc - 0.5)^2) + noise
    true_bias = 100 * (1 - 2 * (gc_fractions - 0.5) ** 2)
    coverages = rng.poisson(true_bias).astype(float)

    windows, median_cov = make_windows(coverages, chrom='chr1', window_size=window_size)

    # Measure pre-correction correlation
    pre_normalized = np.array([w['normalized'] for w in windows])
    pre_corr = abs(np.corrcoef(gc_fractions, pre_normalized)[0, 1])

    # Apply GC correction
    corrected_windows = apply_gc_correction(windows, reference_seqs, window_size)

    # Measure post-correction correlation
    post_normalized = np.array([w['normalized'] for w in corrected_windows])
    post_corr = abs(np.corrcoef(gc_fractions, post_normalized)[0, 1])

    print(f"  Pre-correction |correlation|:  {pre_corr:.3f}")
    print(f"  Post-correction |correlation|: {post_corr:.3f}")
    assert post_corr < pre_corr, "GC correction didn't reduce bias"
    assert post_corr < 0.15, f"Residual correlation too high: {post_corr:.3f} (want < 0.15)"
    print("  PASSED\n")


if __name__ == '__main__':
    print("=" * 60)
    print("CBS-lite Segmentation & GC Correction Tests")
    print("=" * 60 + "\n")

    test_flat_noise_false_positives()
    test_single_deletion_recovery()
    test_multi_event_chromosome()
    test_gc_correction_reduces_bias()

    print("=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)
