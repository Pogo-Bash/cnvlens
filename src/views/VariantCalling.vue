<template>
  <div class="space-y-6">
    <div class="breadcrumbs text-sm">
      <ul>
        <li><router-link to="/">Home</router-link></li>
        <li>Variant Calling</li>
      </ul>
    </div>

    <div>
      <h1 class="text-4xl font-bold mb-2">Variant Calling Pipeline</h1>
      <p class="text-lg text-base-content/70">Detect somatic mutations in lung cancer samples</p>
    </div>

    <div class="steps steps-vertical lg:steps-horizontal w-full">
      <div class="step step-primary">Upload Data</div>
      <div class="step">Configure Pipeline</div>
      <div class="step">Run Analysis</div>
      <div class="step">Review Results</div>
    </div>

    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title mb-4">Step 1: Upload Files</h2>

        <div class="grid grid-cols-1 gap-4">
          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Tumor BAM File</span>
              <span class="label-text-alt text-base-content/60">Required</span>
            </label>
            <input type="file" class="file-input file-input-bordered file-input-primary w-full" accept=".bam" />
          </div>

          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Normal BAM File</span>
              <span class="label-text-alt text-base-content/60">Optional</span>
            </label>
            <input type="file" class="file-input file-input-bordered w-full" accept=".bam" />
            <label class="label">
              <span class="label-text-alt">For somatic variant calling</span>
            </label>
          </div>

          <div class="divider">Reference Configuration</div>

          <div class="form-control w-full">
            <label class="label">
              <span class="label-text font-semibold">Reference Genome</span>
            </label>
            <select class="select select-bordered w-full">
              <option>GRCh38/hg38 (recommended)</option>
              <option>GRCh37/hg19</option>
            </select>
            <label class="label">
              <span class="label-text-alt">Human genome reference version</span>
            </label>
          </div>

          <div class="mt-4">
            <button class="btn btn-primary btn-lg w-full md:w-auto" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Next: Configure Pipeline
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="alert alert-warning shadow-lg">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <div>
        <h3 class="font-bold">Coming Soon</h3>
        <div class="text-sm">Pipeline implementation in progress. WASM-based variant calling coming soon!</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Variant calling logic
</script>
