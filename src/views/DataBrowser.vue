<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-text mb-2">data browser</h1>
      <p class="text-subtext0 leading-relaxed">search and download lung cancer genomic data from TCGA and ICGC</p>
    </div>

    <div class="card-static">
      <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-4">search parameters</h2>

      <div class="grid grid-cols-1 gap-4">
        <div>
          <label class="input-label">cancer type</label>
          <select class="input-field">
            <option>non-small cell lung cancer (NSCLC)</option>
            <option>small cell lung cancer (SCLC)</option>
            <option>lung adenocarcinoma (LUAD)</option>
            <option>lung squamous cell carcinoma (LUSC)</option>
          </select>
        </div>

        <div>
          <label class="input-label">data type</label>
          <select class="input-field">
            <option>whole exome sequencing (WES)</option>
            <option>whole genome sequencing (WGS)</option>
          </select>
        </div>

        <div>
          <label class="input-label">minimum coverage depth</label>
          <input type="number" value="30" class="input-field" />
          <p class="input-helper">coverage depth (30x recommended for clinical analysis)</p>
        </div>

        <div class="mt-2">
          <button class="btn-primary">search TCGA database</button>
        </div>
      </div>
    </div>

    <div class="status-row">
      <span class="status-dot bg-blue"></span>
      <div class="flex-1">
        <span class="text-sm text-text font-bold">integration coming soon</span>
        <p class="text-xs text-subtext0">TCGA integration is in development. upload your own BAM/VCF files in the CNV analysis section.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
// Data browser logic will go here
</script>
