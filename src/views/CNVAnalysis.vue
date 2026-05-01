<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-text mb-2">copy number variation analysis</h1>
      <p class="text-subtext0 leading-relaxed">detect gene amplifications and deletions in cancer genomes using python + numpy (WASM-powered)</p>
    </div>

    <!-- Browser Compatibility Warning -->
    <BrowserCompatWarning />

    <!-- Pyodide Status -->
    <div v-if="pyodide.isInitializing.value" class="status-row">
      <span class="status-dot bg-blue animate-pulse"></span>
      <span class="text-sm text-subtext1">python environment loading — {{ pyodide.status.value }} ({{ pyodide.progress.value }}%)</span>
    </div>

    <div v-if="pyodide.isReady.value" class="status-row border-green/30">
      <span class="status-dot bg-green"></span>
      <span class="text-sm text-subtext1">
        python bioinformatics pipeline ready — pure python BAM parser + numpy
        <span v-if="pyodidePool.poolReady.value" class="text-overlay1"> | multi-threaded ({{ pyodidePool.totalWorkers.value }} workers)</span>
      </span>
    </div>

    <div v-if="pyodidePool.poolInitializing.value" class="status-row">
      <span class="status-dot bg-sapphire animate-pulse"></span>
      <span class="text-sm text-subtext1">initializing worker threads... ({{ pyodidePool.workersReady.value }}/{{ pyodidePool.totalWorkers.value }} ready)</span>
    </div>

    <div v-if="pyodide.error.value" class="status-row border-red/30">
      <span class="status-dot bg-red"></span>
      <div class="flex-1">
        <span class="text-sm text-text font-bold">python environment error</span>
        <p class="text-xs text-subtext0">{{ pyodide.error.value }} — will use fallback if available</p>
      </div>
    </div>

    <!-- Storage Info -->
    <div v-if="storageInfo" class="status-row">
      <span class="status-dot bg-blue"></span>
      <span class="text-sm text-subtext0 flex-1">
        storage: {{ storageInfo.storageType?.toUpperCase() || 'unknown' }} | {{ storageInfo.usageMB }}MB / {{ storageInfo.quotaMB }}MB ({{ storageInfo.percentUsed }}%)
      </span>
      <button class="btn-ghost px-2 py-1 text-xs" @click="refreshStorage">refresh</button>
      <button class="btn-ghost px-2 py-1 text-xs text-peach border-peach/30" @click="clearStorage">clear all</button>
    </div>

    <!-- Upload Section -->
    <div class="card-static">
      <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">upload sequencing data</h2>

      <!-- BAM File Upload -->
      <div class="mb-4">
        <label class="input-label">tumor BAM file <span class="text-overlay0 font-normal">— required</span></label>
        <input
          type="file"
          class="input-field cursor-pointer"
          accept=".bam"
          @change="handleFileSelect"
          :disabled="analyzing"
        />
        <p v-if="selectedFile" class="text-xs text-green mt-1">{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</p>
      </div>

      <!-- Analysis Options -->
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3 mt-6">analysis options</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="input-label">window size (bp)</label>
          <select class="input-field" v-model="windowSize" :disabled="analyzing">
            <option :value="5000">5,000 bp (high resolution)</option>
            <option :value="10000">10,000 bp (recommended)</option>
            <option :value="50000">50,000 bp (fast)</option>
            <option :value="100000">100,000 bp (very fast)</option>
          </select>
          <p class="input-helper">smaller windows = higher resolution but slower</p>
        </div>

        <div>
          <label class="input-label">chromosome</label>
          <select class="input-field" v-model="selectedChromosome" :disabled="analyzing">
            <option value="">all chromosomes</option>
            <option v-for="chr in commonChromosomes" :key="chr" :value="chr">{{ chr }}</option>
          </select>
          <p class="input-helper">leave empty to analyze all</p>
        </div>
      </div>

      <!-- CNV Detection Thresholds -->
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3 mt-6">cnv detection thresholds</h3>

      <div class="flex items-center gap-3 mb-4">
        <label class="input-label mb-0 cursor-pointer flex items-center gap-2">
          <input type="checkbox" class="w-4 h-4 accent-[#cba6f7] rounded" v-model="useManualThresholds" :disabled="analyzing" />
          <span>use manual thresholds (recommended)</span>
        </label>
      </div>
      <p class="input-helper -mt-2 mb-4">uncheck to use automatic adaptive thresholds based on coverage</p>

      <div v-if="useManualThresholds" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="input-label">amplification threshold</label>
          <input type="number" class="input-field" v-model.number="ampThreshold" :disabled="analyzing" step="0.1" min="1.0" max="5.0" />
          <p class="input-helper">normalized coverage ratio (e.g., 1.5 = 50% above median)</p>
        </div>

        <div>
          <label class="input-label">deletion threshold</label>
          <input type="number" class="input-field" v-model.number="delThreshold" :disabled="analyzing" step="0.1" min="0.1" max="0.9" />
          <p class="input-helper">normalized coverage ratio (e.g., 0.5 = 50% below median)</p>
        </div>

        <div>
          <label class="input-label">minimum consecutive windows</label>
          <input type="number" class="input-field" v-model.number="minWindows" :disabled="analyzing" min="1" max="20" />
          <p class="input-helper">minimum number of windows to call a CNV</p>
        </div>

        <div class="flex items-end">
          <button class="btn-ghost text-xs" @click="resetThresholds" :disabled="analyzing">reset to defaults</button>
        </div>
      </div>

      <!-- Action Button -->
      <div class="mt-6">
        <button
          class="btn-primary"
          @click="runAnalysis"
          :disabled="!selectedFile || analyzing"
        >
          <span v-if="!analyzing">run cnv detection</span>
          <span v-else class="flex items-center gap-2">
            <span class="spinner !h-4 !w-4 !border-crust !border-t-transparent"></span>
            running...
          </span>
        </button>

        <p v-if="!pyodide.isReady.value && !pyodide.error.value" class="text-xs text-overlay1 mt-2">
          python environment loading in background...
        </p>
      </div>
    </div>

    <!-- Terminal Log for Progress -->
    <TerminalLog v-if="logLines.length > 0" :lines="logLines" :running="analyzing" />

    <!-- Error Section -->
    <div v-if="error" class="status-row border-red/30">
      <span class="status-dot bg-red"></span>
      <div class="flex-1">
        <span class="text-sm text-text font-bold">analysis failed</span>
        <p class="text-xs text-subtext0">{{ error }}</p>
      </div>
      <button class="btn-ghost px-2 py-1 text-xs" @click="error = null">dismiss</button>
    </div>

    <!-- Results Section -->
    <div v-if="results" class="space-y-6">
      <CNVVisualization
        :coverage-data="results.coverageData"
        :cnvs="results.cnvs"
        :chromosomes="results.chromosomes"
      />

      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">total CNVs</p>
          <p class="text-2xl font-bold text-text mt-1">{{ results.cnvs.length }}</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">amplifications</p>
          <p class="text-2xl font-bold text-red mt-1">{{ amplificationCount }}</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">deletions</p>
          <p class="text-2xl font-bold text-blue mt-1">{{ deletionCount }}</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">window size</p>
          <p class="text-2xl font-bold text-text mt-1 font-mono">{{ formatNumber(results.windowSize) }}</p>
          <p class="text-xs text-overlay0">base pairs</p>
        </div>
      </div>

      <!-- Coverage Quality Stats -->
      <div v-if="results?.coverage_stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">coverage quality</p>
          <p class="text-lg font-bold mt-1" :class="{
            'text-red': results.coverage_stats.class === 'low',
            'text-peach': results.coverage_stats.class === 'medium',
            'text-green': results.coverage_stats.class === 'high'
          }">{{ results.coverage_stats.class }}</p>
          <p class="text-xs text-overlay0">{{ results.coverage_stats.median.toFixed(1) }}x median</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">detection mode</p>
          <p class="text-lg font-bold text-text mt-1">
            {{ results.coverage_stats.class === 'low' ? 'conservative' :
               results.coverage_stats.class === 'medium' ? 'standard' : 'sensitive' }}
          </p>
          <p class="text-xs text-overlay0">auto-adjusted thresholds</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">mean coverage</p>
          <p class="text-lg font-bold text-text mt-1 font-mono">{{ results.coverage_stats.mean.toFixed(1) }}x</p>
        </div>
        <div v-if="results.method" class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">processing</p>
          <p class="text-lg font-bold text-text mt-1">
            {{ results.method === 'pyodide-python-parallel' ? 'multi-threaded' : 'single-threaded' }}
          </p>
          <p class="text-xs text-overlay0">{{ results.worker_count ? `${results.worker_count} workers` : 'main thread' }}</p>
        </div>
      </div>

      <!-- Export Options -->
      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">export results</h2>
        <div class="flex flex-wrap gap-2">
          <button class="btn-ghost text-xs" @click="exportAsJSON">download JSON</button>
          <button class="btn-ghost text-xs" @click="exportAsCSV">download CSV</button>
        </div>
      </div>
    </div>

    <!-- Getting Started -->
    <div v-if="!results && !analyzing && logLines.length === 0" class="status-row">
      <span class="status-dot bg-blue"></span>
      <span class="text-sm text-subtext0">upload a BAM file to detect copy number variations using python-based read depth analysis.</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import CNVVisualization from '../components/CNVVisualization.vue';
import BrowserCompatWarning from '../components/BrowserCompatWarning.vue';
import TerminalLog from '../components/TerminalLog.vue';
import { analysisService } from '../services/analysis-service.js';
import { opfsManager } from '../utils/opfs-manager.js';
import { useGlobalPyodide } from '../composables/usePyodide.js';
import { usePyodidePool } from '../composables/usePyodidePool.js';

const pyodide = useGlobalPyodide();
const pyodidePool = usePyodidePool();

// State
const selectedFile = ref(null);
const windowSize = ref(10000);
const selectedChromosome = ref('');
const analyzing = ref(false);
const progress = ref({ message: '', progress: 0, stage: '', chromosome: '' });
const error = ref(null);
const results = ref(null);
const storageInfo = ref(null);
const logLines = ref([]);

// Manual threshold controls
const useManualThresholds = ref(true);
const ampThreshold = ref(1.5);
const delThreshold = ref(0.5);
const minWindows = ref(1);

// Common chromosomes
const commonChromosomes = [
  'chr1', 'chr2', 'chr3', 'chr4', 'chr5', 'chr6', 'chr7', 'chr8', 'chr9', 'chr10',
  'chr11', 'chr12', 'chr13', 'chr14', 'chr15', 'chr16', 'chr17', 'chr18', 'chr19',
  'chr20', 'chr21', 'chr22', 'chrX', 'chrY'
];

// Terminal log helper
function addLog(message, level = 'INFO') {
  const now = new Date();
  const timestamp = `[${now.toTimeString().slice(0, 8)}]`;
  logLines.value.push({ timestamp, level, message });
}

// Computed
const amplificationCount = computed(() => {
  return results.value?.cnvs.filter(c => c.type === 'amplification').length || 0;
});

const deletionCount = computed(() => {
  return results.value?.cnvs.filter(c => c.type === 'deletion').length || 0;
});

// Lifecycle
onMounted(async () => {
  await refreshStorage();

  try {
    const exists = await opfsManager.fileExists('cnv-results.json');
    if (exists) {
      const savedData = await opfsManager.readFile('cnv-results.json');
      const text = await savedData.text();
      const parsed = JSON.parse(text);
      results.value = parsed.results;
      console.log('Loaded previous CNV results from OPFS');
    }
  } catch (err) {
    console.log('No previous CNV results found');
  }

  analysisService.initialize(pyodide);

  pyodidePool.initializePool().catch(err => {
    console.warn('Worker pool initialization failed:', err);
  });

  analysisService.initializePool(pyodidePool);
});

// Methods
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
    error.value = null;
  }
}

async function runAnalysis() {
  if (!selectedFile.value) return;

  analyzing.value = true;
  error.value = null;
  results.value = null;
  logLines.value = [];
  progress.value = { message: 'Starting analysis...', progress: 0, stage: '', chromosome: '' };

  addLog(`starting CNV analysis on ${selectedFile.value.name}`);

  try {
    addLog('saving file to OPFS storage...');
    progress.value = { message: 'Saving file to storage...', progress: 5, stage: 'saving', chromosome: '' };
    await opfsManager.writeFile(selectedFile.value.name, selectedFile.value);
    addLog(`${selectedFile.value.name} saved to OPFS`);

    addLog(`window size: ${windowSize.value}bp, chromosome: ${selectedChromosome.value || 'all'}`);

    const analysisResults = await analysisService.analyzeCNV(selectedFile.value, {
      windowSize: windowSize.value,
      chromosome: selectedChromosome.value || null,
      useManualThresholds: useManualThresholds.value,
      ampThreshold: useManualThresholds.value ? ampThreshold.value : null,
      delThreshold: useManualThresholds.value ? delThreshold.value : null,
      minWindows: useManualThresholds.value ? minWindows.value : null,
      onProgress: (p) => {
        progress.value = p;
        if (p.message) addLog(p.message);
      }
    });

    results.value = analysisResults;
    progress.value = { message: 'Complete!', progress: 100, stage: 'complete', chromosome: '' };
    addLog(`complete — ${analysisResults.cnvs.length} CNVs detected`);

    try {
      await opfsManager.writeFile('cnv-results.json', JSON.stringify({
        results: analysisResults,
        timestamp: Date.now(),
        fileName: selectedFile.value.name
      }));
      addLog('results saved to OPFS');
    } catch (saveErr) {
      addLog('failed to save results to OPFS', 'WARN');
    }

    await refreshStorage();
  } catch (err) {
    console.error('Analysis error:', err);
    error.value = err.message || 'An error occurred during analysis';
    addLog(err.message || 'analysis failed', 'ERROR');
  } finally {
    analyzing.value = false;
  }
}

async function refreshStorage() {
  try {
    storageInfo.value = await opfsManager.getStorageInfo();
  } catch (err) {
    console.error('Failed to get storage info:', err);
  }
}

async function clearStorage() {
  if (!confirm('Are you sure you want to clear all stored files? This cannot be undone.')) return;

  try {
    await opfsManager.clearAll();
    results.value = null;
    await refreshStorage();
  } catch (err) {
    console.error('Failed to clear storage:', err);
  }
}

function resetThresholds() {
  ampThreshold.value = 1.5;
  delThreshold.value = 0.5;
  minWindows.value = 1;
}

function exportAsJSON() {
  if (!results.value) return;
  const data = {
    cnvs: results.value.cnvs,
    windowSize: results.value.windowSize,
    chromosomes: results.value.chromosomes,
    exportDate: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'cnv-results.json');
}

function exportAsCSV() {
  if (!results.value) return;
  const headers = ['Chromosome', 'Start', 'End', 'Length', 'Type', 'Copy Number', 'Confidence'];
  const rows = results.value.cnvs.map(cnv => [
    cnv.chromosome, cnv.start, cnv.end, cnv.length, cnv.type, cnv.copyNumber.toFixed(2), cnv.confidence
  ]);
  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, 'cnv-results.csv');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function formatNumber(num) {
  return num.toLocaleString();
}
</script>
