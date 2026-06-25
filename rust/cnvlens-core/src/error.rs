//! Structured errors for the cnvlens-core data plane.
//!
//! Phase 1–3 returned errors as `{"error": "..."}` JSON strings baked into the
//! result `Value`. That is fine for the JS shim but useless for the CodonSplice
//! VM, which needs to distinguish "no reads in this region" (an empty result)
//! from "the BAM is corrupt" (a hard failure). [`CoreError`] is the typed error
//! the streaming entry points return; the legacy JSON wrappers fold it back into
//! the `{"error": ...}` shape for backwards compatibility.

use std::fmt;

/// An error from a cnvlens-core pipeline.
#[derive(Debug)]
pub enum CoreError {
    /// Underlying I/O failure (BGZF inflate, short read, seek past EOF, …).
    Io(std::io::Error),
    /// The bytes are not a valid BAM/BAI/VCF stream.
    BamParse(String),
    /// A requested region could not be resolved (unknown chromosome, inverted
    /// interval, position out of range).
    InvalidRegion(String),
    /// A region resolved fine but contained no usable reads.
    NoReadsInRegion(String),
    /// Not enough data to compute a statistic (e.g. fewer coverage windows than
    /// the minimum required for segmentation).
    InsufficientData { min_required: usize, found: usize },
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::Io(e) => write!(f, "io error: {e}"),
            CoreError::BamParse(m) => write!(f, "bam parse error: {m}"),
            CoreError::InvalidRegion(m) => write!(f, "invalid region: {m}"),
            CoreError::NoReadsInRegion(m) => write!(f, "no reads in region: {m}"),
            CoreError::InsufficientData {
                min_required,
                found,
            } => write!(
                f,
                "insufficient data: need at least {min_required}, found {found}"
            ),
        }
    }
}

impl std::error::Error for CoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CoreError::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Io(e)
    }
}

impl CoreError {
    /// The legacy `{"error": "..."}` JSON shape used by the deprecated wrappers.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({ "error": self.to_string() })
    }
}
