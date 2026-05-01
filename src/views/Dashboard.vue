<template>
  <div class="space-y-12">
    <!-- Hero -->
    <section class="max-w-2xl">
      <h1 class="text-3xl font-bold text-text mb-2">
        lungseq <span class="text-mauve">analyzer</span>
      </h1>
      <p class="text-subtext0 leading-relaxed">
        browser-based lung cancer genomics analysis. variant calling and
        CNV detection run locally in your browser via pyodide — your data
        never leaves the page.
      </p>
      <router-link to="/variant-calling" class="btn-primary mt-6 inline-flex">
        get started
      </router-link>
    </section>

    <!-- Feature Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <router-link to="/data-browser" class="card-link group">
        <h2 class="font-bold text-text group-hover:text-mauve transition-colors mb-1">data browser</h2>
        <p class="text-sm text-subtext0">fetch WES/WGS data from TCGA and ICGC</p>
      </router-link>

      <router-link to="/variant-calling" class="card-link group">
        <h2 class="font-bold text-text group-hover:text-mauve transition-colors mb-1">variant calling</h2>
        <p class="text-sm text-subtext0">detect somatic mutations via pileup analysis</p>
      </router-link>

      <router-link to="/cnv-analysis" class="card-link group">
        <h2 class="font-bold text-text group-hover:text-mauve transition-colors mb-1">cnv analysis</h2>
        <p class="text-sm text-subtext0">call copy number variations</p>
      </router-link>

      <router-link to="/visualization" class="card-link group">
        <h2 class="font-bold text-text group-hover:text-mauve transition-colors mb-1">visualization</h2>
        <p class="text-sm text-subtext0">generate publication-ready plots</p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
// Dashboard component
</script>
