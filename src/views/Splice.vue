<template>
  <div class="space-y-10">
    <!-- Header -->
    <section class="max-w-3xl">
      <h1 class="text-3xl font-bold text-text mb-2">CodonSplice / SpliceQL</h1>
      <p class="text-subtext0 leading-relaxed">
        A SQL-like query language for genomic files. SpliceQL compiles to bytecode and
        runs on the CodonSplice VM, which bridges to <code>cnvlens-core</code> for BAM/VCF
        parsing, coverage, and variant calling — natively or in the browser via WASM.
      </p>
    </section>

    <!-- Status badges -->
    <section class="card-static">
      <h2 class="text-sm font-bold text-subtext1 uppercase tracking-wider mb-3">build status</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div v-for="p in phases" :key="p.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface0">
          <span class="inline-block w-2 h-2 rounded-full" :class="p.done ? 'bg-green' : 'bg-overlay0'" />
          <span class="text-sm text-text font-medium">{{ p.label }}</span>
          <span class="ml-auto text-xs" :class="p.done ? 'text-green' : 'text-subtext0'">
            {{ p.done ? '✓ complete' : 'pending' }}
          </span>
        </div>
      </div>
    </section>

    <!-- Install -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">install</h2>
      <div class="card-static border-l-4 border-peach">
        <p class="text-sm text-text font-semibold mb-1">New: interactive installer</p>
        <p class="text-sm text-subtext0">
          Run <code>splice install</code> for a guided TUI that detects your environment
          (rustc, cargo, npm, wasm-pack) and walks you through CLI, Rust-library, or npm setup.
        </p>
        <pre class="mt-3 text-xs bg-crust rounded-lg p-3 text-subtext1 overflow-x-auto">{{ installerPreview }}</pre>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">CLI</p>
          <pre class="text-xs text-subtext1">cargo install codonsplice</pre>
        </div>
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">Rust</p>
          <pre class="text-xs text-subtext1">codonsplice = "0.1"
spliceql    = "0.1"</pre>
        </div>
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">npm</p>
          <pre class="text-xs text-subtext1">npm i @codonsplice/wasm</pre>
        </div>
      </div>
    </section>

    <!-- WASM live demo -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">run in the browser (WASM)</h2>
      <p class="text-sm text-subtext0">
        The <code>execute()</code> and <code>stream()</code> APIs are implemented. This demo runs
        the query against the bundled NA12878 EGFR sample BAM entirely in your browser.
      </p>
      <div class="card-static space-y-3">
        <textarea
          v-model="query"
          rows="5"
          spellcheck="false"
          class="w-full font-mono text-sm bg-crust text-text rounded-lg p-3 border border-surface1 focus:border-mauve outline-none"
        />
        <div class="flex items-center gap-3">
          <button
            @click="runQuery"
            :disabled="loading"
            class="px-4 py-2 rounded-lg text-sm font-bold bg-mauve text-crust hover:bg-lavender transition-colors disabled:opacity-50"
          >
            {{ loading ? 'running…' : 'Run Query' }}
          </button>
          <span v-if="error" class="text-sm text-red">{{ error }}</span>
          <span v-else-if="rows.length" class="text-sm text-green">{{ rows.length }} record(s)</span>
        </div>

        <div v-if="rows.length" class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-subtext1 border-b border-surface1">
              <tr><th v-for="c in columns" :key="c" class="py-1.5 pr-4 font-bold">{{ c }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows.slice(0, 50)" :key="i" class="border-b border-surface0">
                <td v-for="c in columns" :key="c" class="py-1 pr-4 text-subtext0 font-mono">{{ r[c] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Architecture -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">architecture</h2>
      <div class="card-static">
        <pre class="text-xs text-subtext1 leading-relaxed overflow-x-auto">{{ architecture }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const phases = [
  { id: 1, label: 'Phase 1 — Lexer', done: true },
  { id: 2, label: 'Phase 2 — Parser', done: true },
  { id: 3, label: 'Phase 3 — Compiler / VM', done: true },
  { id: 4, label: 'Phase 4 — Execution', done: true },
  { id: 5, label: 'Phase 5 — npm / WASM', done: true },
]

const installerPreview = ` CodonSplice Installer   WELCOME  DETECT  METHOD  INSTALL  VERIFY
 ✓ rustc        rustc 1.78.0 (stable)
 ✓ cargo        cargo 1.78.0
 ✓ npm          10.2.4
 → wasm-pack    not found (cargo install wasm-pack)`

const architecture = `  SpliceQL (language)            CodonSplice (engine)
  ───────────────────            ────────────────────
  Lexer → Parser → AST     →     Compiler → Bytecode → VM
                                                │
                          ┌─────────────────────┼─────────────────────┐
                     CALL_VARIANTS         CALL_CNV / CALL_COVERAGE   CALL_READS
                          │                      │                      │
                          ▼                      ▼                      ▼
              cnvlens-core::variants   cnvlens-core::coverage    cnvlens-core::bam
              call_variants_region     analyze_coverage_region   for_each_region_full
                          └──────────── BAI seeking (noodles csi) ────────────┘`

const query = ref(
  `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL variants
WITH min_allele_freq = 0.05`,
)

const loading = ref(false)
const error = ref('')
const rows = ref([])

const columns = computed(() => (rows.value.length ? Object.keys(rows.value[0]) : []))

async function loadEngine() {
  // The @codonsplice/wasm package is produced by scripts/build-wasm.sh. We
  // import it dynamically (and @vite-ignore so Vite doesn't hard-require it at
  // build time) — if it isn't built yet, surface a friendly message.
  // Build the specifier from parts so the bundler can't statically resolve it
  // at build time (the package is produced separately by scripts/build-wasm.sh).
  const spec = ['@codonsplice', 'wasm', 'helpers'].join('/')
  try {
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ spec)
    return mod
  } catch (e) {
    throw new Error('WASM package not built — run scripts/build-wasm.sh first')
  }
}

async function fetchSampleFiles() {
  const base = import.meta.env.BASE_URL
  const [bam, bai] = await Promise.all([
    fetch(`${base}sample-data/NA12878_EGFR.bam`).then((r) => r.arrayBuffer()),
    fetch(`${base}sample-data/NA12878_EGFR.bam.bai`).then((r) => r.arrayBuffer()),
  ])
  return {
    'NA12878_EGFR.bam': new Uint8Array(bam),
    'NA12878_EGFR.bam.bai': new Uint8Array(bai),
  }
}

async function runQuery() {
  loading.value = true
  error.value = ''
  rows.value = []
  try {
    const engine = await loadEngine()
    const files = await fetchSampleFiles()
    const result = await engine.execute({ query: query.value, files })
    rows.value = Array.isArray(result) ? result : [result]
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>
