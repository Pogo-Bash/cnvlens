<template>
  <div class="space-y-6">
    <!-- Breadcrumbs -->
    <div class="breadcrumbs text-sm">
      <ul>
        <li><router-link to="/">Home</router-link></li>
        <li>Variant Calling</li>
      </ul>
    </div>

    <!-- Header -->
    <div>
      <h1 class="text-4xl font-bold mb-2">Variant Calling Pipeline</h1>
      <p class="text-lg text-base-content/70">Detect somatic mutations in lung cancer samples using Python-powered pileup analysis (WASM)</p>
    </div>

    <!-- Browser Compatibility Warning -->
    <BrowserCompatWarning />

    <!-- Pyodide Status -->
    <div v-if="variantCaller.isInitializing.value" class="alert alert-info shadow-lg">
      <div class="flex items-center gap-2">
        <span class="loading loading-spinner loading-sm"></span>
        <div>
          <div class="font-bold">Python Environment Loading</div>
          <div class="text-xs">
            {{ variantCaller.status.value }} ({{ variantCaller.progress.value }}%)
          </div>
        </div>
      </div>
      <progress class="progress progress-info w-32" :value="variantCaller.progress.value" max="100"></progress>
    </div>

    <div v-if="variantCaller.isReady.value" class="alert alert-success shadow-lg">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div class="font-bold">🐍 Python Variant Calling Ready</div>
          <div class="text-xs">Using pure Python pileup + NumPy/SciPy for variant detection (WASM-powered)</div>
        </div>
      </div>
    </div>

    <div v-if="variantCaller.error.value" class="alert alert-error shadow-lg">
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div class="font-bold">Python Environment Error</div>
          <div class="text-xs">{{ variantCaller.error.value }}</div>
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
          <div class="divider">Variant Calling Filters</div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Minimum Depth -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Min Depth</span>
              </label>
              <input type="number" class="input input-bordered w-full" v-model.number="minDepth" :disabled="analyzing" min="1" />
              <label class="label">
                <span class="label-text-alt">Minimum read depth</span>
              </label>
            </div>

            <!-- Minimum Base Quality -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Min Base Quality</span>
              </label>
              <input type="number" class="input input-bordered w-full" v-model.number="minBaseQuality" :disabled="analyzing" min="0" max="60" />
              <label class="label">
                <span class="label-text-alt">Phred quality score</span>
              </label>
            </div>

            <!-- Minimum Mapping Quality -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Min Mapping Quality</span>
              </label>
              <input type="number" class="input input-bordered w-full" v-model.number="minMappingQuality" :disabled="analyzing" min="0" max="60" />
              <label class="label">
                <span class="label-text-alt">Read mapping quality</span>
              </label>
            </div>

            <!-- Minimum Variant Reads -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Min Variant Reads</span>
              </label>
              <input type="number" class="input input-bordered w-full" v-model.number="minVariantReads" :disabled="analyzing" min="1" />
              <label class="label">
                <span class="label-text-alt">Supporting reads</span>
              </label>
            </div>

            <!-- Minimum Allele Frequency -->
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold">Min Allele Freq</span>
              </label>
              <input type="number" class="input input-bordered w-full" v-model.number="minAlleleFreq" :disabled="analyzing" min="0" max="1" step="0.01" />
              <label class="label">
                <span class="label-text-alt">Variant allele frequency</span>
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

          <!-- Action Button -->
          <div class="mt-4">
            <button
              class="btn btn-primary btn-lg w-full md:w-auto"
              @click="runVariantCalling"
              :disabled="!selectedFile || analyzing"
            >
              <span v-if="!analyzing">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Call Variants (Python)
              </span>
              <span v-else class="loading loading-spinner"></span>
            </button>

            <div v-if="!variantCaller.isReady.value && !variantCaller.error.value" class="mt-2 text-sm text-info">
              ⏳ Python environment loading in background... Variant calling will use Python when ready.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress Section -->
    <div class="card bg-base-100 shadow-xl" v-if="analyzing || progress.message">
      <div class="card-body">
        <h2 class="card-title">Variant Calling Progress</h2>

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
        </div>
      </div>
    </div>

    <!-- Error Section -->
    <div class="alert alert-error" v-if="error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <h3 class="font-bold">Variant Calling Failed</h3>
        <div class="text-sm">{{ error }}</div>
      </div>
      <button class="btn btn-sm" @click="error = null">Dismiss</button>
    </div>

    <!-- Results Section -->
    <div v-if="results">
      <!-- Summary Stats -->
      <div class="stats shadow w-full">
        <div class="stat">
          <div class="stat-title">Total Variants</div>
          <div class="stat-value">{{ results.total_variants }}</div>
          <div class="stat-desc">Detected mutations</div>
        </div>

        <div class="stat">
          <div class="stat-title">SNVs</div>
          <div class="stat-value text-primary">{{ snvCount }}</div>
          <div class="stat-desc">Single nucleotide variants</div>
        </div>

        <div class="stat">
          <div class="stat-title">Indels</div>
          <div class="stat-value text-secondary">{{ indelCount }}</div>
          <div class="stat-desc">Insertions + Deletions</div>
        </div>

        <div class="stat">
          <div class="stat-title">Chromosomes</div>
          <div class="stat-value text-sm">{{ results.chromosomes_processed?.length || 0 }}</div>
          <div class="stat-desc">Processed</div>
        </div>
      </div>

      <!-- Variant Table with Filtering -->
      <div class="card bg-base-100 shadow-xl mt-6">
        <div class="card-body">
          <h2 class="card-title">Detected Variants</h2>

          <!-- Filters -->
          <div class="flex flex-wrap gap-2 mb-4">
            <select class="select select-bordered select-sm" v-model="filterType">
              <option value="all">All Types</option>
              <option value="SNV">SNVs Only</option>
              <option value="INS">Insertions Only</option>
              <option value="DEL">Deletions Only</option>
            </select>

            <select class="select select-bordered select-sm" v-model="filterChromosome">
              <option value="all">All Chromosomes</option>
              <option v-for="chr in uniqueChromosomes" :key="chr" :value="chr">{{ chr }}</option>
            </select>

            <input
              type="number"
              class="input input-bordered input-sm"
              placeholder="Min AF"
              v-model.number="filterMinAF"
              step="0.01"
              min="0"
              max="1"
            />
          </div>

          <!-- Pagination Info -->
          <div class="flex items-center gap-4 mb-4" v-if="filteredVariants.length > 0">
            <div class="text-sm">
              Showing {{ ((currentPage - 1) * itemsPerPage) + 1 }}-{{ Math.min(currentPage * itemsPerPage, filteredVariants.length) }} of {{ filteredVariants.length }} variants
            </div>

            <div class="join">
              <button class="join-item btn btn-sm" @click="goToPage(1)" :disabled="currentPage === 1">«</button>
              <button class="join-item btn btn-sm" @click="previousPage" :disabled="currentPage === 1">‹</button>
              <button class="join-item btn btn-sm btn-active">{{ currentPage }} / {{ totalPages }}</button>
              <button class="join-item btn btn-sm" @click="nextPage" :disabled="currentPage === totalPages">›</button>
              <button class="join-item btn btn-sm" @click="goToPage(totalPages)" :disabled="currentPage === totalPages">»</button>
            </div>
          </div>

          <!-- Variant Table -->
          <div class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th>Chromosome</th>
                  <th>Position</th>
                  <th>Ref</th>
                  <th>Alt</th>
                  <th>Type</th>
                  <th>Quality</th>
                  <th>Depth</th>
                  <th>Ref/Alt</th>
                  <th>AF</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="variant in paginatedVariants" :key="`${variant.chrom}-${variant.pos}`">
                  <td class="font-mono">{{ variant.chrom }}</td>
                  <td class="font-mono">{{ variant.pos.toLocaleString() }}</td>
                  <td class="font-mono font-bold">{{ variant.ref }}</td>
                  <td class="font-mono font-bold text-primary">{{ variant.alt }}</td>
                  <td>
                    <span class="badge badge-sm" :class="variantTypeBadge(variant.type)">
                      {{ variant.type }}
                    </span>
                  </td>
                  <td>{{ variant.qual.toFixed(1) }}</td>
                  <td>{{ variant.depth }}</td>
                  <td class="font-mono text-xs">{{ variant.ref_count }}/{{ variant.alt_count }}</td>
                  <td>
                    <span class="font-mono" :class="afColorClass(variant.allele_freq)">
                      {{ (variant.allele_freq * 100).toFixed(1) }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Export Options -->
      <div class="card bg-base-100 shadow-xl mt-6">
        <div class="card-body">
          <h2 class="card-title">Export Results</h2>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-outline btn-sm" @click="exportAsVCF">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download VCF
            </button>
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
        <div class="text-sm">Upload a BAM file to detect variants using Python-based pileup analysis (NumPy + SciPy running in WebAssembly).</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import BrowserCompatWarning from '../components/BrowserCompatWarning.vue';
import { useVariantCaller } from '../composables/useVariantCaller.js';
import { opfsManager } from '../utils/opfs-manager.js';

// Initialize variant caller
const variantCaller = useVariantCaller();

// State
const selectedFile = ref(null);
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

// Filtering
const filterType = ref('all');
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

// Computed
const snvCount = computed(() => {
  return results.value?.variants.filter(v => v.type === 'SNV').length || 0;
});

const indelCount = computed(() => {
  return results.value?.variants.filter(v => v.type === 'INS' || v.type === 'DEL').length || 0;
});

const uniqueChromosomes = computed(() => {
  if (!results.value?.variants) return [];
  const chroms = new Set(results.value.variants.map(v => v.chrom));
  return Array.from(chroms).sort();
});

const filteredVariants = computed(() => {
  if (!results.value?.variants) return [];

  let filtered = results.value.variants;

  if (filterType.value !== 'all') {
    filtered = filtered.filter(v => v.type === filterType.value);
  }

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

async function runVariantCalling() {
  if (!selectedFile.value) return;

  analyzing.value = true;
  error.value = null;
  results.value = null;
  progress.value = { message: 'Starting variant calling...', progress: 0, stage: '' };

  try {
    // Save to OPFS first (for persistence)
    progress.value = { message: 'Saving file to storage...', progress: 5, stage: 'saving' };
    await opfsManager.writeFile(selectedFile.value.name, selectedFile.value);
    console.log(`✅ ${selectedFile.value.name} saved to OPFS for persistence`);

    // Read file into memory
    const arrayBuffer = await selectedFile.value.arrayBuffer();

    // Run variant calling
    const variantResults = await variantCaller.callVariants(arrayBuffer, {
      minDepth: minDepth.value,
      minBaseQuality: minBaseQuality.value,
      minMappingQuality: minMappingQuality.value,
      minVariantReads: minVariantReads.value,
      minAlleleFreq: minAlleleFreq.value,
      chromosomes: selectedChromosome.value ? [selectedChromosome.value] : null,
      onProgress: (p) => {
        progress.value = p;
      }
    });

    results.value = variantResults;
    progress.value = { message: 'Complete!', progress: 100, stage: 'complete' };

    // Refresh storage info
    await refreshStorage();
  } catch (err) {
    console.error('Variant calling error:', err);
    error.value = err.message || 'An error occurred during variant calling';
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

function variantTypeBadge(type) {
  if (type === 'SNV') return 'badge-primary';
  if (type === 'INS') return 'badge-success';
  if (type === 'DEL') return 'badge-error';
  return 'badge-ghost';
}

function afColorClass(af) {
  if (af >= 0.5) return 'text-error font-bold';
  if (af >= 0.2) return 'text-warning';
  return 'text-base-content';
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

<style scoped>
/* Additional custom styles if needed */
</style>
