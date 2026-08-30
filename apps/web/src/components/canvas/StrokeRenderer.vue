<script setup lang="ts">
import { computed } from 'vue';
import { BRUSH_PRESETS } from '@/utils/strokes';
import type { BrushStyle } from '@/stores/preferences';

const props = defineProps<{
  svgPath: string;
  /** Rutas adicionales desplazadas que dan textura de cerdas o crayon. */
  extraPaths?: string[];
  brushStyle: BrushStyle;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  viewBox: string;
}>();

const preset = computed(() => BRUSH_PRESETS[props.brushStyle] ?? BRUSH_PRESETS.pen);
const width = computed(() => props.strokeWidth * preset.value.widthFactor);

const paths = computed(() => [props.svgPath, ...(props.extraPaths ?? [])].filter(Boolean));
</script>

<template>
  <svg class="pointer-events-none h-full w-full overflow-visible" :viewBox="viewBox" preserveAspectRatio="none">
    <path
      v-for="(d, index) in paths"
      :key="index"
      :d="d"
      :fill="index === 0 ? fillColor : 'none'"
      :stroke="strokeColor"
      :stroke-width="width"
      :stroke-linecap="preset.linecap"
      stroke-linejoin="round"
      :stroke-dasharray="preset.dash"
      :opacity="preset.opacity"
    />
  </svg>
</template>
