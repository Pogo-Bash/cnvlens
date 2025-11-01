/**
 * Analysis Service
 * Provides unified interface for genomics analysis
 * Supports both Pyodide (Python) and biowasm implementations
 */

import { cnvAnalyzer } from './cnv-analyzer.js';

// Feature flags for gradual rollout
const FEATURE_FLAGS = {
  USE_PYODIDE_FOR_CNV: false, // Keep false until Pyodide + pysam is fully tested
  USE_PYODIDE_FOR_STATS: true, // Can use Python for statistical analysis
  FALLBACK_TO_BIOWASM: true, // Fallback if Pyodide fails
};

class AnalysisService {
  constructor() {
    this.pyodide = null;
    this.biowasmCnvAnalyzer = cnvAnalyzer; // Existing biowasm CNV analyzer
  }

  /**
   * Initialize service with Pyodide instance
   */
  initialize(pyodideInstance) {
    this.pyodide = pyodideInstance;
    console.log('Analysis service initialized with Pyodide support');
  }

  /**
   * Analyze CNV from BAM file - uses best available method
   */
  async analyzeCNV(bamFile, options = {}) {
    // Try Pyodide first if enabled and ready
    if (FEATURE_FLAGS.USE_PYODIDE_FOR_CNV && this.pyodide?.isReady.value) {
      try {
        console.log('Using Pyodide for CNV analysis');
        return await this.analyzeCNVWithPyodide(bamFile, options);
      } catch (error) {
        console.error('Pyodide CNV analysis failed:', error);

        if (!FEATURE_FLAGS.FALLBACK_TO_BIOWASM) {
          throw error;
        }

        console.log('Falling back to biowasm');
      }
    }

    // Use biowasm (current working implementation)
    console.log('Using biowasm for CNV analysis');
    return await this.biowasmCnvAnalyzer.analyzeCNV(bamFile, options);
  }

  /**
   * CNV analysis with Pyodide (Python/pysam)
   * This will be implemented once pysam is available
   */
  async analyzeCNVWithPyodide(bamFile, options = {}) {
    if (!this.pyodide?.isReady.value) {
      throw new Error('Pyodide not ready');
    }

    const arrayBuffer = await bamFile.arrayBuffer();

    // For now, this is a placeholder
    // Will be replaced with full pysam implementation
    const result = await this.pyodide.analyzeBam(arrayBuffer, options);

    return {
      ...result,
      method: 'pyodide',
      note: 'Full pysam CNV analysis coming soon'
    };
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
   * Check if biowasm is available
   */
  isBiowasmAvailable() {
    return !!this.biowasmCnvAnalyzer;
  }

  /**
   * Get current analysis method
   */
  getCurrentMethod() {
    if (FEATURE_FLAGS.USE_PYODIDE_FOR_CNV && this.isPyodideReady()) {
      return 'pyodide';
    }
    return 'biowasm';
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
      biowasm: {
        available: this.isBiowasmAvailable(),
        initialized: this.biowasmCnvAnalyzer?.initialized || false
      },
      currentMethod: this.getCurrentMethod(),
      featureFlags: FEATURE_FLAGS
    };
  }
}

// Singleton instance
export const analysisService = new AnalysisService();
export default analysisService;
