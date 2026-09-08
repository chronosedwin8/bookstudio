<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { BookDetail } from '@/types/api';

/**
 * Vista de impresion: todas las paginas seguidas, una por hoja.
 *
 * El PDF lo genera el propio navegador con "Guardar como PDF". Es la via sin
 * dependencias ni servicio externo, y respeta las fuentes y los colores tal cual.
 */
const route = useRoute();

const ASPECT = { square: 1, portrait: 3 / 4, landscape: 4 / 3 } as const;
/** Ancho fijo en px: al imprimir, la hoja se ajusta con la regla @page. */
const PAGE_WIDTH = 900;

/**
 * Que hacer con los objetos que "empiezan ocultos".
 *
 * Por omision NO se imprimen, que es lo prudente: quien imprime una ficha suele
 * ser para repartirla, y llevarse las respuestas puestas es el fallo que duele.
 * Quien quiera la hoja de soluciones lo desmarca.
 */
const mostrarOcultos = ref(false);

/** window no esta expuesto en la plantilla de Vue; se envuelve. */
const print = () => window.print();

const book = ref<BookDetail | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    book.value = await booksApi.get(route.params.id as string);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="print-root bg-slate-200 py-6">
    <p v-if="loading" class="p-8 text-center text-sm text-slate-500">Preparando la impresion...</p>

    <div v-else-if="error" class="mx-auto max-w-md p-8">
      <AlertMessage :message="error" />
    </div>

    <template v-else-if="book">
      <div class="no-print mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4">
        <div>
          <h1 class="font-black text-slate-800">{{ book.title }}</h1>
          <p class="text-xs text-slate-500">
            {{ book.pages.length }} páginas · en el dialogo elige "Guardar como PDF"
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input v-model="mostrarOcultos" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
          Incluir los objetos que empiezan ocultos (hoja de soluciones)
        </label>
        <button type="button" class="btn-primary" @click="print">Imprimir o guardar en PDF</button>
      </div>

      <div class="flex flex-col items-center gap-6">
        <div
          v-for="page in book.pages"
          :key="page.id"
          class="hoja overflow-hidden bg-white shadow-lg"
        >
          <PagePreview
            :background-color="page.backgroundColor"
            :background-pattern="page.backgroundPattern"
            :elements="page.elements"
            :aspect-ratio="ASPECT[book.layoutFormat]"
            :width="PAGE_WIDTH"
            :respetar-ocultos="!mostrarOcultos"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }

  .print-root {
    background: #fff;
    padding: 0;
  }

  /* Una pagina del libro por hoja de papel. */
  .hoja {
    box-shadow: none;
    break-after: page;
    margin: 0;
  }

  .hoja:last-child {
    break-after: auto;
  }
}

@page {
  margin: 8mm;
}
</style>
