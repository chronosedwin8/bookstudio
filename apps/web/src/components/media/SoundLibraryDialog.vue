<script setup lang="ts">
import { ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { MediaResult } from '@/types/api';

const emit = defineEmits<{
  close: [];
  pick: [result: MediaResult, withAttribution: boolean];
}>();

const query = ref('');
const results = ref<MediaResult[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const withAttribution = ref(true);
/** Id del sonido que se esta escuchando; solo suena uno a la vez. */
const playing = ref<string | null>(null);

/** Atajos habituales en clase, para no empezar desde una caja vacia. */
const SUGGESTIONS = [
  'applause', 'bell', 'birds', 'rain', 'thunder', 'wind', 'ocean',
  'footsteps', 'door', 'laugh', 'drum', 'piano', 'whistle', 'cat', 'dog',
];

async function runSearch(term?: string): Promise<void> {
  if (term) query.value = term;
  if (query.value.trim().length < 2) return;

  loading.value = true;
  error.value = null;
  try {
    const response = await mediaApi.search({ q: query.value.trim(), type: 'audio', pageSize: 20 });
    results.value = response.results;
    searched.value = true;
  } catch (err) {
    error.value = errorMessage(err);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

/** Reproduce la muestra sin salir del dialogo. */
function preview(item: MediaResult, event: Event): void {
  const audio = event.target as HTMLAudioElement;
  document.querySelectorAll('audio').forEach((other) => {
    if (other !== audio) other.pause();
  });
  playing.value = audio.paused ? null : item.id;
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Biblioteca de sonidos</h2>
          <p class="text-xs text-slate-500">Efectos y musica con licencia abierta, desde Openverse.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <form class="flex gap-2 px-5 py-3" @submit.prevent="runSearch()">
        <input
          v-model.trim="query"
          type="search"
          class="input"
          placeholder="Busca en ingles: applause, rain, bell..."
          autofocus
        />
        <button type="submit" class="btn-primary shrink-0" :disabled="loading || query.trim().length < 2">
          {{ loading ? 'Buscando...' : 'Buscar' }}
        </button>
      </form>

      <div class="flex flex-wrap gap-1.5 px-5 pb-2">
        <button
          v-for="term in SUGGESTIONS"
          :key="term"
          type="button"
          class="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50"
          @click="runSearch(term)"
        >{{ term }}</button>
      </div>

      <label class="flex items-center gap-2 border-b border-slate-100 px-5 py-2 text-sm text-slate-700">
        <input v-model="withAttribution" type="checkbox" class="h-4 w-4 rounded" />
        Insertar la atribucion del autor
      </label>

      <div class="flex-1 overflow-y-auto px-5 py-3">
        <AlertMessage :message="error" />

        <p v-if="loading" class="py-8 text-center text-sm text-slate-500">Buscando sonidos...</p>

        <p v-else-if="searched && !results.length" class="py-8 text-center text-sm text-slate-500">
          Ningun sonido coincide con "{{ query }}". Prueba en ingles.
        </p>

        <p v-else-if="!searched" class="py-8 text-center text-sm text-slate-400">
          Escribe que sonido buscas o pulsa una de las sugerencias.
        </p>

        <ul v-else class="space-y-2">
          <li
            v-for="item in results"
            :key="item.id"
            class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-2"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-800" :title="item.title">{{ item.title }}</p>
              <p class="truncate text-xs text-slate-500">{{ item.creator }} · {{ item.licence }}</p>
            </div>

            <audio
              :src="item.url"
              controls
              preload="none"
              class="h-8 w-full shrink-0 sm:w-56"
              @play="preview(item, $event)"
              @pause="playing = null"
            />

            <button type="button" class="btn-primary shrink-0" @click="emit('pick', item, withAttribution)">
              Insertar
            </button>
          </li>
        </ul>

        <p class="mt-4 text-center text-[11px] text-slate-400">
          Resultados de Openverse, filtrados a licencias Creative Commons y dominio publico.
        </p>
      </div>
    </div>
  </div>
</template>
