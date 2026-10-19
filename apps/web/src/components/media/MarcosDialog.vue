<script setup lang="ts">
import { ref } from 'vue';
import FrameRenderer from '@/components/canvas/FrameRenderer.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { GRUPOS_MARCOS, MARCOS, type Marco } from '@/utils/marcos';

/**
 * Galeria de marcos, por grupos, como la de Canva. Al elegir uno se inserta con
 * el paisaje de muestra; la foto se pone despues desde el panel de la derecha.
 */
const emit = defineEmits<{ close: []; pick: [marco: Marco] }>();
const cierre = useCierreExterior(() => emit('close'));
const grupo = ref(GRUPOS_MARCOS[0]);
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="marcos-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-3xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-center justify-between gap-4 border-b border-slate-200 p-4">
        <div>
          <h2 id="marcos-titulo" class="text-lg font-black text-slate-900">Marcos</h2>
          <p class="text-sm text-slate-500">Inserta un marco y pon dentro la imagen que quieras.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>
      <div class="p-4">
        <div class="mb-3 flex flex-wrap gap-1" role="tablist">
          <button
            v-for="g in GRUPOS_MARCOS"
            :key="g"
            type="button"
            role="tab"
            class="rounded-full border px-3 py-1 text-xs font-semibold"
            :class="grupo === g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'"
            :aria-selected="grupo === g"
            @click="grupo = g"
          >{{ g }}</button>
        </div>
        <div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <button
            v-for="m in MARCOS.filter((x) => x.grupo === grupo)"
            :key="m.id"
            type="button"
            class="grid h-24 place-items-center rounded-lg p-2 transition hover:bg-slate-100 hover:ring-2 hover:ring-brand-300"
            :title="m.label"
            :aria-label="`Insertar marco ${m.label}`"
            @click="emit('pick', m)"
          >
            <span class="block" :style="{ height: m.ratio >= 1 ? `${64 / m.ratio}px` : '64px', width: m.ratio >= 1 ? '64px' : `${64 * m.ratio}px` }">
              <FrameRenderer :properties="{ frame: m.id, frameColor: '#1E293B' }" />
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
