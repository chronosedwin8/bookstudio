<script setup lang="ts">
import { computed } from 'vue';
import type { ChartProperties, ChartSeries, ChartType } from '@/types/api';

const props = defineProps<{ chart: ChartProperties }>();

const emit = defineEmits<{ patch: [properties: Record<string, unknown>] }>();

const TYPES: Array<{ id: ChartType; label: string; icon: string }> = [
  { id: 'column', label: 'Barras verticales', icon: '▮' },
  { id: 'bar', label: 'Barras horizontales', icon: '▬' },
  { id: 'line', label: 'Lineas', icon: '📈' },
  { id: 'area', label: 'Area', icon: '📉' },
  { id: 'pie', label: 'Pastel', icon: '🥧' },
  { id: 'doughnut', label: 'Rosquilla', icon: '🍩' },
];

const ACCENTS = ['#2563EB', '#16A34A', '#EA580C', '#DB2777', '#7C3AED', '#0891B2'] as const;

const series = computed(() => props.chart.series ?? []);

function update(changes: Partial<ChartProperties>): void {
  emit('patch', { ...props.chart, ...changes });
}

function updateItem(index: number, changes: Partial<ChartSeries>): void {
  update({ series: series.value.map((item, i) => (i === index ? { ...item, ...changes } : item)) });
}

function addItem(): void {
  if (series.value.length >= 24) return;
  update({ series: [...series.value, { label: `Dato ${series.value.length + 1}`, value: 0 }] });
}

function removeItem(index: number): void {
  // La grafica necesita al menos un dato; el backend lo rechazaria vacia.
  if (series.value.length <= 1) return;
  update({ series: series.value.filter((_, i) => i !== index) });
}

function moveItem(index: number, step: number): void {
  const target = index + step;
  if (target < 0 || target >= series.value.length) return;
  const next = [...series.value];
  [next[index], next[target]] = [next[target], next[index]];
  update({ series: next });
}

/** Un valor no numerico dejaria la grafica en blanco: se normaliza a 0. */
function parseValue(raw: string): number {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <label class="label">Tipo de gráfica</label>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="type in TYPES"
          :key="type.id"
          type="button"
          class="rounded-lg border px-1 py-1.5 text-center text-[11px] leading-tight transition"
          :class="chart.chartType === type.id
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50'"
          :title="type.label"
          @click="update({ chartType: type.id })"
        >
          <span class="block text-base">{{ type.icon }}</span>
          {{ type.label.split(' ')[0] }}
        </button>
      </div>
    </div>

    <div>
      <label class="label" for="chart-title">Título</label>
      <input
        id="chart-title"
        type="text"
        class="input"
        :value="chart.title"
        @change="update({ title: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <label class="label mb-0">Datos ({{ series.length }}/24)</label>
        <button
          type="button"
          class="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40"
          :disabled="series.length >= 24"
          @click="addItem"
        >+ Añadir</button>
      </div>

      <ul class="space-y-1.5">
        <li v-for="(item, index) in series" :key="index" class="flex items-center gap-1">
          <input
            type="color"
            class="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-300"
            :value="item.color ?? '#2563EB'"
            :title="`Color de ${item.label}`"
            @change="updateItem(index, { color: ($event.target as HTMLInputElement).value })"
          />
          <input
            type="text"
            class="input min-w-0 flex-1 py-1 text-sm"
            :value="item.label"
            placeholder="Etiqueta"
            @change="updateItem(index, { label: ($event.target as HTMLInputElement).value })"
          />
          <input
            type="number"
            step="any"
            class="input w-20 shrink-0 py-1 text-sm"
            :value="item.value"
            @change="updateItem(index, { value: parseValue(($event.target as HTMLInputElement).value) })"
          />
          <span class="flex shrink-0 flex-col">
            <button
              type="button"
              class="px-1 text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="index === 0"
              aria-label="Subir"
              @click="moveItem(index, -1)"
            >▲</button>
            <button
              type="button"
              class="px-1 text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="index === series.length - 1"
              aria-label="Bajar"
              @click="moveItem(index, 1)"
            >▼</button>
          </span>
          <button
            type="button"
            class="shrink-0 px-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30"
            :disabled="series.length <= 1"
            aria-label="Eliminar dato"
            @click="removeItem(index)"
          >×</button>
        </li>
      </ul>
    </div>

    <div>
      <label class="label">Color principal</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="color in ACCENTS"
          :key="color"
          type="button"
          class="h-7 w-7 rounded border-2"
          :class="chart.accentColor === color ? 'border-slate-800' : 'border-slate-300'"
          :style="{ backgroundColor: color }"
          :title="color"
          @click="update({ accentColor: color })"
        />
      </div>
    </div>

    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        class="h-4 w-4 rounded"
        :checked="chart.showValues"
        @change="update({ showValues: ($event.target as HTMLInputElement).checked })"
      />
      Mostrar los valores
    </label>

    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        class="h-4 w-4 rounded"
        :checked="chart.showLegend"
        @change="update({ showLegend: ($event.target as HTMLInputElement).checked })"
      />
      Mostrar la leyenda (pastel y rosquilla)
    </label>
  </div>
</template>
