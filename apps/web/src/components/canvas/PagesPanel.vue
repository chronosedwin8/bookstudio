<script setup lang="ts">
import { ref } from 'vue';
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

/** Saca la pagina de su sitio y la mete en otro, corriendo el resto. */
function moveTo(from: number, to: number): void {
  if (to < 0 || to >= props.pages.length || from === to) return;
  const ids = props.pages.map((p) => p.id);
  const [movida] = ids.splice(from, 1);
  ids.splice(to, 0, movida);
  emit('reorder', ids);
}

const pageLabel = (index: number, page: Page) => (index === 0 ? 'Portada' : `Página ${page.pageNumber}`);

// --- Arrastrar para reordenar ---
// El intercambio con la vecina obligaba a once pulsaciones para traer la pagina doce
// al principio. Con arrastre es un gesto, y quedan los botones y el salto directo
// para quien no pueda o no quiera arrastrar.
const dragging = ref<number | null>(null);
const over = ref<number | null>(null);

function onDragStart(index: number, event: DragEvent): void {
  if (!props.editable) return;
  dragging.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(index: number, event: DragEvent): void {
  if (dragging.value === null) return;
  event.preventDefault();
  over.value = index;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function onDrop(index: number): void {
  if (dragging.value !== null) moveTo(dragging.value, index);
  dragging.value = null;
  over.value = null;
}

function onDragEnd(): void {
  dragging.value = null;
  over.value = null;
}

// --- Salto directo a una posicion ---
const saltando = ref<string | null>(null);
const destino = ref('');

function abrirSalto(page: Page, index: number): void {
  saltando.value = page.id;
  destino.value = String(index + 1);
}

function confirmarSalto(from: number): void {
  const numero = Number(destino.value);
  if (Number.isInteger(numero) && numero >= 1 && numero <= props.pages.length) {
    moveTo(from, numero - 1);
  }
  saltando.value = null;
}
</script>

<template>
  <div class="fixed inset-0 z-[9000] overflow-y-auto bg-slate-900/70 p-6" @click.self="emit('close')">
    <div class="mx-auto max-w-6xl">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-black text-white">Páginas del libro</h2>
          <p class="text-xs text-slate-300">
            {{ pages.length }} páginas · pulsa una para abrirla<span v-if="editable">
              · arrástralas para cambiarlas de sitio</span>
          </p>
        </div>
        <div class="flex gap-2">
          <button v-if="editable" type="button" class="btn-primary" :disabled="busy" @click="emit('add')">
            + Nueva página
          </button>
          <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
        </div>
      </div>

      <ul class="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <li
          v-for="(page, index) in pages"
          :key="page.id"
          class="overflow-hidden rounded-lg border-2 bg-white shadow-lg transition"
          :class="[
            index === currentIndex ? 'border-brand-500' : 'border-transparent',
            over === index && dragging !== null && dragging !== index ? 'ring-4 ring-brand-400' : '',
            dragging === index ? 'opacity-40' : '',
          ]"
          :draggable="editable && saltando !== page.id"
          @dragstart="onDragStart(index, $event)"
          @dragover="onDragOver(index, $event)"
          @drop.prevent="onDrop(index)"
          @dragend="onDragEnd"
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

          <!-- Salto directo: traer la pagina 12 a la 1 sin arrastrar ni repetir clics -->
          <form
            v-if="saltando === page.id"
            class="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5"
            @submit.prevent="confirmarSalto(index)"
          >
            <label class="shrink-0 text-[11px] text-slate-500" :for="`pos-${page.id}`">A la posición</label>
            <input
              :id="`pos-${page.id}`"
              v-model="destino"
              type="number"
              min="1"
              :max="pages.length"
              class="input w-14 px-1 py-0.5 text-center text-xs"
              autofocus
              @keydown.esc="saltando = null"
            />
            <button type="submit" class="rounded bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">Ir</button>
            <button type="button" class="px-1 text-xs text-slate-400" @click="saltando = null">×</button>
          </form>

          <div v-else class="flex items-center justify-between gap-1 border-t border-slate-100 px-2 py-1.5">
            <span class="truncate text-xs font-semibold text-slate-600">{{ pageLabel(index, page) }}</span>

            <div v-if="editable" class="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="index === 0 || busy"
                title="Mover antes"
                aria-label="Mover antes"
                @click="moveTo(index, index - 1)"
              >‹</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="index === pages.length - 1 || busy"
                title="Mover después"
                aria-label="Mover después"
                @click="moveTo(index, index + 1)"
              >›</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="pages.length < 2 || busy"
                title="Mover a una posición concreta"
                :aria-label="`Mover ${pageLabel(index, page)} a una posición concreta`"
                @click="abrirSalto(page, index)"
              >⇄</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                :disabled="busy"
                title="Duplicar página"
                :aria-label="`Duplicar ${pageLabel(index, page)}`"
                @click="emit('duplicate', page.id)"
              >⧉</button>
              <button
                type="button"
                class="grid h-6 w-6 place-items-center rounded text-red-500 hover:bg-red-50 disabled:opacity-30"
                :disabled="pages.length <= 1 || busy"
                title="Eliminar página"
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
