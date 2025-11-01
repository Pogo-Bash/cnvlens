/**
 * Analysis Service
 * Provides unified interface for genomics analysis
 * Uses Pyodide (Python) for all bioinformatics analysis
 */

class AnalysisService {
  constructor() {
    this.pyodide = null;
  }

  /**
   * Initialize service with Pyodide instance
   */
  initialize(pyodideInstance) {
    this.pyodide = pyodideInstance;
    console.log('Analysis service initialized with Pyodide support');
  }

  /**
   * Analyze CNV from BAM file using Python
   */
  async analyzeCNV(bamFile, options = {}) {
    if (!this.pyodide?.isReady.value) {
      throw new Error('Python environment not ready. Please wait for initialization to complete.');
    }

    console.log('Using Pyodide for CNV analysis');
    console.log('Reading BAM file into memory...');
    const arrayBuffer = await bamFile.arrayBuffer();

    console.log(`Analyzing BAM file (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB) with Python...`);

    // Call Python BAM analysis
    const result = await this.pyodide.analyzeBam(arrayBuffer, {
      windowSize: options.windowSize || 10000,
      chromosome: options.chromosome || null
    });

    // Python returns the complete result with coverageData, cnvs, etc.
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
