<template>
  <div class="rounded-lg border border-surface1 bg-surface0/30 overflow-hidden">
    <button
      @click="open = !open"
      class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-text hover:bg-surface0/60 transition-colors"
    >
      <span
        class="text-overlay1 transition-transform duration-200 text-xs"
        :class="open ? 'rotate-90' : ''"
      >▶</span>
      {{ title }}
    </button>
    <div v-show="open" class="px-3 pb-3 pt-1 space-y-2">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ title: { type: String, required: true } })
const open = ref(false)
</script>
