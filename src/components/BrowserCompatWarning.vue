<template>
  <div v-if="compatReport && !dismissed">
    <!-- Critical Issues -->
    <div v-if="compatReport.issues.length > 0" class="status-row border-red/30 mb-3">
      <span class="status-dot bg-red"></span>
      <div class="flex-1">
        <p class="text-sm text-text font-bold">browser compatibility issues</p>
        <p v-for="(issue, idx) in compatReport.issues" :key="idx" class="text-xs text-subtext0">{{ issue }}</p>
        <p class="text-xs text-overlay1 mt-1">recommended: Chrome 86+, Firefox 111+, Edge 86+</p>
      </div>
      <button class="btn-ghost px-2 py-1 text-xs" @click="showDetails = !showDetails">
        {{ showDetails ? 'hide' : 'details' }}
      </button>
    </div>

    <!-- Warnings -->
    <div v-else-if="compatReport.warnings.length > 0" class="status-row border-peach/30 mb-3">
      <span class="status-dot bg-peach"></span>
      <div class="flex-1">
        <p class="text-sm text-text font-bold">browser warnings</p>
        <p v-for="(warning, idx) in compatReport.warnings" :key="idx" class="text-xs text-subtext0">{{ warning }}</p>
      </div>
      <button class="btn-ghost px-2 py-1 text-xs" @click="showDetails = !showDetails">
        {{ showDetails ? 'hide' : 'details' }}
      </button>
    </div>

    <!-- Success -->
    <div v-else-if="compatReport.recommendation === 'optimal'" class="status-row border-green/30 mb-3">
      <span class="status-dot bg-green"></span>
      <div class="flex-1">
        <span class="text-sm text-subtext1">{{ compatReport.browser.name }} {{ compatReport.browser.version }} — all features available</span>
      </div>
      <button class="btn-ghost px-2 py-1 text-xs" @click="dismiss">dismiss</button>
    </div>

    <!-- Details Panel -->
    <div v-if="showDetails" class="card-static mb-3">
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">compatibility details</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div v-for="item in detailItems" :key="item.label" class="flex items-center gap-2">
          <span class="status-dot" :class="item.supported ? 'bg-green' : 'bg-red'"></span>
          <span class="text-xs text-subtext0">{{ item.label }}</span>
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-surface0">
        <p class="text-xs text-overlay0">minimum versions: Chrome 86+, Firefox 111+, Edge 86+, Safari 15.2+</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { browserCompat } from '../utils/browser-compat.js';

const compatReport = ref(null);
const showDetails = ref(false);
const dismissed = ref(false);

const detailItems = computed(() => {
  if (!compatReport.value) return [];
  return [
    { label: 'OPFS', supported: compatReport.value.opfsSupported },
    { label: 'IndexedDB', supported: compatReport.value.indexedDBSupported },
    { label: 'WebAssembly', supported: compatReport.value.webAssemblySupported },
    { label: 'SharedArrayBuffer', supported: compatReport.value.sharedArrayBufferSupported },
    { label: 'Chromium-based', supported: compatReport.value.browser.chromiumBased },
  ];
});

onMounted(() => {
  compatReport.value = browserCompat.getCompatibilityReport();
  if (compatReport.value.issues.length > 0) {
    showDetails.value = true;
  }
});

function dismiss() {
  dismissed.value = true;
}
</script>
