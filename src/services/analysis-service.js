/**
 * Analysis Service
 * Provides unified interface for genomics analysis
 * Uses Pyodide (Python) for all bioinformatics analysis
 * Supports multi-threaded parallel processing
 */

class AnalysisService {
  constructor() {
    this.pyodide = null;
    this.pyodidePool = null;
    this.useParallelProcessing = false; // Feature flag for multi-threading (disabled by default)
  }

  /**
   * Initialize service with Pyodide instance
   */
  initialize(pyodideInstance) {
    this.pyodide = pyodideInstance;
    console.log('Analysis service initialized with Pyodide support');
  }

  /**
   * Initialize service with worker pool for parallel processing
   */
  initializePool(poolInstance) {
    this.pyodidePool = poolInstance;
    console.log('Analysis service initialized with worker pool support');
  }

  /**
   * Set parallel processing mode
   */
  setParallelProcessing(enabled) {
    this.useParallelProcessing = enabled;
    console.log(`Parallel processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Analyze CNV from BAM file using Python
   * Automatically uses multi-threading for files > 50MB
   */
  async analyzeCNV(bamFile, options = {}) {
    const fileSize = bamFile.size;
    const fileSizeMB = fileSize / 1024 / 1024;

    // Decide whether to use parallel processing
    const shouldUseParallel = this.useParallelProcessing &&
                              this.pyodidePool?.poolReady.value &&
                              fileSizeMB > 50; // Use parallel for files > 50MB

    if (shouldUseParallel) {
      return await this.analyzeCNVParallel(bamFile, options);
    } else {
      return await this.analyzeCNVSingleThreaded(bamFile, options);
    }
  }

  /**
   * Single-threaded CNV analysis (original method)
   */
  async analyzeCNVSingleThreaded(bamFile, options = {}) {
    if (!this.pyodide?.isReady.value) {
      throw new Error('Python environment not ready. Please wait for initialization to complete.');
    }

    console.log('🔧 Using single-threaded Pyodide for CNV analysis');
    console.log('Reading BAM file into memory...');
    const arrayBuffer = await bamFile.arrayBuffer();

    console.log(`Analyzing BAM file (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB) with Python...`);

    // Call Python BAM analysis
    const result = await this.pyodide.analyzeBam(arrayBuffer, {
      windowSize: options.windowSize || 10000,
      chromosome: options.chromosome || null
    });

    // Add method identifier to result
    result.method = 'pyodide-python-single';
    result.worker_count = 1;

    // Python returns the complete result with coverageData, cnvs, etc.
    return result;
  }

  /**
   * Multi-threaded CNV analysis using worker pool
   */
  async analyzeCNVParallel(bamFile, options = {}) {
    if (!this.pyodidePool?.poolReady.value) {
      console.warn('⚠️ Worker pool not ready, falling back to single-threaded');
      return await this.analyzeCNVSingleThreaded(bamFile, options);
    }

    console.log(`🚀 Using multi-threaded worker pool (${this.pyodidePool.totalWorkers.value} workers) for CNV analysis`);
    console.log('Reading BAM file into memory...');
    const arrayBuffer = await bamFile.arrayBuffer();

    console.log(`Analyzing BAM file (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB) with ${this.pyodidePool.totalWorkers.value} workers...`);

    // Call parallel BAM analysis
    const result = await this.pyodidePool.analyzeBamParallel(arrayBuffer, {
      windowSize: options.windowSize || 10000,
      chromosome: options.chromosome || null
    });

    return result;
  }

  /**
   * Statistical analysis with Python (NumPy/SciPy)
   * This can work immediately since NumPy is already loaded
   */
  async runStatisticalAnalysis(data, analysisType) {
    if (!this.pyodide?.isReady.value) {
      throw new Error('Python environment required for advanced statistics');
    }

    const code = this.generateStatisticsCode(data, analysisType);
    return await this.pyodide.runPython(code);
  }

  /**
   * Generate Python code for statistical analysis
   */
  generateStatisticsCode(data, analysisType) {
    switch (analysisType) {
      case 'quality-distribution':
        return `
import numpy as np
import json

data = ${JSON.stringify(data)}
qualities = np.array(data['qualities'])

result = {
    'mean': float(np.mean(qualities)),
    'median': float(np.median(qualities)),
    'std': float(np.std(qualities)),
    'min': float(np.min(qualities)),
    'max': float(np.max(qualities)),
    'quartiles': [float(q) for q in np.percentile(qualities, [25, 50, 75])]
}

json.dumps(result)
        `;

      case 'coverage-stats':
        return `
import numpy as np
import json

data = ${JSON.stringify(data)}
coverage = np.array(data['coverage'])

result = {
    'mean': float(np.mean(coverage)),
    'median': float(np.median(coverage)),
    'std': float(np.std(coverage)),
    'min': float(np.min(coverage)),
    'max': float(np.max(coverage)),
    'cv': float(np.std(coverage) / np.mean(coverage)) if np.mean(coverage) > 0 else 0
}

json.dumps(result)
        `;

      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
  }

  /**
   * Check if Pyodide is available and ready
   */
  isPyodideReady() {
    return this.pyodide?.isReady.value || false;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      pyodide: {
        available: !!this.pyodide,
        ready: this.isPyodideReady(),
        initializing: this.pyodide?.isInitializing.value || false,
        progress: this.pyodide?.progress.value || 0,
        status: this.pyodide?.status.value || ''
      },
      method: 'python'
    };
  }
}

// Singleton instance
export const analysisService = new AnalysisService();
export default analysisService;
