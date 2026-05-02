<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-text mb-2">diagnostics & benchmarking</h1>
      <p class="text-subtext0 leading-relaxed">run benchmarks on the bundled NA12878 sample data and inspect timing/warnings output</p>
    </div>

    <!-- Pyodide Status -->
    <div v-if="pyodide.isInitializing.value" class="status-row">
      <span class="status-dot bg-blue animate-pulse"></span>
      <span class="text-sm text-subtext1">python environment loading — {{ pyodide.status.value }} ({{ pyodide.progress.value }}%)</span>
    </div>

    <div v-if="pyodide.isReady.value" class="status-row border-green/30">
      <span class="status-dot bg-green"></span>
      <span class="text-sm text-subtext1">python environment ready</span>
    </div>

    <!-- Benchmark Controls -->
    <div class="card-static">
      <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">benchmark</h2>
      <p class="text-xs text-subtext0 mb-4">Loads the bundled NA12878 EGFR sample (5.7MB) and runs variant calling + CNV analysis. Reports timing for each phase.</p>

      <div class="flex gap-3">
        <button
          class="btn-primary"
          @click="runBenchmark"
          :disabled="running || !pyodide.isReady.value"
        >
          <span v-if="!running">run benchmark (1x)</span>
          <span v-else class="flex items-center gap-2">
            <span class="spinner !h-4 !w-4 !border-crust !border-t-transparent"></span>
            running...
          </span>
        </button>

        <button
          class="btn-ghost"
          @click="runBenchmarkMulti"
          :disabled="running || !pyodide.isReady.value"
        >
          run 3x (median)
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="benchmarkResults" class="space-y-6">
      <!-- Timing -->
      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">timing results</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p class="text-xs text-overlay1">variant calling</p>
            <p class="text-xl font-bold font-mono text-text">{{ formatTime(benchmarkResults.variantTime) }}</p>
          </div>
          <div>
            <p class="text-xs text-overlay1">CNV analysis</p>
            <p class="text-xl font-bold font-mono text-text">{{ formatTime(benchmarkResults.cnvTime) }}</p>
          </div>
          <div>
            <p class="text-xs text-overlay1">total</p>
            <p class="text-xl font-bold font-mono text-mauve">{{ formatTime(benchmarkResults.totalTime) }}</p>
          </div>
          <div>
            <p class="text-xs text-overlay1">variants found</p>
            <p class="text-lg font-bold text-text">{{ benchmarkResults.variantCount }}</p>
          </div>
          <div>
            <p class="text-xs text-overlay1">CNVs found</p>
            <p class="text-lg font-bold text-text">{{ benchmarkResults.cnvCount }}</p>
          </div>
          <div v-if="benchmarkResults.runs > 1">
            <p class="text-xs text-overlay1">runs (median)</p>
            <p class="text-lg font-bold text-text">{{ benchmarkResults.runs }}x</p>
          </div>
        </div>
      </div>

      <!-- Warnings -->
      <div v-if="benchmarkResults.warnings.length > 0" class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">warnings</h2>
        <ul class="text-xs text-subtext0 list-disc list-inside space-y-1">
          <li v-for="(w, i) in benchmarkResults.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <!-- Reference Mode -->
      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">analysis details</h2>
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span class="text-overlay1">reference mode:</span>
            <span class="text-text ml-2">{{ benchmarkResults.referenceUsed }}</span>
          </div>
          <div>
            <span class="text-overlay1">BAI index:</span>
            <span class="text-text ml-2">{{ benchmarkResults.usedBai ? 'yes' : 'no' }}</span>
          </div>
          <div>
            <span class="text-overlay1">CNV method:</span>
            <span class="text-text ml-2">{{ benchmarkResults.cnvMethod }}</span>
          </div>
          <div>
            <span class="text-overlay1">GC corrected:</span>
            <span class="text-text ml-2">{{ benchmarkResults.gcCorrected ? 'yes' : 'no' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Terminal Log -->
    <div v-if="logLines.length > 0" class="card-static">
      <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">console output</h2>
      <div class="font-mono text-xs text-subtext0 max-h-64 overflow-y-auto space-y-0.5 bg-mantle p-3 rounded">
        <div v-for="(line, i) in logLines" :key="i">{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useGlobalPyodide } from '../composables/usePyodide.js';

const pyodide = useGlobalPyodide();

const running = ref(false);
const benchmarkResults = ref(null);
const logLines = ref([]);

function formatTime(seconds) {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
}

async function loadSampleData() {
  const base = import.meta.env.BASE_URL;
  const [bamRes, baiRes] = await Promise.all([
    fetch(base + 'sample-data/NA12878_EGFR.bam'),
    fetch(base + 'sample-data/NA12878_EGFR.bam.bai')
  ]);
  if (!bamRes.ok) throw new Error('Failed to fetch sample BAM');
  const bamData = await bamRes.arrayBuffer();
  const baiData = baiRes.ok ? await baiRes.arrayBuffer() : null;
  return { bamData, baiData };
}

async function runOnce(bamData, baiData) {
  // Variant calling
  const t1 = performance.now();
  const variantResult = await pyodide.callVariants(bamData, {
    chromosomes: ['7'],
    minDepth: 10,
    minBaseQuality: 20,
    minMappingQuality: 20,
    minVariantReads: 3,
    minAlleleFreq: 0.05,
    minStrandBias: 0.1,
    baiData
  });
  const t2 = performance.now();

  // CNV analysis
  const cnvResult = await pyodide.analyzeBam(bamData, {
    windowSize: 10000,
    chromosomes: ['7'],
    baiData
  });
  const t3 = performance.now();

  return {
    variantTime: (t2 - t1) / 1000,
    cnvTime: (t3 - t2) / 1000,
    totalTime: (t3 - t1) / 1000,
    variantCount: variantResult.total_variants,
    cnvCount: cnvResult.cnvs?.length || 0,
    warnings: [...(variantResult.warnings || []), ...(cnvResult.warnings || [])],
    referenceUsed: variantResult.reference_used || 'unknown',
    usedBai: !!baiData,
    cnvMethod: cnvResult.thresholds_used?.mode || 'unknown',
    gcCorrected: cnvResult.gc_corrected || false,
    runs: 1
  };
}

async function runBenchmark() {
  running.value = true;
  logLines.value = [];
  benchmarkResults.value = null;

  try {
    logLines.value.push('Loading sample data...');
    const { bamData, baiData } = await loadSampleData();
    logLines.value.push(`Loaded ${(bamData.byteLength / 1024 / 1024).toFixed(1)}MB BAM + ${baiData ? (baiData.byteLength / 1024).toFixed(0) + 'KB BAI' : 'no BAI'}`);

    logLines.value.push('Running benchmark...');
    const result = await runOnce(bamData, baiData);

    logLines.value.push(`Variant calling: ${formatTime(result.variantTime)}`);
    logLines.value.push(`CNV analysis: ${formatTime(result.cnvTime)}`);
    logLines.value.push(`Total: ${formatTime(result.totalTime)}`);
    logLines.value.push(`Found ${result.variantCount} variants, ${result.cnvCount} CNVs`);

    benchmarkResults.value = result;
  } catch (err) {
    logLines.value.push(`ERROR: ${err.message}`);
  } finally {
    running.value = false;
  }
}

async function runBenchmarkMulti() {
  running.value = true;
  logLines.value = [];
  benchmarkResults.value = null;

  try {
    logLines.value.push('Loading sample data...');
    const { bamData, baiData } = await loadSampleData();
    logLines.value.push(`Loaded ${(bamData.byteLength / 1024 / 1024).toFixed(1)}MB BAM`);

    const times = [];
    for (let i = 0; i < 3; i++) {
      logLines.value.push(`Run ${i + 1}/3...`);
      const result = await runOnce(bamData, baiData);
      times.push(result);
      logLines.value.push(`  Total: ${formatTime(result.totalTime)}`);
    }

    // Take median by total time
    times.sort((a, b) => a.totalTime - b.totalTime);
    const median = times[1];
    median.runs = 3;

    logLines.value.push(`Median total: ${formatTime(median.totalTime)}`);
    benchmarkResults.value = median;
  } catch (err) {
    logLines.value.push(`ERROR: ${err.message}`);
  } finally {
    running.value = false;
  }
}
</script>
