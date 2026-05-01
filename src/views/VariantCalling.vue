<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-text mb-2">variant calling pipeline</h1>
      <p class="text-subtext0 leading-relaxed">detect somatic mutations in lung cancer samples using python-powered pileup analysis (WASM)</p>
    </div>

    <!-- Browser Compatibility Warning -->
    <BrowserCompatWarning />

    <!-- Pyodide Status -->
    <div v-if="variantCaller.isInitializing.value" class="status-row">
      <span class="status-dot bg-blue animate-pulse"></span>
      <div class="flex-1">
        <span class="text-sm text-subtext1">python environment loading — {{ variantCaller.status.value }} ({{ variantCaller.progress.value }}%)</span>
      </div>
    </div>

    <div v-if="variantCaller.isReady.value" class="status-row border-green/30">
      <span class="status-dot bg-green"></span>
      <span class="text-sm text-subtext1">python variant calling ready — pileup + numpy (WASM)</span>
    </div>

    <div v-if="variantCaller.error.value" class="status-row border-red/30">
      <span class="status-dot bg-red"></span>
      <div class="flex-1">
        <span class="text-sm text-text font-bold">python environment error</span>
        <p class="text-xs text-subtext0">{{ variantCaller.error.value }}</p>
      </div>
    </div>

    <!-- Storage Info -->
    <div v-if="storageInfo" class="status-row">
      <span class="status-dot bg-blue"></span>
      <span class="text-sm text-subtext0 flex-1">storage: {{ storageInfo.usageMB }}MB / {{ storageInfo.quotaMB }}MB ({{ storageInfo.percentUsed }}%)</span>
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
          :disabled="analyzing || loadingSample"
        />
        <p v-if="selectedFile" class="text-xs text-green mt-1">{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</p>
      </div>

      <!-- Sample Data -->
      <div class="mb-4">
        <button
          class="btn-ghost text-xs"
          @click="loadSampleData"
          :disabled="analyzing || loadingSample"
        >
          <span v-if="!loadingSample">try with sample data</span>
          <span v-else class="flex items-center gap-2">
            <span class="spinner !h-3 !w-3 !border-subtext0 !border-t-transparent"></span>
            loading sample...
          </span>
        </button>
        <p class="text-xs text-overlay0 mt-1">NA12878 exome — EGFR region (chr7, GRCh37). 2.4MB, ~57x in captured exons. ~20-40s to analyze.</p>
      </div>

      <!-- Filters -->
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3 mt-6">variant calling filters</h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="input-label">min depth</label>
          <input type="number" class="input-field" v-model.number="minDepth" :disabled="analyzing" min="1" />
          <p class="input-helper">minimum read depth</p>
        </div>

        <div>
          <label class="input-label">min base quality</label>
          <input type="number" class="input-field" v-model.number="minBaseQuality" :disabled="analyzing" min="0" max="60" />
          <p class="input-helper">phred quality score</p>
        </div>

        <div>
          <label class="input-label">min mapping quality</label>
          <input type="number" class="input-field" v-model.number="minMappingQuality" :disabled="analyzing" min="0" max="60" />
          <p class="input-helper">read mapping quality</p>
        </div>

        <div>
          <label class="input-label">min variant reads</label>
          <input type="number" class="input-field" v-model.number="minVariantReads" :disabled="analyzing" min="1" />
          <p class="input-helper">supporting reads</p>
        </div>

        <div>
          <label class="input-label">min allele freq</label>
          <input type="number" class="input-field" v-model.number="minAlleleFreq" :disabled="analyzing" min="0" max="1" step="0.01" />
          <p class="input-helper">variant allele frequency</p>
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

      <!-- Action Button -->
      <div class="mt-6">
        <button
          class="btn-primary"
          @click="runVariantCalling"
          :disabled="!selectedFile || analyzing"
        >
          <span v-if="!analyzing">call variants</span>
          <span v-else class="flex items-center gap-2">
            <span class="spinner !h-4 !w-4 !border-crust !border-t-transparent"></span>
            running...
          </span>
        </button>

        <p v-if="!variantCaller.isReady.value && !variantCaller.error.value" class="text-xs text-overlay1 mt-2">
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
        <span class="text-sm text-text font-bold">variant calling failed</span>
        <p class="text-xs text-subtext0">{{ error }}</p>
      </div>
      <button class="btn-ghost px-2 py-1 text-xs" @click="error = null">dismiss</button>
    </div>

    <!-- Results Section -->
    <div v-if="results" class="space-y-6">
      <!-- Summary Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">total variants</p>
          <p class="text-2xl font-bold text-text mt-1">{{ results.total_variants }}</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">SNVs</p>
          <p class="text-2xl font-bold text-mauve mt-1">{{ snvCount }}</p>
        </div>
        <div class="card-static opacity-50">
          <p class="text-xs text-overlay1 uppercase tracking-wider">indels</p>
          <p class="text-2xl font-bold text-overlay0 mt-1">n/a</p>
          <p class="text-xs text-overlay0">not implemented</p>
        </div>
        <div class="card-static">
          <p class="text-xs text-overlay1 uppercase tracking-wider">chromosomes</p>
          <p class="text-2xl font-bold text-text mt-1">{{ results.chromosomes_processed?.length || 0 }}</p>
        </div>
      </div>

      <!-- Variant Table -->
      <div class="card-static">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider">detected variants</h2>
          <p class="text-xs text-overlay0">only SNVs — indel calling not yet implemented</p>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3 mb-4">
          <div>
            <select class="input-field !w-auto" v-model="filterChromosome">
              <option value="all">all chromosomes</option>
              <option v-for="chr in uniqueChromosomes" :key="chr" :value="chr">{{ chr }}</option>
            </select>
          </div>
          <div>
            <input
              type="number"
              class="input-field !w-32"
              placeholder="min AF"
              v-model.number="filterMinAF"
              step="0.01"
              min="0"
              max="1"
            />
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="filteredVariants.length > 0" class="flex items-center gap-4 mb-4">
          <span class="text-xs text-overlay1">
            {{ ((currentPage - 1) * itemsPerPage) + 1 }}–{{ Math.min(currentPage * itemsPerPage, filteredVariants.length) }} of {{ filteredVariants.length }}
          </span>
          <div class="flex gap-1">
            <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(1)" :disabled="currentPage === 1">first</button>
            <button class="btn-ghost px-2 py-1 text-xs" @click="previousPage" :disabled="currentPage === 1">prev</button>
            <span class="text-xs text-overlay1 px-2 py-1">{{ currentPage }}/{{ totalPages }}</span>
            <button class="btn-ghost px-2 py-1 text-xs" @click="nextPage" :disabled="currentPage === totalPages">next</button>
            <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(totalPages)" :disabled="currentPage === totalPages">last</button>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>chromosome</th>
                <th>position</th>
                <th>ref</th>
                <th>alt</th>
                <th>type</th>
                <th>quality</th>
                <th>depth</th>
                <th>ref/alt</th>
                <th>AF</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="variant in paginatedVariants" :key="`${variant.chrom}-${variant.pos}`">
                <td>{{ variant.chrom }}</td>
                <td class="numeric">{{ variant.pos.toLocaleString() }}</td>
                <td class="font-bold">{{ variant.ref }}</td>
                <td class="font-bold text-mauve">{{ variant.alt }}</td>
                <td>
                  <span class="text-xs px-2 py-0.5 rounded bg-surface0" :class="variantTypeClass(variant.type)">
                    {{ variant.type }}
                  </span>
                </td>
                <td class="numeric">{{ variant.qual.toFixed(1) }}</td>
                <td class="numeric">{{ variant.depth }}</td>
                <td class="text-xs">{{ variant.ref_count }}/{{ variant.alt_count }}</td>
                <td class="numeric" :class="afColorClass(variant.allele_freq)">
                  {{ (variant.allele_freq * 100).toFixed(1) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Export Options -->
      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">export results</h2>
        <div class="flex flex-wrap gap-2">
          <button class="btn-ghost text-xs" @click="exportAsVCF">download VCF</button>
          <button class="btn-ghost text-xs" @click="exportAsJSON">download JSON</button>
          <button class="btn-ghost text-xs" @click="exportAsCSV">download CSV</button>
        </div>
      </div>
    </div>

    <!-- Getting Started -->
    <div v-if="!results && !analyzing && logLines.length === 0" class="status-row">
      <span class="status-dot bg-blue"></span>
      <span class="text-sm text-subtext0">upload a BAM file to detect SNVs using python-based pileup analysis. indel calling not yet implemented.</span>
    </div>

    <!-- Attribution -->
    <p class="text-xs text-overlay0 mt-4">
      sample data: NA12878 exome slice from the
      <a href="https://www.internationalgenome.org/" target="_blank" rel="noopener" class="underline hover:text-subtext0">1000 Genomes Project</a>,
      released under the 1000 Genomes data use policy (unrestricted).
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import BrowserCompatWarning from '../components/BrowserCompatWarning.vue';
import TerminalLog from '../components/TerminalLog.vue';
import { useVariantCaller } from '../composables/useVariantCaller.js';
import { opfsManager } from '../utils/opfs-manager.js';

// Initialize variant caller
const variantCaller = useVariantCaller();

// State
const selectedFile = ref(null);
const loadingSample = ref(false);
const minDepth = ref(10);
const minBaseQuality = ref(20);
const minMappingQuality = ref(20);
const minVariantReads = ref(3);
const minAlleleFreq = ref(0.05);
const selectedChromosome = ref('');
const analyzing = ref(false);
const progress = ref({ message: '', progress: 0, stage: '' });
const error = ref(null);
const results = ref(null);
const storageInfo = ref(null);
const logLines = ref([]);

// Filtering
const filterChromosome = ref('all');
const filterMinAF = ref(0);

// Pagination
const currentPage = ref(1);
const itemsPerPage = 100;

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
const snvCount = computed(() => {
  return results.value?.variants.filter(v => v.type === 'SNV').length || 0;
});

const uniqueChromosomes = computed(() => {
  if (!results.value?.variants) return [];
  const chroms = new Set(results.value.variants.map(v => v.chrom));
  return Array.from(chroms).sort();
});

const filteredVariants = computed(() => {
  if (!results.value?.variants) return [];

  let filtered = results.value.variants;

  if (filterChromosome.value !== 'all') {
    filtered = filtered.filter(v => v.chrom === filterChromosome.value);
  }

  if (filterMinAF.value > 0) {
    filtered = filtered.filter(v => v.allele_freq >= filterMinAF.value);
  }

  return filtered;
});

const totalPages = computed(() => {
  return Math.ceil(filteredVariants.value.length / itemsPerPage);
});

const paginatedVariants = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredVariants.value.slice(start, end);
});

// Lifecycle
onMounted(async () => {
  await refreshStorage();

  // Try to load previous variant results from OPFS
  try {
    const exists = await opfsManager.fileExists('variant-results.json');
    if (exists) {
      const savedData = await opfsManager.readFile('variant-results.json');
      const text = await savedData.text();
      const parsed = JSON.parse(text);
      results.value = parsed.results;
      console.log('Loaded previous variant results from OPFS');
      console.log(`  File: ${parsed.fileName}, Date: ${new Date(parsed.timestamp).toLocaleString()}`);
    }
  } catch (err) {
    console.log('No previous variant results found');
  }

  console.log('Variant Calling view mounted - Pyodide loading in background');
});

// Methods
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
    error.value = null;
  }
}

async function loadSampleData() {
  loadingSample.value = true;
  error.value = null;
  try {
    const response = await fetch(import.meta.env.BASE_URL + 'sample-data/NA12878_EGFR.bam');
    if (!response.ok) throw new Error(`Failed to fetch sample BAM: ${response.status}`);
    const blob = await response.blob();
    selectedFile.value = new File([blob], 'NA12878_EGFR.bam', { type: 'application/octet-stream' });
  } catch (err) {
    error.value = err.message || 'Failed to load sample data';
  } finally {
    loadingSample.value = false;
  }
}

async function runVariantCalling() {
  if (!selectedFile.value) return;

  analyzing.value = true;
  error.value = null;
  results.value = null;
  logLines.value = [];
  currentPage.value = 1;
  progress.value = { message: 'Starting variant calling...', progress: 0, stage: '' };

  addLog(`starting variant calling on ${selectedFile.value.name}`);

  try {
    // Save to OPFS first (for persistence)
    addLog('saving file to OPFS storage...');
    progress.value = { message: 'Saving file to storage...', progress: 5, stage: 'saving' };
    await opfsManager.writeFile(selectedFile.value.name, selectedFile.value);
    addLog(`${selectedFile.value.name} saved to OPFS`);

    // Read file into memory
    addLog('reading file into memory...');
    const arrayBuffer = await selectedFile.value.arrayBuffer();
    addLog(`loaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB into memory`);

    // Run variant calling
    addLog('starting python pileup analysis...');
    const variantResults = await variantCaller.callVariants(arrayBuffer, {
      minDepth: minDepth.value,
      minBaseQuality: minBaseQuality.value,
      minMappingQuality: minMappingQuality.value,
      minVariantReads: minVariantReads.value,
      minAlleleFreq: minAlleleFreq.value,
      chromosomes: selectedChromosome.value ? [selectedChromosome.value] : null,
      onProgress: (p) => {
        progress.value = p;
        if (p.message && p.message !== progress.value._lastLogged) {
          addLog(p.message);
          progress.value._lastLogged = p.message;
        }
      }
    });

    results.value = variantResults;
    progress.value = { message: 'Complete!', progress: 100, stage: 'complete' };
    addLog(`complete — ${variantResults.total_variants} variants detected`);

    // Save results to OPFS for persistence across page navigation
    try {
      await opfsManager.writeFile('variant-results.json', JSON.stringify({
        results: variantResults,
        timestamp: Date.now(),
        fileName: selectedFile.value.name
      }));
      addLog('results saved to OPFS');
    } catch (saveErr) {
      addLog('failed to save results to OPFS', 'WARN');
    }

    // Refresh storage info
    await refreshStorage();
  } catch (err) {
    console.error('Variant calling error:', err);
    error.value = err.message || 'An error occurred during variant calling';
    addLog(err.message || 'variant calling failed', 'ERROR');
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

    // Also clear variant results from UI
    results.value = null;

    await refreshStorage();
  } catch (err) {
    console.error('Failed to clear storage:', err);
  }
}

function exportAsVCF() {
  if (!results.value) return;

  const vcf = variantCaller.formatToVCF(results.value.variants, {
    filters: results.value.filters
  });

  const blob = new Blob([vcf], { type: 'text/plain' });
  downloadBlob(blob, 'variants.vcf');
}

function exportAsJSON() {
  if (!results.value) return;

  const data = {
    variants: results.value.variants,
    total_variants: results.value.total_variants,
    filters: results.value.filters,
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'variants.json');
}

function exportAsCSV() {
  if (!results.value) return;

  const headers = ['Chromosome', 'Position', 'Ref', 'Alt', 'Type', 'Quality', 'Depth', 'RefCount', 'AltCount', 'AlleleFreq'];
  const rows = results.value.variants.map(v => [
    v.chrom,
    v.pos,
    v.ref,
    v.alt,
    v.type,
    v.qual.toFixed(2),
    v.depth,
    v.ref_count,
    v.alt_count,
    v.allele_freq.toFixed(4)
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, 'variants.csv');
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

function variantTypeClass(type) {
  if (type === 'SNV') return 'text-mauve';
  if (type === 'INS') return 'text-green';
  if (type === 'DEL') return 'text-red';
  return 'text-overlay1';
}

function afColorClass(af) {
  if (af >= 0.5) return 'text-red font-bold';
  if (af >= 0.2) return 'text-peach';
  return '';
}

function goToPage(page) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value));
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
}
</script>
