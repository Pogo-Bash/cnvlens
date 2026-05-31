import { ref, onMounted, onUnmounted } from 'vue';

let worker = null;
let messageId = 0;
const pendingMessages = new Map();

/**
 * Vue composable managing the Rust/WASM compute worker.
 * Same public shape the views relied on previously (isReady, analyzeBam,
 * callVariants, ...), now backed by WebAssembly instead of Pyodide.
 */
export function useWasm() {
  const isReady = ref(false);
  const isInitializing = ref(false);
  const progress = ref(0);
  const status = ref('');
  const error = ref(null);

  const initialize = () => {
    if (worker) return;

    isInitializing.value = true;
    status.value = 'loading WASM module';

    // Module worker so it can `import` the wasm-bindgen glue (Vite bundles it).
    worker = new Worker(new URL('../workers/cnvlens.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const { type, id, result, error: workerError } = event.data;

      if (type === 'ready') {
        isReady.value = true;
        isInitializing.value = false;
        progress.value = 100;
        status.value = 'ready';
        console.log('✓ WASM engine ready');
      }

      if (id && pendingMessages.has(id)) {
        const { resolve, reject } = pendingMessages.get(id);
        pendingMessages.delete(id);
        if (workerError) {
          reject(new Error(workerError));
        } else {
          resolve({ result });
        }
      }
    };

    worker.onerror = (event) => {
      error.value = event.message;
      isInitializing.value = false;
      console.error('WASM worker error:', event);
    };

    sendMessage('init');
  };

  const sendMessage = (type, payload = {}) => {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      pendingMessages.set(id, { resolve, reject });
      worker.postMessage({ type, id, payload });
    });
  };

  /**
   * Coverage + CNV analysis.
   * @param {ArrayBuffer} fileData - BAM file data
   * @param {Object} options - { windowSize, chromosome, chromosomes, baiData,
   *   referenceSeqs, segmentationMethod, useManualThresholds, ... }
   */
  const analyzeBam = async (fileData, options = {}) => {
    if (!isReady.value) throw new Error('WASM engine not ready.');
    const response = await sendMessage('analyze-bam', { fileData, options });
    return response.result;
  };

  /**
   * SNV variant calling.
   * @param {ArrayBuffer} fileData - BAM file data
   * @param {Object} options - { chromosomes, minDepth, minBaseQuality,
   *   minMappingQuality, minVariantReads, minAlleleFreq, minStrandBias,
   *   baiData, referenceSeqs }
   */
  const callVariants = async (fileData, options = {}) => {
    if (!isReady.value) throw new Error('WASM engine not ready.');
    const response = await sendMessage('call-variants', { fileData, options });
    return response.result;
  };

  const checkReady = async () => {
    if (!worker) return false;
    const response = await sendMessage('check-ready');
    return response.result?.ready ?? false;
  };

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
    callVariants,
    checkReady,
    cleanup,
  };
}

/**
 * Global WASM engine instance. Initialize once on app mount.
 */
export function useGlobalWasm() {
  const engine = useWasm();

  onMounted(() => {
    engine.initialize();
  });

  onUnmounted(() => {
    engine.cleanup();
  });

  return engine;
}
