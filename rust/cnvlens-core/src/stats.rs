//! Numeric helpers matching the NumPy/Python reference semantics.

/// Population mean (np.mean).
pub fn mean(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    xs.iter().sum::<f64>() / xs.len() as f64
}

/// Population standard deviation (np.std, ddof=0).
pub fn std(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let m = mean(xs);
    let var = xs.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / xs.len() as f64;
    var.sqrt()
}

/// Median (np.median): average of the two middle elements for even counts.
/// Sorts a copy.
pub fn median(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let mut v = xs.to_vec();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    }
}

/// Degree-2 least-squares polynomial fit, returning coefficients in NumPy
/// order [a2, a1, a0] for a2*x^2 + a1*x + a0. Solved via normal equations.
pub fn polyfit2(x: &[f64], y: &[f64]) -> [f64; 3] {
    // Build sums for the 3x3 normal-equation system (Vandermonde of degree 2).
    let n = x.len() as f64;
    let mut s0 = n;
    let (mut s1, mut s2, mut s3, mut s4) = (0.0, 0.0, 0.0, 0.0);
    let (mut t0, mut t1, mut t2) = (0.0, 0.0, 0.0);
    for (&xi, &yi) in x.iter().zip(y.iter()) {
        let x2 = xi * xi;
        s1 += xi;
        s2 += x2;
        s3 += x2 * xi;
        s4 += x2 * x2;
        t0 += yi;
        t1 += xi * yi;
        t2 += x2 * yi;
    }
    let _ = &mut s0;
    // Solve A c = b where, with c = [a0, a1, a2]:
    // [s0 s1 s2][a0]   [t0]
    // [s1 s2 s3][a1] = [t1]
    // [s2 s3 s4][a2]   [t2]
    let a = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]];
    let b = [t0, t1, t2];
    let c = solve3(a, b);
    // Return highest-degree-first to match np.polyfit.
    [c[2], c[1], c[0]]
}

/// Evaluate a polynomial given coefficients highest-degree-first (np.polyval).
pub fn polyval(coeffs: &[f64], x: f64) -> f64 {
    let mut acc = 0.0;
    for &c in coeffs {
        acc = acc * x + c;
    }
    acc
}

/// Solve a 3x3 linear system by Gaussian elimination with partial pivoting.
fn solve3(mut a: [[f64; 3]; 3], mut b: [f64; 3]) -> [f64; 3] {
    for col in 0..3 {
        // Partial pivot.
        let mut piv = col;
        for r in (col + 1)..3 {
            if a[r][col].abs() > a[piv][col].abs() {
                piv = r;
            }
        }
        a.swap(col, piv);
        b.swap(col, piv);

        let d = a[col][col];
        if d.abs() < 1e-300 {
            continue;
        }
        for r in 0..3 {
            if r == col {
                continue;
            }
            let f = a[r][col] / d;
            for k in col..3 {
                a[r][k] -= f * a[col][k];
            }
            b[r] -= f * b[col];
        }
    }
    [
        b[0] / a[0][0],
        b[1] / a[1][1],
        b[2] / a[2][2],
    ]
}

/// Log of the binomial coefficient C(n, k) via lgamma.
fn log_comb(n: f64, k: f64) -> f64 {
    if k < 0.0 || k > n {
        return f64::NEG_INFINITY;
    }
    lgamma(n + 1.0) - lgamma(k + 1.0) - lgamma(n - k + 1.0)
}

#[inline]
fn lgamma(x: f64) -> f64 {
    libm::lgamma(x)
}

/// Log-space addition: log(exp(a) + exp(b)).
fn log_add(log_a: f64, log_b: f64) -> f64 {
    if log_a == f64::NEG_INFINITY {
        return log_b;
    }
    if log_b == f64::NEG_INFINITY {
        return log_a;
    }
    if log_a > log_b {
        log_a + (log_b - log_a).exp().ln_1p()
    } else {
        log_b + (log_a - log_b).exp().ln_1p()
    }
}

/// Phred-scaled quality from a binomial survival test, matching the reference
/// `_binomial_qual_score`.
pub fn binomial_qual_score(k: i64, n: i64, p: f64) -> f64 {
    let mean = n as f64 * p;
    let qual = if mean > 5.0 {
        // Normal approximation to the binomial.
        let s = (n as f64 * p * (1.0 - p)).sqrt();
        if s == 0.0 {
            return 999.0;
        }
        let z = (k as f64 - 0.5 - mean) / s;
        if z > 0.0 {
            let log10_p = -(z * z) / (2.0 * (10f64).ln())
                - z.log10()
                - 0.5 * (2.0 * std::f64::consts::PI).log10();
            -10.0 * log10_p
        } else {
            0.0
        }
    } else {
        // Exact log-space survival function for small expected counts.
        let mut log_sum = f64::NEG_INFINITY;
        let log_p = if p > 0.0 { p.ln() } else { f64::NEG_INFINITY };
        let log_1mp = (1.0 - p).ln();
        for i in 0..k {
            let log_term =
                log_comb(n as f64, i as f64) + i as f64 * log_p + (n - i) as f64 * log_1mp;
            log_sum = log_add(log_sum, log_term);
        }
        let cdf = if log_sum > -500.0 { log_sum.exp() } else { 0.0 };
        let survival = 1.0 - cdf;
        if survival <= 0.0 {
            999.0
        } else {
            -10.0 * survival.log10()
        }
    };
    qual.min(999.0)
}
