<template>
  <!-- Command output: lighter surface, dim text, no prompt, no copy. -->
  <pre class="rounded-lg px-3 py-2 text-xs leading-relaxed bg-surface0/40 border border-surface0 text-subtext0 overflow-x-auto"><code>{{ code }}</code></pre>
</template>

<script setup>
defineProps({ code: { type: String, required: true } })
</script>
