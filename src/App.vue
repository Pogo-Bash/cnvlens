<template>
  <div class="min-h-screen bg-base-200">
    <nav class="navbar bg-base-100 shadow-lg sticky top-0 z-50">
      <div class="container mx-auto px-4">
        <div class="flex-1">
          <router-link to="/" class="btn btn-ghost text-xl font-bold">
            🧬 LungSeq Analyzer
          </router-link>
        </div>
        <div class="flex-none">
          <ul class="menu menu-horizontal px-1 gap-1">
            <li><router-link to="/data-browser" class="btn btn-ghost btn-sm">Data Browser</router-link></li>
            <li><router-link to="/variant-calling" class="btn btn-ghost btn-sm">Variant Calling</router-link></li>
            <li><router-link to="/cnv-analysis" class="btn btn-ghost btn-sm">CNV Analysis</router-link></li>
            <li><router-link to="/visualization" class="btn btn-ghost btn-sm">Visualization</router-link></li>
          </ul>
        </div>
      </div>
    </nav>

    <main class="container mx-auto px-4 py-8">
      <router-view />
    </main>

    <footer class="footer footer-center p-10 bg-base-100 text-base-content mt-16">
      <div>
        <p class="font-bold">
          LungSeq Analyzer
        </p>
        <p>Clinical-grade genomics analysis powered by WebAssembly</p>
        <p class="text-sm text-base-content/60">Built with Vue 3, Vite, Tailwind CSS, and biowasm</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
// Main app component
</script>

<style>
/* Active route styling */
.router-link-active {
  @apply bg-primary text-primary-content;
}
</style>
