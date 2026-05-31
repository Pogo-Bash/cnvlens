//! cnvlens-core: BGZF/BAM parsing + CNV/SNV pipeline, compiled to WASM.
//!
//! Core logic lives in plain functions so it can be unit-tested and
//! benchmarked natively (see `src/bin/bench.rs`). The wasm-bindgen layer is a
//! thin JSON-in / JSON-out shim gated to the `wasm32` target.

pub mod bam;
pub mod cnv;
pub mod coverage;
pub mod model;
pub mod stats;
pub mod variants;

use noodles::sam::Header;

/// Lightweight alignment record decoded from a BAM file.
///
/// `pos` is 0-based (matching the raw BAM core field), unlike noodles'
/// 1-based `Position`.
#[derive(Debug, Clone)]
pub struct AlnRecord {
    pub ref_id: i32,
    pub pos: i64,
    pub mapq: u8,
    pub flag: u16,
    pub seq: Vec<u8>,
    pub qual: Vec<u8>,
}

impl AlnRecord {
    #[inline]
    pub fn is_unmapped(&self) -> bool {
        self.flag & 0x4 != 0
    }
    #[inline]
    pub fn is_secondary(&self) -> bool {
        self.flag & 0x100 != 0
    }
    #[inline]
    pub fn is_duplicate(&self) -> bool {
        self.flag & 0x400 != 0
    }
    #[inline]
    pub fn is_reverse(&self) -> bool {
        self.flag & 0x10 != 0
    }
}

// ── wasm-bindgen shim: JSON-in / JSON-out, gated to the wasm32 target ──

#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;

    use crate::model::{CoverageOptions, VariantOptions};
    use crate::{coverage, variants};

    fn opt_bai(bai: &[u8]) -> Option<&[u8]> {
        if bai.is_empty() {
            None
        } else {
            Some(bai)
        }
    }

    /// One-time panic-hook install so Rust panics surface in the JS console.
    #[wasm_bindgen(start)]
    pub fn init() {
        console_error_panic_hook::set_once();
    }

    /// Coverage + CNV analysis. `opts_json` is the snake_case `CoverageOptions`
    /// JSON; returns the result object as a JSON string.
    #[wasm_bindgen]
    pub fn analyze_coverage(bam: &[u8], bai: &[u8], opts_json: &str) -> String {
        let opts: CoverageOptions = match serde_json::from_str(opts_json) {
            Ok(o) => o,
            Err(e) => return format!("{{\"error\":\"bad options: {e}\"}}"),
        };
        let value = coverage::analyze_coverage(bam, opt_bai(bai), &opts);
        value.to_string()
    }

    /// SNV variant calling. `opts_json` is the snake_case `VariantOptions` JSON.
    #[wasm_bindgen]
    pub fn call_variants(bam: &[u8], bai: &[u8], opts_json: &str) -> String {
        let opts: VariantOptions = match serde_json::from_str(opts_json) {
            Ok(o) => o,
            Err(e) => return format!("{{\"error\":\"bad options: {e}\"}}"),
        };
        let value = variants::call_variants(bam, opt_bai(bai), &opts);
        value.to_string()
    }
}

/// Reference sequences (name + length) from the BAM header, in header order.
pub fn reference_list(header: &Header) -> Vec<(String, usize)> {
    header
        .reference_sequences()
        .iter()
        .map(|(name, map)| (name.to_string(), usize::from(map.length())))
        .collect()
}
