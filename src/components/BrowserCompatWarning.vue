<template>
  <div v-if="compatReport">
    <!-- Critical Issues -->
    <div class="alert alert-error shadow-lg mb-4" v-if="compatReport.issues.length > 0">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div class="flex-1">
        <h3 class="font-bold">Browser Compatibility Issues</h3>
        <div class="text-sm space-y-1">
          <p v-for="(issue, idx) in compatReport.issues" :key="idx">{{ issue }}</p>
        </div>
        <div class="text-sm mt-2">
          <strong>Recommended browsers:</strong> Chrome 86+, Firefox 111+, Edge 86+
        </div>
      </div>
      <button class="btn btn-sm" @click="showDetails = !showDetails">
        {{ showDetails ? 'Hide Details' : 'Show Details' }}
      </button>
    </div>

    <!-- Warnings -->
    <div class="alert alert-warning shadow-lg mb-4" v-else-if="compatReport.warnings.length > 0">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div class="flex-1">
        <h3 class="font-bold">Browser Compatibility Warnings</h3>
        <div class="text-sm space-y-1">
          <p v-for="(warning, idx) in compatReport.warnings" :key="idx">{{ warning }}</p>
        </div>
      </div>
      <button class="btn btn-sm" @click="showDetails = !showDetails">
        {{ showDetails ? 'Hide Details' : 'Show Details' }}
      </button>
    </div>

    <!-- Success (Optimal) -->
    <div class="alert alert-success shadow-lg mb-4" v-else-if="compatReport.recommendation === 'optimal'">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div class="flex-1">
        <h3 class="font-bold">Browser Fully Supported</h3>
        <div class="text-sm">
          {{ compatReport.browser.name }} {{ compatReport.browser.version }} - All features available!
        </div>
      </div>
      <button class="btn btn-sm btn-ghost" @click="dismiss">Dismiss</button>
    </div>

    <!-- Details Panel -->
    <div class="collapse collapse-arrow bg-base-100 shadow-lg mb-4" v-if="showDetails">
      <input type="checkbox" checked />
      <div class="collapse-title text-lg font-medium">
        Browser Compatibility Details
      </div>
      <div class="collapse-content">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">Browser</div>
            <div class="stat-value text-2xl">{{ compatReport.browser.name }}</div>
            <div class="stat-desc">Version {{ compatReport.browser.version }}</div>
          </div>

          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">Type</div>
            <div class="stat-value text-2xl">
              {{ compatReport.browser.chromiumBased ? 'Chromium' : 'Other' }}
            </div>
            <div class="stat-desc">{{ compatReport.browser.chromiumBased ? 'Chrome-based' : 'Non-Chromium' }}</div>
          </div>

          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">OPFS Support</div>
            <div class="stat-value text-2xl">
              <span v-if="compatReport.opfsSupported" class="text-success">✓</span>
              <span v-else class="text-error">✗</span>
            </div>
            <div class="stat-desc">{{ compatReport.opfsSupported ? 'Available' : 'Not available' }}</div>
          </div>

          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">IndexedDB Support</div>
            <div class="stat-value text-2xl">
              <span v-if="compatReport.indexedDBSupported" class="text-success">✓</span>
              <span v-else class="text-error">✗</span>
            </div>
            <div class="stat-desc">{{ compatReport.indexedDBSupported ? 'Available' : 'Not available' }}</div>
          </div>

          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">WebAssembly</div>
            <div class="stat-value text-2xl">
              <span v-if="compatReport.webAssemblySupported" class="text-success">✓</span>
              <span v-else class="text-error">✗</span>
            </div>
            <div class="stat-desc">{{ compatReport.webAssemblySupported ? 'Available' : 'Not available' }}</div>
          </div>

          <div class="stat bg-base-200 rounded-lg p-4">
            <div class="stat-title">SharedArrayBuffer</div>
            <div class="stat-value text-2xl">
              <span v-if="compatReport.sharedArrayBufferSupported" class="text-success">✓</span>
              <span v-else class="text-warning">⚠</span>
            </div>
            <div class="stat-desc">
              {{ compatReport.sharedArrayBufferSupported ? 'Available' : 'Limited threading' }}
            </div>
          </div>
        </div>

        <div class="mt-4">
          <h4 class="font-bold mb-2">Recommended Minimum Versions:</h4>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <div>Chrome: 86+</div>
            <div>Firefox: 111+</div>
            <div>Edge: 86+</div>
            <div>Safari: 15.2+</div>
            <div>Opera: 72+</div>
            <div>Brave: 86+</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { browserCompat } from '../utils/browser-compat.js';

const compatReport = ref(null);
const showDetails = ref(false);
const dismissed = ref(false);

onMounted(() => {
  if (!dismissed.value) {
    compatReport.value = browserCompat.getCompatibilityReport();
    console.log('Browser Compatibility Report:', compatReport.value);

    // Auto-show details for critical issues
    if (compatReport.value.issues.length > 0) {
      showDetails.value = true;
    }
  }
});

function dismiss() {
  dismissed.value = true;
  compatReport.value = null;
}
</script>
