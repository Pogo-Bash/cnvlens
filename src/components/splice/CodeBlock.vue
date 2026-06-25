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
    <!-- body -->
    <pre class="px-3 py-2.5 overflow-x-auto text-xs leading-relaxed"><code><template v-for="(line, i) in lines" :key="i"><span
      v-if="prompt && line.trim() !== ''" class="text-green select-none">› </span><span
      :class="lineClass(line)">{{ line }}</span>{{ '\n' }}</template></code></pre>
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

function lineClass(line) {
  const t = line.trim()
  if (t.startsWith('#')) return 'text-overlay0' // comments dim
  return 'text-text'
}

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
