//! Options (parsed from JS JSON) and serializable result types.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

fn default_window_size() -> u32 {
    10000
}
fn default_min_depth() -> i64 {
    10
}
fn default_min_bq() -> u8 {
    20
}
fn default_min_mq() -> u8 {
    20
}
fn default_min_var_reads() -> i64 {
    3
}
fn default_min_af() -> f64 {
    0.05
}
fn default_min_sb() -> f64 {
    0.1
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct CoverageOptions {
    #[serde(default = "default_window_size")]
    pub window_size: u32,
    pub chromosome: Option<String>,
    pub chromosomes: Option<Vec<String>>,
    pub use_manual_thresholds: bool,
    pub amp_threshold: Option<f64>,
    pub del_threshold: Option<f64>,
    pub min_windows: Option<usize>,
    pub segmentation_method: Option<String>,
    pub reference_seqs: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct VariantOptions {
    pub chromosomes: Option<Vec<String>>,
    #[serde(default = "default_min_depth")]
    pub min_depth: i64,
    #[serde(default = "default_min_bq")]
    pub min_base_quality: u8,
    #[serde(default = "default_min_mq")]
    pub min_mapping_quality: u8,
    #[serde(default = "default_min_var_reads")]
    pub min_variant_reads: i64,
    #[serde(default = "default_min_af")]
    pub min_allele_freq: f64,
    #[serde(default = "default_min_sb")]
    pub min_strand_bias: f64,
    pub reference_seqs: Option<HashMap<String, String>>,
}

impl Default for VariantOptions {
    fn default() -> Self {
        VariantOptions {
            chromosomes: None,
            min_depth: default_min_depth(),
            min_base_quality: default_min_bq(),
            min_mapping_quality: default_min_mq(),
            min_variant_reads: default_min_var_reads(),
            min_allele_freq: default_min_af(),
            min_strand_bias: default_min_sb(),
            reference_seqs: None,
        }
    }
}

/// One coverage window. `masked` is only serialized when true (matching the
/// reference, which omits the key otherwise).
#[derive(Debug, Serialize)]
pub struct CoverageWindow {
    pub chromosome: String,
    pub start: i64,
    pub end: i64,
    pub coverage: i64,
    pub normalized: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub masked: Option<bool>,
}

/// One called SNV. Field names match the reference VCF-ish dict.
#[derive(Debug, Serialize)]
pub struct Variant {
    pub chrom: String,
    pub pos: i64,
    #[serde(rename = "ref")]
    pub ref_base: String,
    pub alt: String,
    pub qual: f64,
    #[serde(rename = "type")]
    pub kind: String,
    pub depth: i64,
    pub ref_count: i64,
    pub alt_count: i64,
    pub allele_freq: f64,
    pub strand_bias: f64,
}
