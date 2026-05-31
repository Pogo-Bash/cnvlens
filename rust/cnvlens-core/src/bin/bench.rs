//! Native harness to validate the noodles API + time the Rust pipeline on the
//! bundled NA12878 sample. Not built for wasm.
//!
//! Usage: cargo run --release --bin bench -- <bam> [bai]

use std::time::Instant;

use serde_json::Value;

use cnvlens_core::model::{CoverageOptions, VariantOptions};
use cnvlens_core::{bam, coverage, reference_list, variants};

fn main() -> std::io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let bam_path = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| "../../public/sample-data/NA12878_EGFR.bam".to_string());

    let bam_bytes = std::fs::read(&bam_path)?;
    println!("Loaded {} ({} bytes)", bam_path, bam_bytes.len());

    let header = bam::read_header(&bam_bytes)?;
    let refs = reference_list(&header);
    println!("References: {}", refs.len());
    for (name, len) in refs.iter().take(5) {
        println!("  {name} = {len}");
    }

    let t = Instant::now();
    let mut kept = 0u64;
    let total = bam::for_each_core(&bam_bytes, |_ref_id, _pos, flag| {
        if !bam::is_filtered(flag) {
            kept += 1;
        }
    })?;
    let dt = t.elapsed();
    println!(
        "Full scan: {total} records ({kept} kept) in {:.3}s",
        dt.as_secs_f64()
    );

    // Coverage analysis on chr7 (no FASTA -> threshold mode), matching ref_run.py.
    let opts = CoverageOptions {
        window_size: 10000,
        chromosomes: Some(vec!["7".to_string()]),
        ..Default::default()
    };
    let t = Instant::now();
    let cov = coverage::analyze_coverage(&bam_bytes, None, &opts);
    let dt = t.elapsed();
    println!("\nCoverage analysis in {:.3}s", dt.as_secs_f64());

    let windows = cov["coverageData"].as_array().map(|a| a.len()).unwrap_or(0);
    let nonzero = cov["coverageData"]
        .as_array()
        .map(|a| a.iter().filter(|w| w["coverage"].as_i64().unwrap_or(0) > 0).count())
        .unwrap_or(0);
    let cov_sum: i64 = cov["coverageData"]
        .as_array()
        .map(|a| a.iter().map(|w| w["coverage"].as_i64().unwrap_or(0)).sum())
        .unwrap_or(0);
    println!("  total_reads   = {}", cov["total_reads"]);
    println!("  num_windows   = {windows}");
    println!("  nonzero       = {nonzero}");
    println!("  coverage_sum  = {cov_sum}");
    println!("  coverage_stats= {}", cov["coverage_stats"]);
    println!("  thresholds    = {}", cov["thresholds_used"]);
    println!("  num_cnvs      = {}", cov["cnvs"].as_array().map(|a| a.len()).unwrap_or(0));
    println!("  cnvs          = {}", serde_json::to_string_pretty(&cov["cnvs"]).unwrap());

    // Variant calling on chr7 (no FASTA -> inferred ref), matching ref_run.py.
    let vopts = VariantOptions {
        chromosomes: Some(vec!["7".to_string()]),
        ..Default::default()
    };
    let t = Instant::now();
    let var = variants::call_variants(&bam_bytes, None, &vopts);
    let dt = t.elapsed();
    println!("\nVariant calling in {:.3}s", dt.as_secs_f64());

    let vs = var["variants"].as_array().cloned().unwrap_or_default();
    let qual_sum: f64 = vs.iter().map(|v| v["qual"].as_f64().unwrap_or(0.0)).sum();
    let depth_sum: i64 = vs.iter().map(|v| v["depth"].as_i64().unwrap_or(0)).sum();
    println!("  total_variants= {}", var["total_variants"]);
    println!("  reference_used= {}", var["reference_used"]);
    println!("  qual_sum      = {:.4}", qual_sum);
    println!("  depth_sum     = {depth_sum}");
    println!(
        "  first_3       = {}",
        serde_json::to_string_pretty(&Value::Array(vs.iter().take(3).cloned().collect())).unwrap()
    );

    if std::env::var("DUMP_VARIANTS").is_ok() {
        let slim: Vec<Value> = vs
            .iter()
            .map(|v| {
                serde_json::json!({
                    "pos": v["pos"],
                    "alt": v["alt"],
                    "depth": v["depth"],
                    "alt_count": v["alt_count"],
                    "qual": (v["qual"].as_f64().unwrap() * 1e6).round() / 1e6,
                })
            })
            .collect();
        std::fs::write("/tmp/rust_variants.json", serde_json::to_string(&slim).unwrap())?;
        println!("  wrote /tmp/rust_variants.json");
    }

    Ok(())
}
