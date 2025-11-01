/**
 * Pyodide Web Worker
 * Loads Python environment in background without blocking main thread
 * Provides pysam-based BAM analysis for genomics data
 */

let pyodide = null;
let isInitialized = false;
let initializationPromise = null;

/**
 * Initialize Pyodide environment
 */
async function initializePyodide() {
  if (isInitialized) return pyodide;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      self.postMessage({
        type: 'status',
        message: 'Loading Python runtime...',
        progress: 10
      });

      // Import Pyodide using importScripts (classic worker)
      // This is the standard way to load Pyodide in workers
      importScripts('/pyodide/pyodide.js');

      self.postMessage({
        type: 'status',
        message: 'Initializing Python interpreter...',
        progress: 30
      });

      pyodide = await self.loadPyodide({
        indexURL: '/pyodide/',
        fullStdLib: false, // Only load stdlib on demand
      });

      self.postMessage({
        type: 'status',
        message: 'Loading bioinformatics packages...',
        progress: 50
      });

      // Load required packages from Pyodide CDN
      await pyodide.loadPackage('micropip');

      self.postMessage({
        type: 'status',
        message: 'Loading NumPy...',
        progress: 60
      });
      await pyodide.loadPackage('numpy');

      // Note: pysam and biopython may need to be loaded via micropip
      // if not available in the standard Pyodide package index
      self.postMessage({
        type: 'status',
        message: 'Setting up environment...',
        progress: 90
      });

      // Set up basic Python environment
      await pyodide.runPythonAsync(`
import numpy as np
import sys
print(f"Python {sys.version} initialized in worker")
print(f"NumPy {np.__version__} loaded")
      `);

      self.postMessage({
        type: 'status',
        message: 'Python environment ready!',
        progress: 100
      });

      isInitialized = true;

      self.postMessage({
        type: 'ready',
        timestamp: Date.now()
      });

      console.log('✓ Pyodide initialized in worker');
      return pyodide;

    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Process BAM file with Python analysis
 * This is a simplified version - full pysam integration requires pysam package
 */
async function analyzeBamFile(fileData, options = {}) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    // For now, we'll do basic analysis with NumPy
    // Once pysam is available, this will be replaced with full BAM parsing

    const result = await pyodide.runPythonAsync(`
import numpy as np
import json

# Simplified BAM analysis
# In production, this will use pysam for full BAM parsing
def analyze_bam_simple():
    # Mock data for now - will be replaced with actual pysam analysis
    result = {
        'status': 'Python analysis running',
        'numpy_version': np.__version__,
        'note': 'Full pysam integration coming next',
        'file_size': ${fileData.byteLength}
    }

    # Demonstrate NumPy capability
    test_array = np.array([1, 2, 3, 4, 5])
    result['numpy_test'] = {
        'mean': float(np.mean(test_array)),
        'std': float(np.std(test_array)),
        'sum': int(np.sum(test_array))
    }

    return json.dumps(result)

analyze_bam_simple()
    `);

    return JSON.parse(result);

  } catch (error) {
    throw new Error(`BAM analysis failed: ${error.message}`);
  }
}

/**
 * Run custom Python code
 */
async function runPythonCode(code) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    const result = await pyodide.runPythonAsync(code);

    // Convert Python objects to JS
    if (result && typeof result.toJs === 'function') {
      return result.toJs();
    }

    return result;
  } catch (error) {
    throw new Error(`Python execution failed: ${error.message}`);
  }
}

/**
 * Install Python package via micropip
 */
async function installPackage(packageName) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    self.postMessage({
      type: 'status',
      message: `Installing ${packageName}...`
    });

    const micropip = pyodide.pyimport('micropip');
    await micropip.install(packageName);

    self.postMessage({
      type: 'package-installed',
      package: packageName
    });

    return true;
  } catch (error) {
    throw new Error(`Failed to install ${packageName}: ${error.message}`);
  }
}

/**
 * Message handler
 */
self.onmessage = async (event) => {
  const { type, id, payload } = event.data;

  try {
    switch (type) {
      case 'init':
        await initializePyodide();
        self.postMessage({ type: 'init-response', id, success: true });
        break;

      case 'analyze-bam':
        const result = await analyzeBamFile(payload.fileData, payload.options);
        self.postMessage({
          type: 'analyze-bam-response',
          id,
          result
        });
        break;

      case 'run-python':
        const output = await runPythonCode(payload.code);
        self.postMessage({
          type: 'run-python-response',
          id,
          output
        });
        break;

      case 'install-package':
        await installPackage(payload.package);
        self.postMessage({
          type: 'install-package-response',
          id,
          success: true
        });
        break;

      case 'check-ready':
        self.postMessage({
          type: 'check-ready-response',
          id,
          ready: isInitialized
        });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message,
      stack: error.stack
    });
  }
};

console.log('Pyodide worker loaded and ready');
