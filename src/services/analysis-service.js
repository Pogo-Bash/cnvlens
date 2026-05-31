/**
 * Analysis Service
 * Unified interface for genomics analysis, backed by the Rust/WASM engine.
 */

class AnalysisService {
  constructor() {
    this.engine = null;
  }

  /**
   * Initialize service with the WASM engine instance.
   */
  initialize(engineInstance) {
    this.engine = engineInstance;
    console.log('Analysis service initialized with WASM engine');
  }

  /**
   * Coverage + CNV analysis from a BAM file.
   */
  async analyzeCNV(bamFile, options = {}) {
    if (!this.engine?.isReady.value) {
      throw new Error('WASM engine not ready. Please wait for initialization to complete.');
    }

    const arrayBuffer = await bamFile.arrayBuffer();
    console.log(`Analyzing BAM file (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB) with WASM...`);

    let baiData = null;
    if (options.baiFile) {
      baiData = await options.baiFile.arrayBuffer();
    }

    return await this.engine.analyzeBam(arrayBuffer, {
      windowSize: options.windowSize || 10000,
      chromosome: options.chromosome || null,
      baiData,
      referenceSeqs: options.referenceSeqs || null,
      segmentationMethod: options.segmentationMethod || null,
      useManualThresholds: options.useManualThresholds ?? false,
      ampThreshold: options.ampThreshold ?? undefined,
      delThreshold: options.delThreshold ?? undefined,
      minWindows: options.minWindows ?? undefined,
    });
  }

  /**
   * Check if the engine is available and ready.
   */
  isReady() {
    return this.engine?.isReady.value || false;
  }

  /**
   * Get service status.
   */
  getStatus() {
    return {
      engine: {
        available: !!this.engine,
        ready: this.isReady(),
        initializing: this.engine?.isInitializing.value || false,
        progress: this.engine?.progress.value || 0,
        status: this.engine?.status.value || '',
      },
      method: 'rust-wasm',
    };
  }
}

// Singleton instance
export const analysisService = new AnalysisService();
export default analysisService;
