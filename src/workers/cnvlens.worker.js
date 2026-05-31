// WASM compute worker. Loads the Rust `cnvlens-core` module and runs the
// BAM coverage/CNV and SNV pipelines off the main thread. Replaces the old
// Pyodide worker; message protocol is unchanged so the composable layer is
// a drop-in swap.

import init, { analyze_coverage, call_variants } from '../wasm/cnvlens_core.js';

let ready = false;
let initPromise = null;

function ensureReady() {
  if (ready) return Promise.resolve();
  if (!initPromise) {
    initPromise = init().then(() => {
      ready = true;
    });
  }
  return initPromise;
}

function bytes(buffer) {
  return buffer ? new Uint8Array(buffer) : new Uint8Array(0);
}

// Map the JS (camelCase) options to the snake_case shape the Rust
// CoverageOptions deserializer expects. Undefined keys are dropped by
// JSON.stringify and fall back to serde defaults.
function coverageOpts(o = {}) {
  return {
    window_size: o.windowSize ?? 10000,
    chromosome: o.chromosome ?? null,
    chromosomes: o.chromosomes ?? null,
    use_manual_thresholds: o.useManualThresholds ?? false,
    amp_threshold: o.ampThreshold,
    del_threshold: o.delThreshold,
    min_windows: o.minWindows,
    segmentation_method: o.segmentationMethod ?? null,
    reference_seqs: o.referenceSeqs ?? null,
  };
}

function variantOpts(o = {}) {
  return {
    chromosomes: o.chromosomes ?? null,
    min_depth: o.minDepth ?? 10,
    min_base_quality: o.minBaseQuality ?? 20,
    min_mapping_quality: o.minMappingQuality ?? 20,
    min_variant_reads: o.minVariantReads ?? 3,
    min_allele_freq: o.minAlleleFreq ?? 0.05,
    min_strand_bias: o.minStrandBias ?? 0.1,
    reference_seqs: o.referenceSeqs ?? null,
  };
}

self.onmessage = async (event) => {
  const { type, id, payload = {} } = event.data;

  try {
    if (type === 'init') {
      await ensureReady();
      self.postMessage({ type: 'ready' });
      self.postMessage({ id, result: { ready: true } });
      return;
    }

    if (type === 'check-ready') {
      self.postMessage({ id, result: { ready } });
      return;
    }

    await ensureReady();

    if (type === 'analyze-bam') {
      const { fileData, options = {} } = payload;
      const json = analyze_coverage(
        bytes(fileData),
        bytes(options.baiData),
        JSON.stringify(coverageOpts(options))
      );
      self.postMessage({ id, result: JSON.parse(json) });
      return;
    }

    if (type === 'call-variants') {
      const { fileData, options = {} } = payload;
      const json = call_variants(
        bytes(fileData),
        bytes(options.baiData),
        JSON.stringify(variantOpts(options))
      );
      self.postMessage({ id, result: JSON.parse(json) });
      return;
    }

    self.postMessage({ id, error: `Unknown message type: ${type}` });
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
