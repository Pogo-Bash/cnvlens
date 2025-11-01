import { ref, onMounted, onUnmounted } from 'vue';

let worker = null;
let messageId = 0;
const pendingMessages = new Map();

/**
 * Vue composable for managing Pyodide Web Worker
 */
export function usePyodide() {
  const isReady = ref(false);
  const isInitializing = ref(false);
  const progress = ref(0);
  const status = ref('');
  const error = ref(null);

  /**
   * Initialize worker and Pyodide
   */
  const initialize = () => {
    if (worker) return; // Already initialized

    isInitializing.value = true;

    // Create worker
    worker = new Worker(
      new URL('../workers/pyodide.worker.js', import.meta.url),
      { type: 'module' }
    );

    // Handle messages from worker
    worker.onmessage = (event) => {
      const { type, id, result, output, error: workerError, message, progress: workerProgress } = event.data;

      // Handle status updates
      if (type === 'status') {
        status.value = message;
        if (workerProgress !== undefined) {
          progress.value = workerProgress;
        }
      }

      // Handle ready state
      if (type === 'ready') {
        isReady.value = true;
        isInitializing.value = false;
        console.log('✓ Pyodide ready');
      }

      // Handle errors
      if (type === 'error') {
        error.value = workerError;
        isInitializing.value = false;
        console.error('Pyodide error:', workerError);
      }

      // Handle package installation
      if (type === 'package-installed') {
        console.log(`✓ Package installed: ${event.data.package}`);
      }

      // Handle responses to specific messages
      if (id && pendingMessages.has(id)) {
        const { resolve, reject } = pendingMessages.get(id);
        pendingMessages.delete(id);

        if (workerError) {
          reject(new Error(workerError));
        } else {
          resolve({ result, output });
        }
      }
    };

    worker.onerror = (event) => {
      error.value = event.message;
      isInitializing.value = false;
      console.error('Worker error:', event);
    };

    // Start initialization
    sendMessage('init');
  };

  /**
   * Send message to worker and wait for response
   */
  const sendMessage = (type, payload = {}) => {
    return new Promise((resolve, reject) => {
      const id = ++messageId;

      pendingMessages.set(id, { resolve, reject });

      worker.postMessage({ type, id, payload });

      // Timeout after 60 seconds
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 60000);
    });
  };

  /**
   * Analyze BAM file
   */
  const analyzeBam = async (fileData, options = {}) => {
    if (!isReady.value) {
      throw new Error('Pyodide not ready. Please wait for initialization.');
    }

    const response = await sendMessage('analyze-bam', { fileData, options });
    return response.result;
  };

  /**
   * Run custom Python code
   */
  const runPython = async (code) => {
    if (!isReady.value) {
      throw new Error('Pyodide not ready. Please wait for initialization.');
    }

    const response = await sendMessage('run-python', { code });
    return response.output;
  };

  /**
   * Install Python package
   */
  const installPackage = async (packageName) => {
    if (!isReady.value) {
      throw new Error('Pyodide not ready. Please wait for initialization.');
    }

    const response = await sendMessage('install-package', { package: packageName });
    return response.success;
  };

  /**
   * Check if ready
   */
  const checkReady = async () => {
    if (!worker) {
      return false;
    }
    const response = await sendMessage('check-ready');
    return response.ready;
  };

  /**
   * Cleanup
   */
  const cleanup = () => {
    if (worker) {
      worker.terminate();
      worker = null;
      isReady.value = false;
      isInitializing.value = false;
    }
  };

  return {
    isReady,
    isInitializing,
    progress,
    status,
    error,
    initialize,
    analyzeBam,
    runPython,
    installPackage,
    checkReady,
    cleanup
  };
}

/**
 * Global Pyodide instance
 * Initialize once on app mount
 */
export function useGlobalPyodide() {
  const pyodide = usePyodide();

  onMounted(() => {
    // Initialize Pyodide in background when app mounts
    // This is non-blocking because it runs in a Web Worker
    pyodide.initialize();
  });

  onUnmounted(() => {
    pyodide.cleanup();
  });

  return pyodide;
}
