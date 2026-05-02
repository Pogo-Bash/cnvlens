<template>
  <div class="min-h-screen bg-crust">
    <nav class="border-b border-surface0 px-6 py-4 sticky top-0 z-50 bg-crust/95 backdrop-blur-sm">
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <router-link to="/" class="text-mauve font-bold text-lg hover:text-lavender transition-colors">
          CNVLens
        </router-link>
        <div class="tab-nav border-b-0 mb-0 gap-4">
          <router-link to="/data-browser" class="tab-item">data browser</router-link>
          <router-link to="/variant-calling" class="tab-item">variant calling</router-link>
          <router-link to="/cnv-analysis" class="tab-item">cnv analysis</router-link>
          <router-link to="/visualization" class="tab-item">visualization</router-link>
        </div>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto w-full px-6 py-8">
      <router-view />
    </main>

    <footer class="border-t border-surface0 px-6 py-6">
      <div class="max-w-6xl mx-auto text-center text-xs text-overlay0">
        browser-based genomics analysis powered by pyodide
      </div>
    </footer>
  </div>
</template>

<script setup>
// Main app component
</script>
