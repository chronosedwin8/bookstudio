<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * Contenido externo dentro de un iframe con sandbox.
 *
 * La URL la reconstruye el backend contra una lista blanca de proveedores, asi que
 * aqui nunca llega un enlace arbitrario. Aun asi el iframe va con sandbox.
 *
 * referrerpolicy es strict-origin-when-cross-origin, no no-referrer: YouTube exige
 * conocer el origen para autorizar la incrustacion y sin el devuelve "Error 153".
 * Se envia solo el origen (esquema y dominio), nunca la ruta del libro.
 */
const props = defineProps<{
  provider: string;
  embedUrl: string;
  title: string;
  askBeforeLoading?: boolean;
  /** En miniaturas se muestra solo la tarjeta, sin cargar nada externo. */
  preview?: boolean;
}>();

const PROVIDER_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  peertube: 'PeerTube',
  'google-docs': 'Documento de Google',
  'google-slides': 'Presentacion de Google',
  'google-sheets': 'Hoja de Google',
  'google-forms': 'Formulario de Google',
  'microsoft-office': 'Microsoft Office',
  archive: 'Internet Archive',
  wikipedia: 'Wikipedia',
};

const PROVIDER_ICONS: Record<string, string> = {
  youtube: '▶',
  vimeo: '▶',
  peertube: '▶',
  'google-docs': '📄',
  'google-slides': '📊',
  'google-sheets': '📈',
  'google-forms': '📝',
  'microsoft-office': '📄',
  archive: '📚',
  wikipedia: '📖',
};

const label = computed(() => PROVIDER_LABELS[props.provider] ?? props.provider);
const icon = computed(() => PROVIDER_ICONS[props.provider] ?? '🔗');

// Con askBeforeLoading no se contacta con el servicio hasta que alguien lo pide.
const loaded = ref(!props.askBeforeLoading);
</script>

<template>
  <div class="h-full w-full overflow-hidden rounded bg-slate-100 ring-1 ring-slate-300">
    <!-- Tarjeta: en miniatura o mientras no se acepte cargar el contenido externo -->
    <button
      v-if="preview || !loaded"
      type="button"
      class="grid h-full w-full place-items-center gap-1 px-2 text-center"
      :disabled="preview"
      @click.stop="loaded = true"
    >
      <span class="text-3xl">{{ icon }}</span>
      <span class="text-xs font-semibold text-slate-700">{{ title || label }}</span>
      <span v-if="!preview" class="text-[11px] text-brand-600">Pulsa para cargar desde {{ label }}</span>
      <span v-else class="text-[11px] text-slate-500">{{ label }}</span>
    </button>

    <iframe
      v-else
      :src="embedUrl"
      :title="title || label"
      class="h-full w-full border-0"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
    />
  </div>
</template>
