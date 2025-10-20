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
      <p class="text-lg text-base-content/70">Search and download lung cancer genomic data from TCGA and ICGC</p>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">Search Parameters</h2>

        <div class="grid grid-cols-1 gap-4">
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Cancer Type</span>
            </label>
            <select class="select select-bordered w-full">
              <option>Non-Small Cell Lung Cancer (NSCLC)</option>
              <option>Small Cell Lung Cancer (SCLC)</option>
              <option>Lung Adenocarcinoma (LUAD)</option>
              <option>Lung Squamous Cell Carcinoma (LUSC)</option>
            </select>
          </div>

          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Data Type</span>
            </label>
            <select class="select select-bordered w-full">
              <option>Whole Exome Sequencing (WES)</option>
              <option>Whole Genome Sequencing (WGS)</option>
            </select>
          </div>

          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Minimum Coverage Depth</span>
            </label>
            <input type="number" value="30" class="input input-bordered w-full" />
            <label class="label">
              <span class="label-text-alt">Coverage depth (30x recommended for clinical analysis)</span>
            </label>
          </div>

          <div class="mt-4">
            <button class="btn btn-primary btn-lg w-full md:w-auto">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search TCGA Database
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="alert alert-info shadow-lg">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <div>
        <h3 class="font-bold">Integration Coming Soon</h3>
        <div class="text-sm">TCGA integration is in development. For now, you can upload your own BAM/VCF files in the CNV Analysis section.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Data browser logic will go here
</script>
