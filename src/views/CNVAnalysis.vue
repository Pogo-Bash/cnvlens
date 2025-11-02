<template>
  <div class="space-y-6">
    <!-- Breadcrumbs -->
    <div class="breadcrumbs text-sm">
      <ul>
        <li><router-link to="/">Home</router-link></li>
        <li>CNV Analysis</li>
      </ul>
    </div>

    <!-- Header -->
    <div>
      <h1 class="text-4xl font-bold mb-2">Copy Number Variation Analysis</h1>
      <p class="text-lg text-base-content/70">Detect gene amplifications and deletions in cancer genomes using Python + NumPy/SciPy (WASM-powered)</p>
    </div>

    <!-- Browser Compatibility Warning -->
    <BrowserCompatWarning />

    <!-- Pyodide Status (non-intrusive) -->
    <div v-if="pyodide.isInitializing.value" class="alert alert-info shadow-lg">
      <div class="flex items-center gap-2">
        <span class="loading loading-spinner loading-sm"></span>
        <div>
          <div class="font-bold">Python Environment Loading</div>
          <div class="text-xs">
            {{ pyodide.status.value }} ({{ pyodide.progress.value }}%)
          </div>
        </div>
      </div>
      <progress class="progress progress-info w-32" :value="pyodide.progress.value" max="100"></progress>
    </div>

    <div v-if="pyodide.isReady.value" class="alert alert-success shadow-lg">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div class="font-bold">🐍 Python Bioinformatics Pipeline Ready</div>
          <div class="text-xs">
            Using pure Python BAM parser + NumPy/SciPy for CNV analysis (WASM-powered)
            <span v-if="pyodidePool.poolReady.value"> | 🚀 Multi-threaded mode ({{ pyodidePool.totalWorkers.value }} workers)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Worker Pool Initialization -->
    <div v-if="pyodidePool.poolInitializing.value" class="alert alert-info shadow-lg">
      <div class="flex items-center gap-2">
        <span class="loading loading-spinner loading-sm"></span>
        <div>
          <div class="font-bold">Initializing Multi-threaded Processing</div>
          <div class="text-xs">
            Setting up {{ pyodidePool.totalWorkers.value }} worker threads... ({{ pyodidePool.workersReady.value }}/{{ pyodidePool.totalWorkers.value }} ready)
          </div>
        </div>
      </div>
    </div>

    <div v-if="pyodide.error.value" class="alert alert-error shadow-lg">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div class="font-bold">Python Environment Error</div>
          <div class="text-xs">{{ pyodide.error.value }} - Will use fallback if available</div>
        </div>
      </div>
    </div>

    <!-- Storage Info -->
    <div class="alert shadow-lg" v-if="storageInfo">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info shrink-0 w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <div class="font-bold">Storage Status</div>
          <div class="text-xs">
            Type: {{ storageInfo.storageType?.toUpperCase() || 'Unknown' }} |
            Used: {{ storageInfo.usageMB }}MB / {{ storageInfo.quotaMB }}MB ({{ storageInfo.percentUsed }}%)
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-ghost" @click="refreshStorage">Refresh</button>
        <button class="btn btn-sm btn-warning" @click="clearStorage">Clear All</button>
      </div>
    </div>

    <!-- Upload Section -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">Upload Sequencing Data</h2>

        <div class="grid grid-cols-1 gap-4">
          <!-- BAM File Upload -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Tumor BAM File</span>
              <span class="label-text-alt text-base-content/60">Required</span>
            </label>
            <input
              type="file"
              class="file-input file-input-bordered file-input-primary w-full"
              accept=".bam"
              @change="handleFileSelect"
              :disabled="analyzing"
            />
            <label class="label" v-if="selectedFile">
              <span class="label-text-alt text-success">✓ {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</span>
            </label>
          </div>

          <!-- Analysis Options -->
          <div class="divider">Analysis Options</div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Window Size -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Window Size (bp)</span>
              </label>
              <select class="select select-bordered w-full" v-model="windowSize" :disabled="analyzing">
                <option :value="5000">5,000 bp (High Resolution)</option>
                <option :value="10000">10,000 bp (Recommended)</option>
                <option :value="50000">50,000 bp (Fast)</option>
                <option :value="100000">100,000 bp (Very Fast)</option>
              </select>
              <label class="label">
                <span class="label-text-alt">Smaller windows = higher resolution but slower</span>
              </label>
            </div>

            <!-- Chromosome Selection -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Chromosome</span>
              </label>
              <select class="select select-bordered w-full" v-model="selectedChromosome" :disabled="analyzing">
                <option value="">All chromosomes</option>
                <option v-for="chr in commonChromosomes" :key="chr" :value="chr">{{ chr }}</option>
              </select>
              <label class="label">
                <span class="label-text-alt">Leave empty to analyze all</span>
              </label>
            </div>
          </div>

          <!-- CNV Detection Thresholds -->
          <div class="divider">CNV Detection Thresholds</div>

          <div class="form-control w-full mb-4">
            <label class="label cursor-pointer">
              <span class="label-text font-semibold">Use Manual Thresholds (Recommended)</span>
              <input type="checkbox" class="toggle toggle-primary" v-model="useManualThresholds" :disabled="analyzing" />
            </label>
            <label class="label">
              <span class="label-text-alt">Uncheck to use automatic adaptive thresholds based on coverage</span>
            </label>
          </div>

          <div v-if="useManualThresholds" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Amplification Threshold -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Amplification Threshold</span>
              </label>
              <input
                type="number"
                class="input input-bordered w-full"
                v-model.number="ampThreshold"
                :disabled="analyzing"
                step="0.1"
                min="1.0"
                max="5.0"
              />
              <label class="label">
                <span class="label-text-alt">Normalized coverage ratio (e.g., 1.5 = 50% above median)</span>
              </label>
            </div>

            <!-- Deletion Threshold -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Deletion Threshold</span>
              </label>
              <input
                type="number"
                class="input input-bordered w-full"
                v-model.number="delThreshold"
                :disabled="analyzing"
                step="0.1"
                min="0.1"
                max="0.9"
              />
              <label class="label">
                <span class="label-text-alt">Normalized coverage ratio (e.g., 0.5 = 50% below median)</span>
              </label>
            </div>

            <!-- Minimum Windows -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Minimum Consecutive Windows</span>
              </label>
              <input
                type="number"
                class="input input-bordered w-full"
                v-model.number="minWindows"
                :disabled="analyzing"
                min="1"
                max="20"
              />
              <label class="label">
                <span class="label-text-alt">Minimum number of windows to call a CNV</span>
              </label>
            </div>

            <!-- Reset to Defaults -->
            <div class="form-control w-full flex items-end">
              <button class="btn btn-outline btn-sm" @click="resetThresholds" :disabled="analyzing">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset to Defaults
              </button>
            </div>
          </div>

          <!-- Action Button -->
          <div class="mt-4">
            <button
              class="btn btn-primary btn-lg w-full md:w-auto"
              @click="runAnalysis"
              :disabled="!selectedFile || analyzing"
            >
              <span v-if="!analyzing">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Run CNV Detection (Python)
              </span>
              <span v-else class="loading loading-spinner"></span>
            </button>

            <div v-if="!pyodide.isReady.value && !pyodide.error.value" class="mt-2 text-sm text-info">
              ⏳ Python environment loading in background... Analysis will use Python when ready.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress Section -->
    <div class="card bg-base-100 shadow-xl" v-if="analyzing || progress.message">
      <div class="card-body">
        <h2 class="card-title">Analysis Progress</h2>

        <div class="space-y-4">
          <div>
            <div class="flex justify-between mb-2">
              <span class="text-sm font-medium">{{ progress.message }}</span>
              <span class="text-sm font-medium">{{ progress.progress }}%</span>
            </div>
            <progress
              class="progress progress-primary w-full"
              :value="progress.progress"
              max="100"
            ></progress>
          </div>

          <div class="text-sm text-base-content/70" v-if="progress.chromosome">
            Processing: {{ progress.chromosome }}
          </div>
        </div>
      </div>
    </div>

    <!-- Error Section -->
    <div class="alert alert-error" v-if="error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <h3 class="font-bold">Analysis Failed</h3>
        <div class="text-sm">{{ error }}</div>
      </div>
      <button class="btn btn-sm" @click="error = null">Dismiss</button>
    </div>

    <!-- Results Section -->
    <div v-if="results">
      <CNVVisualization
        :coverage-data="results.coverageData"
        :cnvs="results.cnvs"
        :chromosomes="results.chromosomes"
      />

      <!-- Summary Stats -->
      <div class="stats shadow w-full mt-6">
        <div class="stat">
          <div class="stat-title">Total CNVs</div>
          <div class="stat-value">{{ results.cnvs.length }}</div>
          <div class="stat-desc">Detected variations</div>
        </div>

        <div class="stat">
          <div class="stat-title">Amplifications</div>
          <div class="stat-value text-error">{{ amplificationCount }}</div>
          <div class="stat-desc">Gene duplications</div>
        </div>

        <div class="stat">
          <div class="stat-title">Deletions</div>
          <div class="stat-value text-info">{{ deletionCount }}</div>
          <div class="stat-desc">Gene losses</div>
        </div>

        <div class="stat">
          <div class="stat-title">Window Size</div>
          <div class="stat-value text-sm">{{ formatNumber(results.windowSize) }}</div>
          <div class="stat-desc">Base pairs</div>
        </div>
      </div>

      <!-- Coverage Quality Stats -->
      <div class="stats shadow w-full mt-6" v-if="results?.coverage_stats">
        <div class="stat">
          <div class="stat-title">Coverage Quality</div>
          <div class="stat-value text-sm" :class="{
            'text-error': results.coverage_stats.class === 'low',
            'text-warning': results.coverage_stats.class === 'medium',
            'text-success': results.coverage_stats.class === 'high'
          }">
            {{ results.coverage_stats.class.toUpperCase() }}
          </div>
          <div class="stat-desc">{{ results.coverage_stats.median.toFixed(1) }}x median coverage</div>
        </div>

        <div class="stat">
          <div class="stat-title">Detection Mode</div>
          <div class="stat-value text-sm">
            {{ results.coverage_stats.class === 'low' ? 'Conservative' :
               results.coverage_stats.class === 'medium' ? 'Standard' : 'Sensitive' }}
          </div>
          <div class="stat-desc">Auto-adjusted CNV thresholds</div>
        </div>

        <div class="stat">
          <div class="stat-title">Mean Coverage</div>
          <div class="stat-value text-sm">{{ results.coverage_stats.mean.toFixed(1) }}x</div>
          <div class="stat-desc">Average across all windows</div>
        </div>

        <div class="stat" v-if="results.method">
          <div class="stat-title">Processing Method</div>
          <div class="stat-value text-sm">
            {{ results.method === 'pyodide-python-parallel' ? '🚀 Multi-threaded' : '🔧 Single-threaded' }}
          </div>
          <div class="stat-desc">
            {{ results.worker_count ? `${results.worker_count} workers` : 'Main thread' }}
          </div>
        </div>
      </div>

      <!-- Export Options -->
      <div class="card bg-base-100 shadow-xl mt-6">
        <div class="card-body">
          <h2 class="card-title">Export Results</h2>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-outline btn-sm" @click="exportAsJSON">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download JSON
            </button>
            <button class="btn btn-outline btn-sm" @click="exportAsCSV">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Info Section -->
    <div class="alert" v-if="!results && !analyzing">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <div>
        <h3 class="font-bold">Getting Started</h3>
        <div class="text-sm">Upload a BAM file to detect copy number variations using Python-based read depth analysis (NumPy + SciPy running in WebAssembly).</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import CNVVisualization from '../components/CNVVisualization.vue';
import BrowserCompatWarning from '../components/BrowserCompatWarning.vue';
import { analysisService } from '../services/analysis-service.js';
import { opfsManager } from '../utils/opfs-manager.js';
import { useGlobalPyodide } from '../composables/usePyodide.js';
import { usePyodidePool } from '../composables/usePyodidePool.js';

// Initialize Pyodide in background (non-blocking)
const pyodide = useGlobalPyodide();

// Initialize worker pool for multi-threaded processing
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

// Manual threshold controls (enabled by default)
const useManualThresholds = ref(true);
const ampThreshold = ref(1.5);  // 50% above median (original default before adaptive)
const delThreshold = ref(0.5);  // 50% below median (original default before adaptive)
const minWindows = ref(3);      // Minimum consecutive windows to call CNV

// Common chromosomes
const commonChromosomes = [
  'chr1', 'chr2', 'chr3', 'chr4', 'chr5', 'chr6', 'chr7', 'chr8', 'chr9', 'chr10',
  'chr11', 'chr12', 'chr13', 'chr14', 'chr15', 'chr16', 'chr17', 'chr18', 'chr19',
  'chr20', 'chr21', 'chr22', 'chrX', 'chrY'
];

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

  // Initialize analysis service with Pyodide
  analysisService.initialize(pyodide);

  // Initialize worker pool for multi-threaded processing (in background)
  // This runs in parallel with the main Pyodide initialization
  pyodidePool.initializePool().catch(err => {
    console.warn('Worker pool initialization failed:', err);
    console.log('Will fall back to single-threaded processing');
  });

  // Pass pool to analysis service
  analysisService.initializePool(pyodidePool);

  console.log('CNV Analysis view mounted - Pyodide loading in background');
  console.log(`Multi-threaded processing will use ${pyodidePool.totalWorkers.value} workers for files >50MB`);
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
  progress.value = { message: 'Starting analysis...', progress: 0, stage: '', chromosome: '' };

  try {
    // Save to OPFS first (for persistence and debugging)
    progress.value = { message: 'Saving file to storage...', progress: 5, stage: 'saving', chromosome: '' };
    await opfsManager.writeFile(selectedFile.value.name, selectedFile.value);
    console.log(`✅ ${selectedFile.value.name} saved to OPFS for persistence`);

    // Now run the analysis (Python will use the in-memory file)
    const analysisResults = await analysisService.analyzeCNV(selectedFile.value, {
      windowSize: windowSize.value,
      chromosome: selectedChromosome.value || null,
      // Pass manual thresholds if enabled
      useManualThresholds: useManualThresholds.value,
      ampThreshold: useManualThresholds.value ? ampThreshold.value : null,
      delThreshold: useManualThresholds.value ? delThreshold.value : null,
      minWindows: useManualThresholds.value ? minWindows.value : null,
      onProgress: (p) => {
        progress.value = p;
      }
    });

    results.value = analysisResults;
    progress.value = { message: 'Complete!', progress: 100, stage: 'complete', chromosome: '' };

    // Refresh storage info
    await refreshStorage();
  } catch (err) {
    console.error('Analysis error:', err);
    error.value = err.message || 'An error occurred during analysis';
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
  if (!confirm('Are you sure you want to clear all stored files? This cannot be undone.')) {
    return;
  }

  try {
    await opfsManager.clearAll();
    await refreshStorage();
    alert('Storage cleared successfully!');
  } catch (err) {
    console.error('Failed to clear storage:', err);
    alert('Failed to clear storage: ' + err.message);
  }
}

function resetThresholds() {
  // Reset to original default values (before adaptive coverage was added)
  ampThreshold.value = 1.5;  // 50% above median
  delThreshold.value = 0.5;  // 50% below median
  minWindows.value = 3;      // 3 consecutive windows
  console.log('Thresholds reset to defaults');
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
    cnv.chromosome,
    cnv.start,
    cnv.end,
    cnv.length,
    cnv.type,
    cnv.copyNumber.toFixed(2),
    cnv.confidence
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

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

<style scoped>
/* Additional custom styles if needed */
</style>
