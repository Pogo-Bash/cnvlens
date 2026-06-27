<template>
  <div
    class="rounded-lg overflow-hidden border"
    :class="tint ? 'border-blue/50 bg-mantle' : 'border-surface1 bg-mantle'"
  >
    <!-- header: language label + copy button -->
    <div class="flex items-center justify-between px-3 py-1.5 bg-surface0/60 border-b border-surface1">
      <span class="text-[11px] font-mono uppercase tracking-wider"
        :class="tint ? 'text-blue' : 'text-overlay1'">{{ lang }}</span>
      <button
        @click="copy"
        class="text-[11px] font-mono px-2 py-0.5 rounded transition-colors"
        :class="copied ? 'text-green' : 'text-subtext0 hover:text-text hover:bg-surface1'"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>
    <!-- body: SpliceQL (lang=sql/spliceql) gets per-token highlighting; every
         other language keeps the original per-line rendering. -->
    <pre class="px-3 py-2.5 overflow-x-auto text-xs leading-relaxed"><code><template v-for="(toks, i) in renderedLines" :key="i"><span
      v-if="prompt && lines[i].trim() !== ''" class="text-green select-none">› </span><span
      v-for="(tok, j) in toks" :key="j" :class="tok.cls">{{ tok.text }}</span>{{ '\n' }}</template></code></pre>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  code: { type: String, required: true },
  lang: { type: String, default: 'bash' },
  tint: { type: Boolean, default: false }, // PowerShell blue tint
  prompt: { type: Boolean, default: false }, // green › per command line
})

const lines = computed(() => props.code.replace(/\n$/, '').split('\n'))
const copied = ref(false)

/* ── SpliceQL token highlighting ─────────────────────────────────────────────
 * Vocabulary mirrors the SpliceQL lexer (CodonSplice engine) and the CodeMirror
 * editor mode shipped by `splice create`. Only sql/spliceql blocks are
 * tokenized; bash/other blocks fall back to the original per-line classes. */
const HL_LANGS = new Set(['sql', 'spliceql', 'spq'])
const highlightable = computed(() => HL_LANGS.has(props.lang.toLowerCase()))

const KW = new Set('from select where and or not call with order by asc desc limit into as'.split(' '))
const BOOL = new Set(['true', 'false'])
const TYPES = new Set('bam vcf bed fasta cram json tsv variants cnv coverage reads header'.split(' '))
const FNS = new Set('abs floor ceil round sqrt pow min max log coalesce len upper lower concat contains starts_with ends_with substr gc revcomp translate codon_at'.split(' '))
const PARAMS = new Set('min_af min_allele_freq min_depth min_base_quality min_mapping_quality min_variant_reads min_strand_bias window_size amp_threshold del_threshold min_windows segmentation_method'.split(' '))

function tokenizeSql(line) {
  const out = []
  let buf = ''
  const flush = () => { if (buf) { out.push({ text: buf, cls: '' }); buf = '' } }
  let i = 0
  while (i < line.length) {
    const rest = line.slice(i)
    let m
    if ((m = /^--.*/.exec(rest))) { flush(); out.push({ text: m[0], cls: 'text-overlay0 italic' }); break }
    if ((m = /^"(?:[^"\\]|\\.)*"?/.exec(rest))) { flush(); out.push({ text: m[0], cls: 'text-green' }); i += m[0].length; continue }
    if ((m = /^\$[A-Za-z_]\w*/.exec(rest))) { flush(); out.push({ text: m[0], cls: 'text-flamingo' }); i += m[0].length; continue }
    if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { flush(); out.push({ text: m[0], cls: 'text-peach' }); i += m[0].length; continue }
    if ((m = /^(>=|<=|!=|=|>|<|\+|\*|\/|-)/.exec(rest))) { flush(); out.push({ text: m[0], cls: 'text-teal' }); i += m[0].length; continue }
    if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
      flush()
      const w = m[0]
      const lw = w.toLowerCase()
      let cls = ''
      if (KW.has(lw)) cls = 'text-mauve font-semibold'
      else if (BOOL.has(lw)) cls = 'text-peach'
      else if (TYPES.has(lw)) cls = 'text-yellow'
      else if (PARAMS.has(lw)) cls = 'text-sapphire'
      else if (FNS.has(lw)) cls = 'text-blue'
      out.push({ text: w, cls })
      i += w.length
      continue
    }
    buf += line[i]
    i += 1
  }
  flush()
  if (out.length === 0) out.push({ text: '', cls: '' })
  return out
}

// One entry per line; each entry is an array of { text, cls } token spans.
const renderedLines = computed(() =>
  lines.value.map((line) => {
    if (highlightable.value) return tokenizeSql(line)
    // Original behaviour: shell comments dim, everything else default text.
    const cls = line.trim().startsWith('#') ? 'text-overlay0' : 'text-text'
    return [{ text: line, cls }]
  })
)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code)
  } catch {
    // Fallback for non-secure contexts.
    const ta = document.createElement('textarea')
    ta.value = props.code
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>
