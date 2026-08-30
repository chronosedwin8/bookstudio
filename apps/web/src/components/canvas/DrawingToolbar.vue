<script setup lang="ts">
import { BRUSH_STYLES, usePreferencesStore } from '@/stores/preferences';
import { BRUSH_PRESETS } from '@/utils/strokes';

defineProps<{ tool: 'select' | 'draw' | 'fill'; onionSkin: boolean }>();

const emit = defineEmits<{
  'update:tool': [tool: 'select' | 'draw' | 'fill'];
  'update:onionSkin': [value: boolean];
}>();

const preferences = usePreferencesStore();

const STROKE_COLORS = ['#333333', '#E11D48', '#F59E0B', '#16A34A', '#2563EB', '#7C3AED', '#EC4899', '#FFFFFF'] as const;
</script>

<template>
  <section class="space-y-3">
    <div>
      <h3 class="label">Herramienta</h3>
      <div class="grid grid-cols-3 gap-1">
        <button
          type="button"
          class="btn-secondary px-0 py-1.5 text-xs"
          :class="tool === 'select' && 'bg-brand-50 text-brand-700'"
          title="Seleccionar"
          @click="emit('update:tool', 'select')"
        >⬚</button>
        <button
          type="button"
          class="btn-secondary px-0 py-1.5 text-xs"
          :class="tool === 'draw' && 'bg-brand-50 text-brand-700'"
          title="Dibujar"
          @click="emit('update:tool', 'draw')"
        >✏️</button>
        <button
          type="button"
          class="btn-secondary px-0 py-1.5 text-xs"
          :class="tool === 'fill' && 'bg-brand-50 text-brand-700'"
          title="Bote de pintura"
          @click="emit('update:tool', 'fill')"
        >🪣</button>
      </div>
    </div>

    <template v-if="tool === 'draw'">
      <div>
        <h3 class="label">Pincel</h3>
        <div class="grid grid-cols-2 gap-1">
          <button
            v-for="style in BRUSH_STYLES"
            :key="style"
            type="button"
            class="btn-secondary justify-start px-2 py-1.5 text-[11px]"
            :class="preferences.brushStyle === style && 'bg-brand-50 text-brand-700'"
            @click="preferences.brushStyle = style"
          >
            <span>{{ BRUSH_PRESETS[style].icon }}</span> {{ BRUSH_PRESETS[style].label }}
          </button>
        </div>
      </div>

      <div>
        <label class="label" for="stroke-width">Grosor · {{ preferences.strokeWidth }}</label>
        <input
          id="stroke-width"
          v-model.number="preferences.strokeWidth"
          type="range" min="1" max="40" step="1"
          class="w-full accent-brand-600"
        />
      </div>
    </template>

    <div v-if="tool !== 'select'">
      <h3 class="label">Color</h3>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="color in STROKE_COLORS"
          :key="color"
          type="button"
          class="h-6 w-6 rounded-full border-2"
          :class="preferences.strokeColor === color ? 'border-brand-600' : 'border-slate-300'"
          :style="{ backgroundColor: color }"
          :title="color"
          @click="preferences.strokeColor = color"
        />
        <input
          v-model="preferences.strokeColor"
          type="color"
          class="h-6 w-6 cursor-pointer rounded border border-slate-300"
          title="Color personalizado"
        />
      </div>
    </div>

    <label class="flex items-center gap-2 text-xs text-slate-700">
      <input
        type="checkbox"
        class="h-4 w-4 rounded"
        :checked="onionSkin"
        @change="emit('update:onionSkin', !onionSkin)"
      />
      Papel cebolla
    </label>
  </section>
</template>
