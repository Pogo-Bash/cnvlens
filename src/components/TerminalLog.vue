<template>
  <div class="terminal-log" ref="logContainer">
    <div v-for="(line, idx) in lines" :key="idx" class="flex gap-2 leading-relaxed">
      <span class="text-overlay0 select-none shrink-0">{{ line.timestamp }}</span>
      <span
        v-if="line.level"
        class="shrink-0 select-none"
        :class="{
          'text-green': line.level === 'INFO',
          'text-peach': line.level === 'WARN',
          'text-red': line.level === 'ERROR',
          'text-overlay1': line.level === 'DEBUG',
        }"
      >[{{ line.level }}]</span>
      <span class="text-subtext1">{{ line.message }}</span>
    </div>
    <div v-if="running" class="flex items-center gap-1 mt-1">
      <span class="w-2 h-4 bg-mauve/80 animate-pulse"></span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  lines: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
});

const logContainer = ref(null);

watch(
  () => props.lines.length,
  async () => {
    await nextTick();
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  }
);
</script>
