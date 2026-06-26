<template>
  <div class="min-h-screen bg-crust">
    <nav class="border-b border-surface0 px-6 py-4 sticky top-0 z-50 bg-crust/95 backdrop-blur-sm">
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <router-link to="/" class="text-mauve font-bold text-lg hover:text-lavender transition-colors">
          {{ brand }}
        </router-link>
        <div v-if="tabs.length" class="tab-nav border-b-0 mb-0 gap-4">
          <router-link v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab-item">{{ tab.label }}</router-link>
        </div>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto w-full px-6 py-8">
      <router-view />
    </main>

    <footer class="border-t border-surface0 px-6 py-6">
      <div class="max-w-6xl mx-auto text-center text-xs text-subtext0">
        browser-based genomics analysis powered by Rust/WASM
      </div>
    </footer>
  </div>
</template>

<script setup>
// The standalone /splice/ build (VITE_SPLICE_HOME=1) is a SEPARATE product —
// SpliceQL/CodonSplice. It must show its own branding and NONE of the CNVLens
// nav. The normal /cnvlens/ build shows the CNVLens nav and never links to the
// splice page (the /splice route only exists in the splice build's home).
const isSplice = !!import.meta.env.VITE_SPLICE_HOME

const brand = isSplice ? 'SpliceQL/CodonSplice' : 'CNVLens'

const tabs = isSplice
  ? []
  : [
      { to: '/data-browser', label: 'data browser' },
      { to: '/variant-calling', label: 'variant calling' },
      { to: '/cnv-analysis', label: 'cnv analysis' },
      { to: '/visualization', label: 'visualization' },
      { to: '/docs', label: 'docs' },
    ]
</script>
