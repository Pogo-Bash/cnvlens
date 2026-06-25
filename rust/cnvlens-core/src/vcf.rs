//! VCF input reader.
//!
//! Streams [`Variant`] records from a VCF byte buffer (plain text or BGZF-
//! compressed). Implemented as a hand-rolled tab-delimited line parser rather
//! than via noodles-vcf: VCF is simple columnar text, and this keeps cnvlens-
//! core free of the (heavy) `vcf` feature and its record API while producing the
//! exact same [`Variant`] shape the rest of the pipeline consumes.

use std::io::Read;

use noodles::bgzf;

use crate::error::CoreError;
use crate::model::{Region, Variant};

/// Stream variants from a VCF buffer, optionally restricted to a region.
///
/// The region filter is applied per-record on the parsed CHROM/POS (VCF has no
/// random-access index here), so it is exact rather than a seek hint.
pub fn stream_vcf(
    bytes: &[u8],
    region: Option<&Region>,
) -> impl Iterator<Item = Result<Variant, CoreError>> {
    // Decode the whole buffer to text up front (BGZF if gzip-magic, else UTF-8),
    // then iterate parsed data lines. Errors surface as a single Err item.
    let text = match decode_text(bytes) {
        Ok(t) => t,
        Err(e) => return VcfIter::error(e),
    };
    let region = region.cloned();
    VcfIter::lines(text, region)
}

/// Decode a VCF buffer to text, transparently inflating BGZF/gzip.
fn decode_text(bytes: &[u8]) -> Result<String, CoreError> {
    if bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut reader = bgzf::io::Reader::new(std::io::Cursor::new(bytes));
        let mut out = String::new();
        reader
            .read_to_string(&mut out)
            .map_err(|e| CoreError::BamParse(format!("bgzf inflate: {e}")))?;
        Ok(out)
    } else {
        String::from_utf8(bytes.to_vec())
            .map_err(|e| CoreError::BamParse(format!("vcf not utf-8: {e}")))
    }
}

/// An iterator over parsed VCF data lines.
struct VcfIter {
    lines: std::vec::IntoIter<String>,
    region: Option<Region>,
    error: Option<CoreError>,
}

impl VcfIter {
    fn lines(text: String, region: Option<Region>) -> Self {
        let lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();
        VcfIter {
            lines: lines.into_iter(),
            region,
            error: None,
        }
    }
    fn error(e: CoreError) -> Self {
        VcfIter {
            lines: Vec::new().into_iter(),
            region: None,
            error: Some(e),
        }
    }
}

impl Iterator for VcfIter {
    type Item = Result<Variant, CoreError>;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some(e) = self.error.take() {
            return Some(Err(e));
        }
        for line in self.lines.by_ref() {
            // Skip headers, meta lines, and blanks.
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let v = match parse_vcf_line(&line) {
                Some(v) => v,
                None => continue,
            };
            if let Some(r) = &self.region {
                if !region_matches(r, &v) {
                    continue;
                }
            }
            return Some(Ok(v));
        }
        None
    }
}

fn region_matches(r: &Region, v: &Variant) -> bool {
    if v.chrom != r.chrom {
        return false;
    }
    if let Some(s) = r.start {
        if v.pos < s {
            return false;
        }
    }
    if let Some(e) = r.end {
        if v.pos > e {
            return false;
        }
    }
    true
}

/// Parse a single VCF data line into a [`Variant`]. Returns `None` for malformed
/// lines (too few columns) so the stream skips rather than aborts.
fn parse_vcf_line(line: &str) -> Option<Variant> {
    let cols: Vec<&str> = line.split('\t').collect();
    if cols.len() < 8 {
        return None;
    }
    let chrom = cols[0].to_string();
    let pos: i64 = cols[1].parse().ok()?;
    let id = cols[2];
    let ref_base = cols[3].to_string();
    // First ALT allele only.
    let alt = cols[4].split(',').next().unwrap_or(".").to_string();
    let qual: f64 = if cols[5] == "." {
        0.0
    } else {
        cols[5].parse().unwrap_or(0.0)
    };
    let filter = cols[6].to_string();
    let info = cols[7];

    let depth = info_field(info, "DP")
        .and_then(|s| s.parse::<f64>().ok())
        .map(|d| d as i64)
        .unwrap_or(0);
    let af_info = info_field(info, "AF").and_then(|s| {
        // AF may be a comma list; take the first.
        s.split(',').next().and_then(|x| x.parse::<f64>().ok())
    });

    let kind = if ref_base.len() == 1 && alt.len() == 1 {
        "SNV"
    } else {
        "INDEL"
    };

    let allele_freq = af_info.unwrap_or(0.0);

    Some(Variant {
        chrom,
        pos,
        ref_base,
        alt,
        qual,
        kind: kind.to_string(),
        depth,
        ref_count: 0,
        alt_count: 0,
        allele_freq,
        strand_bias: 0.0,
        filter: Some(filter),
        id: Some(id.to_string()),
    })
}

/// Extract `KEY=value` (or a flag `KEY`) from a VCF INFO field.
fn info_field<'a>(info: &'a str, key: &str) -> Option<&'a str> {
    for kv in info.split(';') {
        if let Some((k, v)) = kv.split_once('=') {
            if k == key {
                return Some(v);
            }
        } else if kv == key {
            return Some("");
        }
    }
    None
}
