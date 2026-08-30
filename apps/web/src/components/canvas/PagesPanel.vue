<script setup lang="ts">
import PagePreview from '@/components/canvas/PagePreview.vue';
import type { Page } from '@/types/api';

const props = defineProps<{
  pages: Page[];
  currentIndex: number;
  aspectRatio: number;
  editable: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  goTo: [index: number];
  add: [];
  remove: [pageId: string];
  duplicate: [pageId: string];
  reorder: [pageIds: string[]];
}>();

const THUMB_WIDTH = 200;

/** Intercambia una pagina con su vecina y manda el orden completo al servidor. */
function move(index: number, step: number): void {
  const target = index + step;
  if (target < 0 || target >= props.pages.length) return;
  const ids = props.pages.map((p) => p.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  emit('reorder', ids);
}

const pageLabel = (index: number, page: Page) => (index === 0 ? 'Portada' : `Pagina ${page.pageNumber}`);
</script>

<template>
  <div class="fixed inset-0 z-[9000] overflow-y-auto bg-slate-900/70 p-6" @click.self="emit('close')">
    <div class="mx-auto max-w-6xl">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-black text-white">Paginas del libro</h2>
          <p class="text-xs text-slate-300">{{ pages.length }} paginas · pulsa una para abrirla</p>
        </div>
        <div class="flex gap-2">
          <button v-if="editable" type="button" class="btn-primary" :disabled="busy" @click="emit('add')">
            + Nueva pagina
          </button>
          <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
        </div>
      </div>

      <ul class="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <li
          v-for="(page, index) in pages"
          :key="page.id"
          class="overflow-hidden rounded-lg border-2 bg-white shadow-lg"
          :class="index === currentIndex ? 'border-brand-500' : 'border-transparent'"
        >
          <button
            type="button"
            class="block w-full"
            :aria-label="`Abrir ${pageLabel(index, page)}`"
            @click="emit('goTo', index)"
          >
            <div class="w-full overflow-hidden" :style="{ aspectRatio: `${aspectRatio}` }">
              <PagePreview
                :background-color="page.backgroundColor"
                :background-pattern="page.backgroundPattern"
                :elements="page.elements"
                :aspect-ratio="aspectRatio"
                :width="THUMB_WIDTH"
              />
            </div>
          </button>

          <div class="flex items-center justify-between gap-1 border-t border-slate-100 px-2 py-1.5">
            <span class="truncate text-xs font-semibold text-slate-600">{{ pageLabel(index, page) }}</span>

            <div v-if="editable" class="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="index === 0 || busy"
                title="Mover antes"
                aria-label="Mover antes"
                @click="move(index, -1)"
              >‹</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="index === pages.length - 1 || busy"
                title="Mover despues"
                aria-label="Mover despues"
                @click="move(index, 1)"
              >›</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="busy"
                title="Duplicar pagina"
                :aria-label="`Duplicar ${pageLabel(index, page)}`"
                @click="emit('duplicate', page.id)"
              >⧉</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-red-500 hover:bg-red-50 disabled:opacity-30"
                :disabled="pages.length <= 1 || busy"
                title="Eliminar pagina"
                :aria-label="`Eliminar ${pageLabel(index, page)}`"
                @click="emit('remove', page.id)"
              >×</button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
