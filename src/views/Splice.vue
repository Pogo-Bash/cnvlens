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

    <!-- Install (comprehensive, with platform tree + OS detection) -->
    <InstallSection />

    <!-- .spq files -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">.spq files</h2>
      <p class="text-sm text-subtext0">
        A <code>.spq</code> file is a SpliceQL query plus metadata directives and
        <code>$variables</code>. <code>splice new &lt;name&gt;</code> scaffolds one:
      </p>
      <div class="card-static">
        <pre class="text-xs text-subtext1 leading-relaxed overflow-x-auto">{{ spqAnatomy }}</pre>
      </div>
      <div class="card-static">
        <pre class="text-xs text-subtext1">chmod +x query.spq
./query.spq --bam sample.bam --output results.vcf</pre>
      </div>
    </section>

    <!-- Compiling -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">compiling to a binary</h2>
      <p class="text-sm text-subtext0">
        <code>splice build</code> embeds the compiled bytecode + runtime into a
        standalone binary — no <code>splice</code> needed to run it.
      </p>
      <div class="card-static">
        <pre class="text-xs text-subtext1">splice build query.spq -o variant-caller --release
./variant-caller --bam sample.bam --output results.vcf

splice build query.spq --wasm -o variant-caller
# produces variant-caller.wasm</pre>
      </div>
    </section>

    <!-- Editor support -->
    <section class="space-y-3">
      <h2 class="text-xl font-bold text-text">editor support</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">GitHub</p>
          <p class="text-sm text-subtext0">Automatic via the Linguist PR (see
            <code>crates/spliceql-grammar/linguist/LINGUIST_PR.md</code>).</p>
        </div>
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">Vim / Neovim / Helix</p>
          <p class="text-sm text-subtext0">Zero config — the <code>-- vim: set ft=sql:</code> modeline.</p>
        </div>
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">VS Code</p>
          <p class="text-sm text-subtext0">Install the extension in <code>crates/spliceql-grammar/vscode/</code>.</p>
        </div>
        <div class="card-static">
          <p class="text-xs font-bold text-mauve uppercase tracking-wider mb-1">Other editors</p>
          <p class="text-sm text-subtext0">TextMate grammar at
            <code>crates/spliceql-grammar/grammars/spliceql.tmLanguage.json</code>.</p>
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
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-xs text-subtext0">
            $bam
            <input
              v-model="demoVars.bam"
              class="block mt-1 font-mono text-sm bg-crust text-text rounded px-2 py-1 border border-surface1 focus:border-mauve outline-none"
            />
          </label>
          <label class="text-xs text-subtext0">
            $min_af
            <input
              v-model="demoVars.min_af"
              type="number"
              step="0.01"
              class="block mt-1 w-28 font-mono text-sm bg-crust text-text rounded px-2 py-1 border border-surface1 focus:border-mauve outline-none"
            />
          </label>
        </div>
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
import InstallSection from '../components/splice/InstallSection.vue'

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

const spqAnatomy = `#!/usr/bin/env splice          ← shebang (chmod +x to run directly)
-- vim: set ft=sql:            ← editor highlighting
-- @name: egfr-variant-caller  ← metadata
-- @input: bam required "Input BAM file"
-- @input: min_af optional float 0.05 "Minimum allele frequency"
-- @output: vcf "Variant calls"

FROM bam $bam                  ← $variables, bound from CLI args
WHERE chr = "7" AND depth > 30
CALL variants
WITH min_af = $min_af
INTO vcf $output`

const query = ref(
  `FROM bam $bam
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL variants
WITH min_af = $min_af`,
)

// Variables surfaced for the demo (editable before running).
const demoVars = ref({ bam: 'NA12878_EGFR.bam', min_af: 0.05 })

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
    const vars = { bam: demoVars.value.bam, min_af: Number(demoVars.value.min_af) }
    const result = await engine.execute({ query: query.value, files, vars })
    rows.value = Array.isArray(result) ? result : [result]
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>
