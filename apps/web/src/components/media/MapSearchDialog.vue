<script setup lang="ts">
import { ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import MapWidget from './MapWidget.vue';
import { mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { GeocodeResult } from '@/types/api';

const emit = defineEmits<{
  close: [];
  pick: [payload: { latitude: number; longitude: number; zoom: number; label: string }];
}>();

const query = ref('');
const results = ref<GeocodeResult[]>([]);
const selected = ref<GeocodeResult | null>(null);
const zoom = ref(13);
const loading = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);

async function runSearch(): Promise<void> {
  if (query.value.trim().length < 2) return;
  loading.value = true;
  error.value = null;
  try {
    results.value = await mediaApi.geocode(query.value.trim());
    searched.value = true;
    selected.value = results.value[0] ?? null;
  } catch (err) {
    error.value = errorMessage(err);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function confirm(): void {
  if (!selected.value) return;
  emit('pick', {
    latitude: selected.value.latitude,
    longitude: selected.value.longitude,
    zoom: zoom.value,
    label: selected.value.displayName.split(',')[0],
  });
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Insertar un mapa</h2>
          <p class="text-xs text-slate-500">OpenStreetMap · busqueda con Nominatim</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <form class="flex gap-2 border-b border-slate-100 px-5 py-3" @submit.prevent="runSearch">
        <input v-model.trim="query" type="search" class="input" placeholder="Ej. Machu Picchu, Bogota, Rio Nilo..." autofocus />
        <button type="submit" class="btn-primary shrink-0" :disabled="loading || query.trim().length < 2">
          {{ loading ? 'Buscando...' : 'Buscar' }}
        </button>
      </form>

      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <AlertMessage :message="error" />

        <p v-if="loading" class="text-sm text-slate-500">Buscando lugares...</p>
        <p v-else-if="searched && !results.length" class="py-6 text-center text-sm text-slate-500">
          No se encontro "{{ query }}".
        </p>
        <p v-else-if="!searched" class="py-6 text-center text-sm text-slate-400">
          Escribe el nombre de un lugar para localizarlo en el mapa.
        </p>

        <template v-else>
          <ul class="mb-4 space-y-1">
            <li v-for="result in results" :key="`${result.latitude},${result.longitude}`">
              <button
                type="button"
                class="w-full rounded border px-3 py-2 text-left text-sm transition"
                :class="selected === result ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 hover:bg-slate-50'"
                @click="selected = result"
              >
                <span class="block truncate font-medium">{{ result.displayName }}</span>
                <span class="text-xs text-slate-400">{{ result.type }}</span>
              </button>
            </li>
          </ul>

          <div v-if="selected" class="space-y-3">
            <div class="h-64 overflow-hidden rounded-lg border border-slate-200">
              <MapWidget
                :key="`${selected.latitude},${selected.longitude}`"
                :latitude="selected.latitude"
                :longitude="selected.longitude"
                :zoom="zoom"
                :show-marker="true"
                :interactive="true"
              />
            </div>

            <div>
              <label class="label" for="map-zoom">Nivel de acercamiento · {{ zoom }}</label>
              <input id="map-zoom" v-model.number="zoom" type="range" min="2" max="18" class="w-full accent-brand-600" />
            </div>
          </div>
        </template>
      </div>

      <footer class="border-t border-slate-200 px-5 py-3 text-right">
        <button type="button" class="btn-primary" :disabled="!selected" @click="confirm">Insertar mapa</button>
      </footer>
    </div>
  </div>
</template>
