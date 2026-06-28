//! VCF input reader.
//!
//! Streams [`Variant`] records from a VCF byte buffer (plain text or BGZF-
//! compressed). Implemented as a hand-rolled tab-delimited line parser rather
//! than via noodles-vcf: VCF is simple columnar text, and this keeps cnvlens-
//! core free of the (heavy) `vcf` feature and its record API while producing the
//! exact same [`Variant`] shape the rest of the pipeline consumes.
//!
//! ## Multi-allelic splitting
//!
//! A VCF record may carry several comma-separated ALT alleles against one REF
//! (`REF=A ALT=G,T`). With `split = false` (the historical default) only the
//! first ALT is read. With `split = true` each ALT is emitted as its own
//! biallelic [`Variant`], reproducing `bcftools norm -m -` semantics: the
//! per-allele REF/ALT are reduced to minimal representation (shared suffix then
//! shared prefix trimmed, advancing POS on a left trim, keeping ≥1 base), and
//! per-allele INFO/AF values are apportioned positionally. This is trimming-
//! only normalization; full reference-aware *left-alignment* of indels in
//! repetitive context is out of scope (see crate notes).

use std::collections::VecDeque;
use std::io::Read;

use noodles::bgzf;

use crate::error::CoreError;
use crate::model::{Region, Variant};

/// Stream variants from a VCF buffer, optionally restricted to a region.
///
/// The region filter is applied per-record on the parsed CHROM/POS (VCF has no
/// random-access index here), so it is exact rather than a seek hint.
///
/// When `split` is true, multi-allelic records are decomposed into one biallelic
/// [`Variant`] per ALT (see the module docs); when false, only the first ALT of
/// each record is read (the historical behaviour).
pub fn stream_vcf(
    bytes: &[u8],
    region: Option<&Region>,
    split: bool,
) -> impl Iterator<Item = Result<Variant, CoreError>> {
    // Decode the whole buffer to text up front (BGZF if gzip-magic, else UTF-8),
    // then iterate parsed data lines. Errors surface as a single Err item.
    let text = match decode_text(bytes) {
        Ok(t) => t,
        Err(e) => return VcfIter::error(e),
    };
    let region = region.cloned();
    VcfIter::lines(text, region, split)
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
///
/// One source line can yield several [`Variant`]s (a split multi-allelic), so
/// the per-line products are buffered in `pending` and drained before the next
/// line is read.
struct VcfIter {
    lines: std::vec::IntoIter<String>,
    region: Option<Region>,
    split: bool,
    pending: VecDeque<Variant>,
    error: Option<CoreError>,
}

impl VcfIter {
    fn lines(text: String, region: Option<Region>, split: bool) -> Self {
        let lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();
        VcfIter {
            lines: lines.into_iter(),
            region,
            split,
            pending: VecDeque::new(),
            error: None,
        }
    }
    fn error(e: CoreError) -> Self {
        VcfIter {
            lines: Vec::new().into_iter(),
            region: None,
            split: false,
            pending: VecDeque::new(),
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
        loop {
            // Drain any buffered products from the previously parsed line first.
            if let Some(v) = self.pending.pop_front() {
                return Some(Ok(v));
            }
            let line = self.lines.next()?;
            // Skip headers, meta lines, and blanks.
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            for v in parse_vcf_line(&line, self.split) {
                if let Some(r) = &self.region {
                    if !region_matches(r, &v) {
                        continue;
                    }
                }
                self.pending.push_back(v);
            }
            // Loop back to drain `pending` (or read the next line if empty).
        }
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

/// Parse a single VCF data line into one or more [`Variant`]s. Returns an empty
/// vector for malformed lines (too few columns) so the stream skips rather than
/// aborts.
///
/// With `split = false` only the first ALT is materialised (untrimmed, matching
/// the historical reader). With `split = true` every ALT becomes its own
/// biallelic record with minimal-representation REF/ALT and positional AF.
fn parse_vcf_line(line: &str, split: bool) -> Vec<Variant> {
    let cols: Vec<&str> = line.split('\t').collect();
    if cols.len() < 8 {
        return Vec::new();
    }
    let chrom = cols[0].to_string();
    let pos: i64 = match cols[1].parse() {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let id = cols[2];
    let ref_base = cols[3].to_string();
    let alts: Vec<&str> = cols[4].split(',').collect();
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
    // INFO/AF is a per-ALT comma list (Number=A); parse all values so each split
    // allele can take its own. A missing/short list yields 0.0 for that allele.
    let af_list: Vec<f64> = info_field(info, "AF")
        .map(|s| {
            s.split(',')
                .map(|x| x.parse::<f64>().unwrap_or(0.0))
                .collect()
        })
        .unwrap_or_default();

    // Which ALTs to emit: all of them when splitting, else just the first.
    let count = if split { alts.len() } else { 1 };
    let mut out = Vec::with_capacity(count);
    for (i, raw_alt) in alts.iter().take(count).enumerate() {
        // Splitting reduces each biallelic pair to minimal representation;
        // the non-split path preserves the allele exactly as written.
        let (vpos, vref, valt) = if split {
            normalize_biallelic(pos, &ref_base, raw_alt)
        } else {
            (pos, ref_base.clone(), raw_alt.to_string())
        };

        let kind = if vref.len() == 1 && valt.len() == 1 {
            "SNV"
        } else {
            "INDEL"
        };
        let allele_freq = af_list.get(i).copied().unwrap_or(0.0);

        out.push(Variant {
            chrom: chrom.clone(),
            pos: vpos,
            ref_base: vref,
            alt: valt,
            qual,
            kind: kind.to_string(),
            depth,
            ref_count: 0,
            alt_count: 0,
            allele_freq,
            strand_bias: 0.0,
            filter: Some(filter.clone()),
            id: Some(id.to_string()),
        });
    }
    out
}

/// Reduce a biallelic (REF, ALT) pair to minimal representation, matching the
/// trimming `bcftools norm` applies when it splits a multi-allelic record:
/// trim equal bases off the right end, then off the left end (advancing POS),
/// always leaving at least one base in each allele.
///
/// Symbolic (`<DEL>`), breakend (`N[chr:pos[`), spanning-deletion (`*`) and
/// missing (`.`) ALTs are passed through untouched — trimming sequence bases
/// against them is undefined.
///
/// This is *trimming only*. Reference-aware left-alignment of indels in
/// repetitive sequence (which `bcftools norm -f ref` also performs) is NOT done
/// here; for already-left-aligned / non-repetitive indels the output is
/// identical to bcftools.
fn normalize_biallelic(pos: i64, r: &str, a: &str) -> (i64, String, String) {
    if a == "." || a == "*" || a.starts_with('<') || a.contains('[') || a.contains(']') {
        return (pos, r.to_string(), a.to_string());
    }
    let mut rb: Vec<u8> = r.bytes().collect();
    let mut ab: Vec<u8> = a.bytes().collect();

    // Right-trim shared suffix (does not move POS), keeping ≥1 base each.
    while rb.len() > 1 && ab.len() > 1 && rb.last() == ab.last() {
        rb.pop();
        ab.pop();
    }
    // Left-trim shared prefix (advances POS), keeping ≥1 base each.
    let mut p = pos;
    while rb.len() > 1 && ab.len() > 1 && rb[0] == ab[0] {
        rb.remove(0);
        ab.remove(0);
        p += 1;
    }

    (
        p,
        String::from_utf8(rb).unwrap_or_else(|_| r.to_string()),
        String::from_utf8(ab).unwrap_or_else(|_| a.to_string()),
    )
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

#[cfg(test)]
mod tests {
    use super::*;

    const HDR: &str = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n";

    fn collect(body: &str, split: bool) -> Vec<Variant> {
        let text = format!("{HDR}{body}");
        stream_vcf(text.as_bytes(), None, split)
            .map(|r| r.unwrap())
            .collect()
    }

    #[test]
    fn no_split_keeps_only_first_alt() {
        let vs = collect("7\t100\trsX\tA\tG,T\t60\tPASS\tDP=100;AF=0.3,0.2\n", false);
        assert_eq!(vs.len(), 1);
        assert_eq!(vs[0].alt, "G");
        assert_eq!(vs[0].allele_freq, 0.3);
    }

    #[test]
    fn splits_multiallelic_snp() {
        let vs = collect("7\t100\trsX\tA\tG,T\t60\tPASS\tDP=100;AF=0.3,0.2\n", true);
        assert_eq!(vs.len(), 2);
        assert_eq!((vs[0].ref_base.as_str(), vs[0].alt.as_str()), ("A", "G"));
        assert_eq!((vs[1].ref_base.as_str(), vs[1].alt.as_str()), ("A", "T"));
        // POS unchanged for SNVs; AF apportioned positionally.
        assert_eq!(vs[0].pos, 100);
        assert_eq!(vs[1].pos, 100);
        assert_eq!(vs[0].allele_freq, 0.3);
        assert_eq!(vs[1].allele_freq, 0.2);
        // Shared columns are copied to every product.
        assert_eq!(vs[0].depth, 100);
        assert_eq!(vs[1].id.as_deref(), Some("rsX"));
        assert_eq!(vs[1].filter.as_deref(), Some("PASS"));
    }

    #[test]
    fn splits_mixed_indel_with_trimming() {
        // REF=AT, ALT=A (1bp deletion) and ATT (1bp insertion).
        let vs = collect("7\t100\t.\tAT\tA,ATT\t50\tPASS\tDP=80;AF=0.1,0.4\n", true);
        assert_eq!(vs.len(), 2);
        // Deletion stays anchored: AT>A at POS 100.
        assert_eq!((vs[0].pos, vs[0].ref_base.as_str(), vs[0].alt.as_str()), (100, "AT", "A"));
        assert_eq!(vs[0].kind, "INDEL");
        // Insertion trims the shared suffix T: A>AT at POS 100.
        assert_eq!((vs[1].pos, vs[1].ref_base.as_str(), vs[1].alt.as_str()), (100, "A", "AT"));
        assert_eq!(vs[1].allele_freq, 0.4);
    }

    #[test]
    fn left_trim_advances_pos() {
        // REF=GCA ALT=GCT — a SNV padded with two shared leading bases.
        let vs = collect("7\t100\t.\tGCA\tGCT\t50\tPASS\t.\n", true);
        assert_eq!(vs.len(), 1);
        assert_eq!((vs[0].pos, vs[0].ref_base.as_str(), vs[0].alt.as_str()), (102, "A", "T"));
        assert_eq!(vs[0].kind, "SNV");
    }

    #[test]
    fn symbolic_alt_passed_through() {
        let vs = collect("7\t100\t.\tA\t<DEL>,T\t50\tPASS\t.\n", true);
        assert_eq!(vs.len(), 2);
        assert_eq!(vs[0].alt, "<DEL>");
        assert_eq!(vs[1].alt, "T");
    }
}
