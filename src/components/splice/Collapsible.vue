<template>
  <div
    class="rounded-lg border overflow-hidden"
    :class="large ? 'border-surface2 bg-surface0/50' : 'border-surface1 bg-surface0/30'"
  >
    <button
      @click="open = !open"
      class="w-full flex items-center gap-2 px-3 text-left text-text hover:bg-surface0/60 transition-colors"
      :class="large ? 'py-3 text-base font-bold' : 'py-2 text-sm font-medium'"
    >
      <span
        class="text-overlay1 transition-transform duration-200"
        :class="[open ? 'rotate-90' : '', large ? 'text-sm text-mauve' : 'text-xs']"
      >▶</span>
      {{ title }}
    </button>
    <div v-show="open" class="px-3 pb-4 pt-1 space-y-3" :class="large ? 'sm:px-4' : ''">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  defaultOpen: { type: Boolean, default: false }, // start expanded
  large: { type: Boolean, default: false }, // top-level "tree" styling
})
const open = ref(props.defaultOpen)
</script>
