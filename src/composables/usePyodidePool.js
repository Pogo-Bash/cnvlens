/**
 * Multi-threaded Pyodide Worker Pool
 * Enables parallel BAM processing across multiple CPU cores
 */

import { ref, computed } from 'vue';

const WORKER_COUNT = Math.min(navigator.hardwareConcurrency || 4, 4); // Max 4 workers

let workers = [];
let nextWorkerId = 0;

export function usePyodidePool() {
  const poolReady = ref(false);
  const poolInitializing = ref(false);
  const workersReady = ref(0);
  const totalWorkers = ref(WORKER_COUNT);

  /**
   * Initialize worker pool
   */
  const initializePool = async () => {
    if (poolReady.value || poolInitializing.value) return;

    poolInitializing.value = true;
    console.log(`🚀 Initializing worker pool with ${WORKER_COUNT} workers...`);

    const initPromises = [];

    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = new Worker(
        new URL('../workers/pyodide.worker.js?worker', import.meta.url)
      );

      const initPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${i} initialization timeout`));
        }, 60000);

        worker.onmessage = (event) => {
          if (event.data.type === 'ready') {
            clearTimeout(timeout);
            workersReady.value++;
            console.log(`✓ Worker ${i} ready (${workersReady.value}/${WORKER_COUNT})`);
            resolve();
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`✗ Worker ${i} error:`, error);
          reject(error);
        };

        // Initialize worker
        worker.postMessage({ type: 'init' });
      });

      workers[i] = {
        worker,
        id: i,
        busy: false
      };

      initPromises.push(initPromise);
    }

    try {
      await Promise.all(initPromises);
      poolReady.value = true;
      poolInitializing.value = false;
      console.log(`✅ Worker pool ready with ${WORKER_COUNT} workers`);
    } catch (error) {
      poolInitializing.value = false;
      console.error('❌ Worker pool initialization failed:', error);
      throw error;
    }
  };

  /**
   * Split BAM file into chunks for parallel processing
   */
  const splitBamIntoChunks = (bamData, chunkCount) => {
    const totalSize = bamData.byteLength;
    const chunkSize = Math.ceil(totalSize / chunkCount);
    const chunks = [];

    console.log(`Splitting ${(totalSize / 1024 / 1024).toFixed(2)} MB BAM file into ${chunkCount} chunks`);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);

      // Create a copy of the chunk (each worker gets its own data)
      const chunk = bamData.slice(start, end);

      chunks.push({
        id: i,
        data: chunk,
        start,
        end,
        size: end - start
      });

      console.log(`  Chunk ${i}: ${start}-${end} (${((end - start) / 1024 / 1024).toFixed(2)} MB)`);
    }

    return chunks;
  };

  /**
   * Process BAM file in parallel across worker pool
   */
  const analyzeBamParallel = async (bamData, options = {}) => {
    if (!poolReady.value) {
      throw new Error('Worker pool not ready. Call initializePool() first.');
    }

    const chunks = splitBamIntoChunks(bamData, WORKER_COUNT);

    console.log(`📊 Starting parallel BAM analysis across ${WORKER_COUNT} workers...`);

    // Process each chunk in parallel
    const processingPromises = chunks.map((chunk, index) => {
      return processChunk(workers[index].worker, chunk, options, index);
    });

    // Wait for all workers to complete
    const results = await Promise.all(processingPromises);

    console.log(`✓ All workers completed, merging results...`);

    // Merge results from all workers
    const merged = mergeResults(results, options);

    console.log(`✅ Parallel analysis complete`);

    return merged;
  };

  /**
   * Process a single chunk on a worker
   */
  const processChunk = (worker, chunk, options, workerIndex) => {
    return new Promise((resolve, reject) => {
      const messageId = ++nextWorkerId;

      const onMessage = (event) => {
        const { type, id, result, error } = event.data;

        if (id === messageId) {
          worker.removeEventListener('message', onMessage);

          if (error) {
            console.error(`Worker ${workerIndex} error:`, error);
            reject(new Error(error));
          } else if (type === 'analyze-bam-response') {
            console.log(`✓ Worker ${workerIndex} completed chunk ${chunk.id}`);
            resolve(result);
          }
        }

        // Progress updates
        if (type === 'analysis-progress') {
          console.log(`Worker ${workerIndex}: ${event.data.message}`);
        }
      };

      worker.addEventListener('message', onMessage);

      // Send chunk to worker for processing
      worker.postMessage({
        type: 'analyze-bam',
        id: messageId,
        payload: {
          fileData: chunk.data,
          options: {
            windowSize: options.windowSize || 10000,
            chromosome: options.chromosome || null,
            chunkId: chunk.id,
            totalChunks: WORKER_COUNT
          }
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        reject(new Error(`Worker ${workerIndex} timeout processing chunk ${chunk.id}`));
      }, 300000);
    });
  };

  /**
   * Merge coverage results from multiple workers
   */
  const mergeResults = (results, options) => {
    console.log(`Merging results from ${results.length} workers...`);

    // Combine coverage data from all workers
    const allWindows = [];
    let totalReads = 0;
    const chromosomes = new Set();

    results.forEach((result, i) => {
      if (result.error) {
        console.error(`Worker ${i} returned error:`, result.error);
        return;
      }

      allWindows.push(...(result.coverageData || []));
      totalReads += result.total_reads || 0;

      if (result.chromosomes) {
        result.chromosomes.forEach(chr => chromosomes.add(chr));
      }
    });

    console.log(`  Total windows: ${allWindows.length}`);
    console.log(`  Total reads: ${totalReads.toLocaleString()}`);
    console.log(`  Chromosomes: ${chromosomes.size}`);

    // Merge overlapping windows by chromosome and position
    const windowMap = new Map();

    allWindows.forEach(window => {
      const key = `${window.chromosome}:${window.start}`;

      if (windowMap.has(key)) {
        // Add coverage from this window to existing
        const existing = windowMap.get(key);
        existing.coverage += window.coverage;
      } else {
        windowMap.set(key, { ...window });
      }
    });

    const mergedWindows = Array.from(windowMap.values());
    console.log(`  Merged to: ${mergedWindows.length} unique windows`);

    // Recalculate normalization and CNV detection on merged data
    const coverages = mergedWindows
      .map(w => w.coverage)
      .filter(c => c > 0);

    if (coverages.length === 0) {
      return { error: 'No coverage data after merging' };
    }

    // Calculate median (simple approach, could use quickselect for large datasets)
    const sorted = coverages.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = coverages.reduce((sum, c) => sum + c, 0) / coverages.length;

    console.log(`  Median coverage: ${median.toFixed(1)}x`);
    console.log(`  Mean coverage: ${mean.toFixed(1)}x`);

    // Classify coverage
    let coverageClass;
    if (median < 15) {
      coverageClass = 'low';
    } else if (median < 30) {
      coverageClass = 'medium';
    } else {
      coverageClass = 'high';
    }

    // Normalize all windows
    mergedWindows.forEach(w => {
      w.normalized = median > 0 ? w.coverage / median : 0;
    });

    // Run CNV detection on merged, normalized data
    // (We'll use a simple threshold-based approach here)
    // In production, you might want to send this back to a worker
    const cnvs = detectCNVsFromWindows(mergedWindows, coverageClass, median);

    return {
      total_reads: totalReads,
      coverageData: mergedWindows,
      cnvs: cnvs,
      windowSize: options.windowSize || 10000,
      chromosomes: Array.from(chromosomes),
      method: 'pyodide-python-parallel',
      coverage_stats: {
        median: median,
        mean: mean,
        class: coverageClass
      },
      worker_count: results.length
    };
  };

  /**
   * Simple CNV detection from merged windows
   * (Mimics the Python detection logic)
   */
  const detectCNVsFromWindows = (windows, coverageClass, median) => {
    // Set thresholds based on coverage class
    let ampThreshold, delThreshold, minWindows;

    if (coverageClass === 'low') {
      ampThreshold = 2.0;
      delThreshold = 0.3;
      minWindows = 5;
    } else if (coverageClass === 'medium') {
      ampThreshold = 1.5;
      delThreshold = 0.5;
      minWindows = 3;
    } else {
      ampThreshold = 1.3;
      delThreshold = 0.7;
      minWindows = 2;
    }

    const cnvs = [];
    let currentCnv = null;

    // Sort windows by chromosome and position
    const sortedWindows = windows.slice().sort((a, b) => {
      if (a.chromosome !== b.chromosome) {
        return a.chromosome.localeCompare(b.chromosome);
      }
      return a.start - b.start;
    });

    sortedWindows.forEach(window => {
      const norm = window.normalized;
      const isAmp = norm >= ampThreshold;
      const isDel = norm <= delThreshold && norm > 0;

      if (isAmp || isDel) {
        const cnvType = isAmp ? 'amplification' : 'deletion';

        if (currentCnv &&
            currentCnv.type === cnvType &&
            currentCnv.chromosome === window.chromosome &&
            window.start === currentCnv.end) {
          // Extend current CNV
          currentCnv.end = window.end;
          currentCnv.windows.push(window);
        } else {
          // Close previous CNV if it meets minimum length
          if (currentCnv && currentCnv.windows.length >= minWindows) {
            cnvs.push(summarizeCnv(currentCnv, median, coverageClass));
          }

          // Start new CNV
          currentCnv = {
            chromosome: window.chromosome,
            start: window.start,
            end: window.end,
            type: cnvType,
            windows: [window]
          };
        }
      } else {
        // Close current CNV if it meets minimum length
        if (currentCnv && currentCnv.windows.length >= minWindows) {
          cnvs.push(summarizeCnv(currentCnv, median, coverageClass));
        }
        currentCnv = null;
      }
    });

    // Close last CNV
    if (currentCnv && currentCnv.windows.length >= minWindows) {
      cnvs.push(summarizeCnv(currentCnv, median, coverageClass));
    }

    console.log(`  Detected ${cnvs.length} CNVs`);
    return cnvs;
  };

  /**
   * Summarize CNV with confidence scoring
   */
  const summarizeCnv = (cnv, median, coverageClass) => {
    const coverages = cnv.windows.map(w => w.coverage);
    const normalized = cnv.windows.map(w => w.normalized);

    const avgCov = coverages.reduce((sum, c) => sum + c, 0) / coverages.length;
    const avgNorm = normalized.reduce((sum, n) => sum + n, 0) / normalized.length;

    // Calculate standard deviation
    const mean = avgNorm;
    const variance = normalized.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / normalized.length;
    const stdDev = Math.sqrt(variance);

    // Confidence scoring
    let confidence;
    if (coverageClass === 'low') {
      if (cnv.windows.length >= 10 && stdDev < 0.3) confidence = 'high';
      else if (cnv.windows.length >= 5 && stdDev < 0.5) confidence = 'medium';
      else confidence = 'low';
    } else if (coverageClass === 'medium') {
      if (cnv.windows.length >= 7 && stdDev < 0.3) confidence = 'high';
      else if (cnv.windows.length >= 3 && stdDev < 0.5) confidence = 'medium';
      else confidence = 'low';
    } else {
      if (cnv.windows.length >= 5 && stdDev < 0.4) confidence = 'high';
      else if (cnv.windows.length >= 2 && stdDev < 0.6) confidence = 'medium';
      else confidence = 'low';
    }

    return {
      chromosome: cnv.chromosome,
      start: cnv.start,
      end: cnv.end,
      length: cnv.end - cnv.start,
      type: cnv.type,
      avgCoverage: avgCov,
      copyNumber: avgNorm * 2,
      confidence: confidence,
      num_windows: cnv.windows.length
    };
  };

  /**
   * Cleanup worker pool
   */
  const cleanup = () => {
    workers.forEach(({ worker }) => {
      worker.terminate();
    });
    workers = [];
    poolReady.value = false;
    workersReady.value = 0;
    console.log('Worker pool cleaned up');
  };

  return {
    poolReady,
    poolInitializing,
    workersReady,
    totalWorkers,
    initializePool,
    analyzeBamParallel,
    cleanup
  };
}
