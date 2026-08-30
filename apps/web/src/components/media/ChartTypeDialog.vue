<script setup lang="ts">
import ChartRenderer from '@/components/canvas/ChartRenderer.vue';
import type { ChartType } from '@/types/api';

const emit = defineEmits<{
  close: [];
  pick: [chartType: ChartType];
}>();

const TYPES: Array<{ id: ChartType; label: string; description: string }> = [
  { id: 'column', label: 'Barras verticales', description: 'Comparar cantidades entre categorias.' },
  { id: 'bar', label: 'Barras horizontales', description: 'Util cuando las etiquetas son largas.' },
  { id: 'line', label: 'Lineas', description: 'Ver como cambia algo con el tiempo.' },
  { id: 'area', label: 'Area', description: 'Como la linea, resaltando el volumen.' },
  { id: 'pie', label: 'Pastel', description: 'Repartir un total en porcentajes.' },
  { id: 'doughnut', label: 'Rosquilla', description: 'Pastel con el centro libre.' },
];

/** Datos de muestra solo para la vista previa del selector. */
const SAMPLE = [
  { label: 'Lun', value: 4, color: '#2563EB' },
  { label: 'Mar', value: 7, color: '#F59E0B' },
  { label: 'Mie', value: 3, color: '#16A34A' },
  { label: 'Jue', value: 9, color: '#DB2777' },
];
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Graficas</h2>
          <p class="text-xs text-slate-500">Los datos se escriben despues en el panel derecho.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="type in TYPES" :key="type.id">
            <button
              type="button"
              class="flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-slate-200 text-left transition hover:border-brand-400"
              @click="emit('pick', type.id)"
            >
              <div class="h-36 w-full bg-slate-50 p-1">
                <ChartRenderer
                  :chart-type="type.id"
                  title=""
                  :series="SAMPLE"
                  :show-values="false"
                  :show-legend="false"
                  accent-color="#2563EB"
                />
              </div>
              <div class="px-3 py-2">
                <p class="text-sm font-semibold text-slate-800">{{ type.label }}</p>
                <p class="text-xs leading-tight text-slate-500">{{ type.description }}</p>
              </div>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
