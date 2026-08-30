<script setup lang="ts">
import { ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { MediaResult } from '@/types/api';

const props = defineProps<{ animated?: boolean }>();

const emit = defineEmits<{
  close: [];
  /** El segundo argumento indica si insertar tambien la caja de atribucion. */
  pick: [result: MediaResult, withAttribution: boolean];
}>();

const query = ref('');
const results = ref<MediaResult[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);
const onlyAnimated = ref(props.animated ?? false);
const withAttribution = ref(true);

async function runSearch(): Promise<void> {
  if (query.value.trim().length < 2) return;
  loading.value = true;
  error.value = null;
  try {
    const response = await mediaApi.search({
      q: query.value.trim(),
      type: 'images',
      pageSize: 20,
      // Openverse filtra por formato: gif deja solo las imagenes animadas.
      extension: onlyAnimated.value ? 'gif' : undefined,
    });
    results.value = response.results;
    searched.value = true;
  } catch (err) {
    error.value = errorMessage(err);
    results.value = [];
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">
            {{ onlyAnimated ? 'Buscar imagenes animadas' : 'Buscar imagenes libres' }}
          </h2>
          <p class="text-xs text-slate-500">
            Openverse · solo licencias Creative Commons y dominio público
          </p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <form class="flex gap-2 border-b border-slate-100 px-5 py-3" @submit.prevent="runSearch">
        <input
          v-model.trim="query"
          type="search"
          class="input"
          :placeholder="onlyAnimated ? 'Ej. gato, baile, aplausos...' : 'Ej. volcan, ballena, castillo medieval...'"
          autofocus
        />
        <button type="submit" class="btn-primary shrink-0" :disabled="loading || query.trim().length < 2">
          {{ loading ? 'Buscando...' : 'Buscar' }}
        </button>
      </form>
      <div class="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-100 px-5 py-2 text-sm text-slate-700">
        <label class="flex items-center gap-2">
          <input v-model="withAttribution" type="checkbox" class="h-4 w-4 rounded" />
          Insertar la atribución del autor
        </label>

        <label class="flex items-center gap-2">
          <input v-model="onlyAnimated" type="checkbox" class="h-4 w-4 rounded" @change="runSearch" />
          Solo imagenes animadas (GIF)
        </label>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <AlertMessage :message="error" />

        <p v-if="loading" class="text-sm text-slate-500">Consultando Openverse...</p>

        <p v-else-if="searched && !results.length" class="py-8 text-center text-sm text-slate-500">
          No se encontraron imagenes para "{{ query }}".
        </p>

        <p v-else-if="!searched" class="py-8 text-center text-sm text-slate-400">
          Escribe que quieres buscar. Todas las imagenes se pueden usar y modificar libremente.
        </p>

        <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="item in results" :key="item.id">
            <button
              type="button"
              class="group w-full overflow-hidden rounded-lg border border-slate-200 text-left transition hover:border-brand-500 hover:shadow"
              @click="emit('pick', item, withAttribution)"
            >
              <img
                :src="item.thumbnail"
                :alt="item.title"
                class="aspect-square w-full bg-slate-100 object-cover"
                loading="lazy"
              />
              <span class="block px-2 py-1.5">
                <span class="block truncate text-xs font-medium text-slate-700">{{ item.title }}</span>
                <span class="block truncate text-[11px] text-slate-400">{{ item.creator }} · {{ item.licence }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
