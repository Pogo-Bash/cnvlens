<template>
  <div class="space-y-6">
    <div class="breadcrumbs text-sm">
      <ul>
        <li><router-link to="/">Home</router-link></li>
        <li>Data Browser</li>
      </ul>
    </div>

    <div>
      <h1 class="text-4xl font-bold mb-2">Data Browser</h1>
      <p class="text-lg text-base-content/70">Search and download lung cancer genomic data from TCGA/GDC</p>
    </div>

    <!-- API Token Configuration -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          GDC API Token
        </h2>

        <div v-if="!showTokenInput && hasToken" class="flex items-center gap-4">
          <div class="badge badge-success gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Token configured
          </div>
          <button class="btn btn-sm btn-ghost" @click="showTokenInput = true">Change</button>
          <button class="btn btn-sm btn-ghost text-error" @click="clearToken">Clear</button>
        </div>

        <div v-else class="space-y-4">
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">API Token</span>
              <span class="label-text-alt">
                <a href="https://portal.gdc.cancer.gov/" target="_blank" class="link link-primary">
                  Get token from GDC Portal
                </a>
              </span>
            </label>
            <div class="flex gap-2">
              <input
                type="password"
                class="input input-bordered flex-1"
                v-model="tokenInput"
                placeholder="Paste your GDC API token here..."
                @keyup.enter="saveToken"
              />
              <button class="btn btn-primary" @click="saveToken" :disabled="!tokenInput.trim()">
                Save Token
              </button>
              <button v-if="hasToken" class="btn btn-ghost" @click="showTokenInput = false">
                Cancel
              </button>
            </div>
            <label class="label">
              <span class="label-text-alt text-base-content/60">
                Token is stored locally in your browser and never sent to our servers.
                Required for downloading controlled-access data.
              </span>
            </label>
          </div>
        </div>

        <!-- Token validation status -->
        <div v-if="tokenValidation" class="mt-2">
          <div v-if="tokenValidation.valid" class="alert alert-success py-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm">{{ tokenValidation.message }}</span>
          </div>
          <div v-else class="alert alert-warning py-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="text-sm">{{ tokenValidation.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Search Parameters -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">Search Parameters</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Cancer Type -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Cancer Type</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.project">
              <option value="">All Lung Cancers</option>
              <option value="TCGA-LUAD">Lung Adenocarcinoma (LUAD)</option>
              <option value="TCGA-LUSC">Lung Squamous Cell Carcinoma (LUSC)</option>
            </select>
          </div>

          <!-- Data Format -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Data Format</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.dataFormat">
              <option value="">All Formats</option>
              <option value="BAM">BAM (Aligned Reads)</option>
              <option value="VCF">VCF (Variants)</option>
              <option value="TSV">TSV (Tabular)</option>
            </select>
          </div>

          <!-- Data Category -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Data Category</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.dataCategory">
              <option value="">All Categories</option>
              <option value="Sequencing Reads">Sequencing Reads</option>
              <option value="Copy Number Variation">Copy Number Variation</option>
              <option value="Simple Nucleotide Variation">Simple Nucleotide Variation</option>
            </select>
          </div>

          <!-- Experimental Strategy -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Sequencing Strategy</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.experimentalStrategy">
              <option value="">All Strategies</option>
              <option value="WXS">Whole Exome Sequencing (WES)</option>
              <option value="WGS">Whole Genome Sequencing (WGS)</option>
              <option value="RNA-Seq">RNA Sequencing</option>
              <option value="Targeted Sequencing">Targeted Sequencing</option>
            </select>
          </div>

          <!-- Access Type -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Access Level</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.accessType">
              <option value="">All Access Levels</option>
              <option value="open">Open Access</option>
              <option value="controlled">Controlled Access (requires dbGaP approval)</option>
            </select>
          </div>

          <!-- Results per page -->
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Results per Page</span>
            </label>
            <select class="select select-bordered w-full" v-model="searchParams.pageSize">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </div>
        </div>

        <div class="mt-6 flex gap-2">
          <button
            class="btn btn-primary btn-lg"
            @click="searchFiles"
            :disabled="searching"
          >
            <span v-if="!searching">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search GDC Database
            </span>
            <span v-else class="loading loading-spinner"></span>
          </button>
          <button class="btn btn-ghost" @click="resetSearch">Reset</button>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <h3 class="font-bold">Search Error</h3>
        <div class="text-sm">{{ error }}</div>
      </div>
      <button class="btn btn-sm" @click="error = null">Dismiss</button>
    </div>

    <!-- Results Section -->
    <div v-if="searchResults" class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h2 class="card-title">
            Search Results
            <span class="badge badge-primary">{{ searchResults.total.toLocaleString() }} files</span>
          </h2>
        </div>

        <!-- Results Table -->
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Project</th>
                <th>Format</th>
                <th>Strategy</th>
                <th>Size</th>
                <th>Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in searchResults.files" :key="file.file_id">
                <td>
                  <div class="font-medium text-sm max-w-xs truncate" :title="file.file_name">
                    {{ file.file_name }}
                  </div>
                  <div class="text-xs text-base-content/60">
                    {{ file.data_category }}
                  </div>
                </td>
                <td>
                  <span class="badge badge-outline badge-sm">
                    {{ file.cases?.[0]?.project?.project_id || 'N/A' }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="getFormatBadgeClass(file.data_format)">
                    {{ file.data_format }}
                  </span>
                </td>
                <td>{{ file.experimental_strategy || 'N/A' }}</td>
                <td>{{ formatFileSize(file.file_size) }}</td>
                <td>
                  <span class="badge" :class="file.access === 'open' ? 'badge-success' : 'badge-warning'">
                    {{ file.access }}
                  </span>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-xs btn-ghost"
                      @click="showFileDetails(file)"
                      title="View Details"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    <button
                      class="btn btn-xs btn-primary"
                      @click="downloadFile(file)"
                      :disabled="downloading === file.file_id || (file.access === 'controlled' && !hasToken)"
                      :title="file.access === 'controlled' && !hasToken ? 'Token required for controlled data' : 'Download'"
                    >
                      <span v-if="downloading === file.file_id" class="loading loading-spinner loading-xs"></span>
                      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex justify-center mt-6 gap-2" v-if="searchResults.pagination">
          <button
            class="btn btn-sm"
            @click="goToPage(currentPage - 1)"
            :disabled="currentPage === 1 || searching"
          >
            Previous
          </button>
          <span class="btn btn-sm btn-disabled">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            class="btn btn-sm"
            @click="goToPage(currentPage + 1)"
            :disabled="currentPage >= totalPages || searching"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- File Details Modal -->
    <dialog ref="detailsModal" class="modal">
      <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg mb-4">File Details</h3>
        <div v-if="selectedFile" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-base-content/60">File Name</div>
              <div class="font-medium break-all">{{ selectedFile.file_name }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">File ID</div>
              <div class="font-mono text-sm break-all">{{ selectedFile.file_id }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Size</div>
              <div>{{ formatFileSize(selectedFile.file_size) }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Format</div>
              <div>{{ selectedFile.data_format }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Category</div>
              <div>{{ selectedFile.data_category }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Strategy</div>
              <div>{{ selectedFile.experimental_strategy || 'N/A' }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Access Level</div>
              <div>
                <span class="badge" :class="selectedFile.access === 'open' ? 'badge-success' : 'badge-warning'">
                  {{ selectedFile.access }}
                </span>
              </div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">MD5 Checksum</div>
              <div class="font-mono text-xs break-all">{{ selectedFile.md5sum }}</div>
            </div>
          </div>

          <!-- Case Information -->
          <div v-if="selectedFile.cases && selectedFile.cases.length > 0" class="divider">Case Information</div>
          <div v-if="selectedFile.cases && selectedFile.cases.length > 0" class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-base-content/60">Case ID</div>
              <div class="font-mono text-sm">{{ selectedFile.cases[0].submitter_id }}</div>
            </div>
            <div>
              <div class="text-sm text-base-content/60">Project</div>
              <div>{{ selectedFile.cases[0].project?.name || selectedFile.cases[0].project?.project_id }}</div>
            </div>
            <div v-if="selectedFile.cases[0].demographic">
              <div class="text-sm text-base-content/60">Gender</div>
              <div>{{ selectedFile.cases[0].demographic.gender || 'N/A' }}</div>
            </div>
            <div v-if="selectedFile.cases[0].diagnoses && selectedFile.cases[0].diagnoses.length > 0">
              <div class="text-sm text-base-content/60">Primary Diagnosis</div>
              <div>{{ selectedFile.cases[0].diagnoses[0].primary_diagnosis || 'N/A' }}</div>
            </div>
          </div>
        </div>
        <div class="modal-action">
          <button
            class="btn btn-primary"
            @click="downloadFile(selectedFile)"
            :disabled="downloading === selectedFile?.file_id || (selectedFile?.access === 'controlled' && !hasToken)"
          >
            <span v-if="downloading === selectedFile?.file_id" class="loading loading-spinner loading-sm"></span>
            <span v-else>Download File</span>
          </button>
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>

    <!-- Download Progress Modal -->
    <dialog ref="downloadModal" class="modal">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Downloading File</h3>
        <div class="space-y-4">
          <div class="text-sm text-base-content/70 truncate">
            {{ downloadingFileName }}
          </div>
          <progress
            class="progress progress-primary w-full"
            :value="downloadProgress.percent"
            max="100"
          ></progress>
          <div class="text-sm text-center">
            {{ formatFileSize(downloadProgress.loaded) }} / {{ formatFileSize(downloadProgress.total) }}
            ({{ downloadProgress.percent }}%)
          </div>
        </div>
      </div>
    </dialog>

    <!-- Info Box -->
    <div class="alert alert-info shadow-lg" v-if="!searchResults">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <div>
        <h3 class="font-bold">About GDC Data Access</h3>
        <div class="text-sm">
          <p class="mb-2">The Genomic Data Commons (GDC) hosts TCGA lung cancer data including BAM files, VCF variants, and more.</p>
          <ul class="list-disc list-inside space-y-1">
            <li><strong>Open Access:</strong> Available to everyone without authentication</li>
            <li><strong>Controlled Access:</strong> Requires dbGaP authorization and API token from the GDC portal</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { tcgaClient } from '../services/tcga-client.js';
import { opfsManager } from '../utils/opfs-manager.js';

// Refs
const detailsModal = ref(null);
const downloadModal = ref(null);

// Token state
const hasToken = ref(false);
const showTokenInput = ref(false);
const tokenInput = ref('');
const tokenValidation = ref(null);

// Search state
const searchParams = ref({
  project: '',
  dataFormat: '',
  dataCategory: '',
  experimentalStrategy: '',
  accessType: '',
  pageSize: 20,
});
const searching = ref(false);
const searchResults = ref(null);
const error = ref(null);
const currentPage = ref(1);

// File details
const selectedFile = ref(null);

// Download state
const downloading = ref(null);
const downloadingFileName = ref('');
const downloadProgress = ref({ loaded: 0, total: 0, percent: 0 });

// Computed
const totalPages = computed(() => {
  if (!searchResults.value?.pagination) return 1;
  return Math.ceil(searchResults.value.total / searchParams.value.pageSize);
});

// Lifecycle
onMounted(() => {
  hasToken.value = tcgaClient.hasToken();
  if (!hasToken.value) {
    showTokenInput.value = true;
  }
});

// Methods
async function saveToken() {
  if (!tokenInput.value.trim()) return;

  tcgaClient.saveToken(tokenInput.value.trim());
  hasToken.value = true;
  showTokenInput.value = false;
  tokenInput.value = '';

  // Validate the token
  tokenValidation.value = await tcgaClient.validateToken();
}

function clearToken() {
  if (!confirm('Are you sure you want to clear your API token?')) return;

  tcgaClient.clearToken();
  hasToken.value = false;
  showTokenInput.value = true;
  tokenValidation.value = null;
}

async function searchFiles() {
  searching.value = true;
  error.value = null;

  try {
    const projects = searchParams.value.project
      ? [searchParams.value.project]
      : null;

    searchResults.value = await tcgaClient.searchFiles({
      projects,
      dataFormat: searchParams.value.dataFormat || null,
      dataCategory: searchParams.value.dataCategory || null,
      experimentalStrategy: searchParams.value.experimentalStrategy || null,
      accessType: searchParams.value.accessType || null,
      from: (currentPage.value - 1) * searchParams.value.pageSize,
      size: searchParams.value.pageSize,
    });
  } catch (err) {
    error.value = err.message;
    searchResults.value = null;
  } finally {
    searching.value = false;
  }
}

function resetSearch() {
  searchParams.value = {
    project: '',
    dataFormat: '',
    dataCategory: '',
    experimentalStrategy: '',
    accessType: '',
    pageSize: 20,
  };
  currentPage.value = 1;
  searchResults.value = null;
  error.value = null;
}

async function goToPage(page) {
  currentPage.value = page;
  await searchFiles();
}

function showFileDetails(file) {
  selectedFile.value = file;
  detailsModal.value?.showModal();
}

async function downloadFile(file) {
  if (!file) return;

  if (file.access === 'controlled' && !hasToken.value) {
    error.value = 'A GDC API token is required to download controlled-access data. Please configure your token above.';
    return;
  }

  downloading.value = file.file_id;
  downloadingFileName.value = file.file_name;
  downloadProgress.value = { loaded: 0, total: file.file_size, percent: 0 };
  downloadModal.value?.showModal();

  try {
    const blob = await tcgaClient.downloadFile(file.file_id, (progress) => {
      downloadProgress.value = progress;
    });

    // Save to OPFS for use in analysis
    await opfsManager.writeFile(file.file_name, blob);

    // Also trigger browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    downloadModal.value?.close();

    // Show success message
    alert(`File "${file.file_name}" downloaded successfully and saved to browser storage. You can now use it in CNV Analysis or Variant Calling.`);
  } catch (err) {
    downloadModal.value?.close();
    error.value = `Download failed: ${err.message}`;
  } finally {
    downloading.value = null;
  }
}

function formatFileSize(bytes) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function getFormatBadgeClass(format) {
  switch (format) {
    case 'BAM':
      return 'badge-primary';
    case 'VCF':
      return 'badge-secondary';
    case 'TSV':
      return 'badge-accent';
    default:
      return 'badge-ghost';
  }
}
</script>
