<script setup lang="ts">
import { ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';

const emit = defineEmits<{
  close: [];
  pick: [payload: { sourceUrl: string; title: string; askBeforeLoading: boolean }];
}>();

const url = ref('');
const title = ref('');
const askBeforeLoading = ref(true);
const error = ref<string | null>(null);

/** Debe coincidir con la lista blanca del backend (canvas/embeds.ts). */
const PROVIDERS = [
  { label: 'YouTube', example: 'youtube.com/watch?v=...' },
  { label: 'Vimeo', example: 'vimeo.com/123456789' },
  { label: 'PeerTube', example: 'framatube.org/w/...' },
  { label: 'Documentos de Google', example: 'docs.google.com/document/d/...' },
  { label: 'Presentaciones de Google', example: 'docs.google.com/presentation/d/...' },
  { label: 'Hojas de calculo de Google', example: 'docs.google.com/spreadsheets/d/...' },
  { label: 'Formularios de Google', example: 'docs.google.com/forms/d/...' },
  { label: 'Microsoft Office', example: 'contoso.sharepoint.com/...' },
  { label: 'Internet Archive (libros gratis)', example: 'archive.org/details/...' },
  { label: 'Wikipedia y Wikisource', example: 'es.wikipedia.org/wiki/...' },
  { label: 'Canva', example: 'canva.com/design/.../view' },
  { label: 'Genially', example: 'view.genially.com/...' },
  { label: 'H5P (open source)', example: 'tu-instancia/h5p/embed/123' },
  { label: 'Padlet', example: 'padlet.com/usuario/muro' },
  { label: 'Desmos', example: 'desmos.com/calculator/...' },
  { label: 'GeoGebra', example: 'geogebra.org/m/...' },
  { label: 'ThingLink', example: 'thinglink.com/scene/...' },
];

function submit(): void {
  const value = url.value.trim();
  if (!value) return;
  if (!/^https:\/\//i.test(value)) {
    error.value = 'El enlace debe empezar por https://';
    return;
  }
  error.value = null;
  emit('pick', { sourceUrl: value, title: title.value.trim(), askBeforeLoading: askBeforeLoading.value });
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 class="font-bold text-slate-900">Incrustar contenido</h2>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <form class="flex-1 space-y-4 overflow-y-auto p-5" @submit.prevent="submit">
        <AlertMessage :message="error" />

        <div>
          <label class="label" for="embed-url">Enlace</label>
          <input
            id="embed-url"
            v-model="url"
            type="url"
            class="input"
            placeholder="https://www.youtube.com/watch?v=..."
            autofocus
            required
          />
        </div>

        <div>
          <label class="label" for="embed-title">Titulo (para lectores de pantalla)</label>
          <input id="embed-title" v-model="title" type="text" maxlength="300" class="input" placeholder="Ej. Video sobre volcanes" />
        </div>

        <label class="flex items-start gap-2 text-sm text-slate-700">
          <input v-model="askBeforeLoading" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
          <span>
            Pedir confirmacion antes de cargarlo
            <span class="block text-xs text-slate-500">
              Recomendado: hasta que alguien lo pulse, no se contacta con el servicio externo.
            </span>
          </span>
        </label>

        <details class="rounded-lg border border-slate-200 px-3 py-2">
          <summary class="cursor-pointer text-sm font-semibold text-slate-700">Servicios admitidos</summary>
          <ul class="mt-2 space-y-1 text-xs text-slate-500">
            <li v-for="provider in PROVIDERS" :key="provider.label">
              <span class="font-semibold text-slate-600">{{ provider.label }}</span> — {{ provider.example }}
            </li>
          </ul>
          <p class="mt-2 text-[11px] leading-tight text-amber-700">
            Casi todos son servicios privativos: el contenido se carga desde sus servidores,
            no desde el colegio. Solo se admiten estos dominios; cualquier otro enlace se rechaza.
          </p>
        </details>

        <button type="submit" class="btn-primary w-full" :disabled="!url.trim()">Insertar</button>
      </form>
    </div>
  </div>
</template>
