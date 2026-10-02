<script setup lang="ts">
import PagePreview from '@/components/canvas/PagePreview.vue';
import type { LayoutFormat, Page } from '@/types/api';
import type { OpcionesEntrega } from '@/utils/entrega';

/**
 * Que se entrega, donde cae y con que titulo.
 *
 * Lo usan "Entregar" y "Pasar a biblioteca…": las dos entregan igual, y asi se
 * ven igual. "A quien" no va aqui porque cada una lo resuelve a su manera.
 */
const props = defineProps<{
  /** Paginas del libro de origen; sin ellas solo se puede entregar entero. */
  pages?: Page[];
  layoutFormat?: LayoutFormat;
}>();

const opciones = defineModel<OpcionesEntrega>({ required: true });

const ASPECT = { square: 1, portrait: 3 / 4, landscape: 4 / 3 } as const;
const aspecto = () => ASPECT[props.layoutFormat ?? 'landscape'];

const etiqueta = (pagina: Page, indice: number) => (indice === 0 ? 'Portada' : `Página ${pagina.pageNumber}`);

function alternar(id: string): void {
  const ids = opciones.value.pageIds;
  opciones.value.pageIds = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function todas(): void {
  opciones.value.pageIds = (props.pages ?? []).map((p) => p.id);
}
</script>

<template>
  <div class="space-y-6">
    <!-- Qué se entrega -->
    <fieldset>
      <legend class="text-xs font-bold uppercase tracking-wide text-slate-500">Qué entregas</legend>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
          :class="opciones.alcance === 'libro' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
        >
          <input v-model="opciones.alcance" type="radio" value="libro" class="mt-1 h-4 w-4" />
          <span>
            <span class="block text-sm font-semibold text-slate-800">El libro entero</span>
            <span class="block text-xs text-slate-500">
              {{ pages?.length ?? 0 }} páginas, tal y como está ahora.
            </span>
          </span>
        </label>

        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
          :class="opciones.alcance === 'paginas' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
        >
          <input
            v-model="opciones.alcance"
            type="radio"
            value="paginas"
            class="mt-1 h-4 w-4"
            :disabled="!pages?.length"
          />
          <span>
            <span class="block text-sm font-semibold text-slate-800">Solo algunas páginas</span>
            <span class="block text-xs text-slate-500">Marca las que quieras; van en el orden del libro.</span>
          </span>
        </label>
      </div>

      <div v-if="opciones.alcance === 'paginas' && pages?.length" class="mt-2 rounded-lg border border-slate-200 p-2">
        <div class="mb-1 flex items-center justify-between px-1 text-xs text-slate-500">
          <span>{{ opciones.pageIds.length }} de {{ pages.length }} marcadas</span>
          <span class="flex gap-3">
            <button type="button" class="font-semibold text-brand-600 hover:underline" @click="todas">Todas</button>
            <button type="button" class="font-semibold text-brand-600 hover:underline" @click="opciones.pageIds = []">
              Ninguna
            </button>
          </span>
        </div>
        <ul class="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-1">
          <li v-for="(pagina, indice) in pages" :key="pagina.id">
            <button
              type="button"
              class="relative block overflow-hidden rounded border-2 bg-white transition"
              :class="opciones.pageIds.includes(pagina.id)
                ? 'border-emerald-500 ring-2 ring-emerald-300'
                : 'border-slate-300 hover:border-slate-400'"
              :aria-pressed="opciones.pageIds.includes(pagina.id)"
              :title="etiqueta(pagina, indice)"
              @click="alternar(pagina.id)"
            >
              <PagePreview
                :background-color="pagina.backgroundColor"
                :background-pattern="pagina.backgroundPattern"
                :elements="pagina.elements"
                :aspect-ratio="aspecto()"
                :width="64"
              />
              <span class="absolute bottom-0 right-0 rounded-tl bg-slate-900/70 px-1 text-[10px] font-bold text-white">
                {{ indice === 0 ? '★' : pagina.pageNumber }}
              </span>
              <span
                class="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded border text-[10px] font-black leading-none"
                :class="opciones.pageIds.includes(pagina.id)
                  ? 'border-emerald-600 bg-emerald-500 text-white'
                  : 'border-slate-400 bg-white/90 text-transparent'"
                aria-hidden="true"
              >✓</span>
            </button>
          </li>
        </ul>
      </div>
    </fieldset>

    <!-- Dónde cae -->
    <fieldset>
      <legend class="text-xs font-bold uppercase tracking-wide text-slate-500">Dónde cae</legend>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
          :class="opciones.destino === 'nuevo' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
        >
          <input v-model="opciones.destino" type="radio" value="nuevo" class="mt-1 h-4 w-4" />
          <span>
            <span class="block text-sm font-semibold text-slate-800">En un libro propio de la entrega</span>
            <span class="block text-xs text-slate-500">
              Cada alumno recibe un libro aparte. Si entregas más páginas de este material, se añaden a ese mismo.
            </span>
          </span>
        </label>

        <label
          class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
          :class="opciones.destino === 'existentes' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
        >
          <input v-model="opciones.destino" type="radio" value="existentes" class="mt-1 h-4 w-4" />
          <span>
            <span class="block text-sm font-semibold text-slate-800">Dentro de los libros que ya tienen</span>
            <span class="block text-xs text-slate-500">
              Se inserta en todos los libros que cada alumno tenga en la biblioteca.
            </span>
          </span>
        </label>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-slate-50 p-3">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input v-model="opciones.posicion" type="radio" value="inicio" class="h-4 w-4" />
          Al principio del libro
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input v-model="opciones.posicion" type="radio" value="final" class="h-4 w-4" />
          Detrás de lo que ya haya
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input v-model="opciones.posicion" type="radio" value="despues" class="h-4 w-4" />
          Detrás de la página
          <input
            v-model.number="opciones.despuesDe"
            type="number"
            min="1"
            max="10000"
            class="input w-20 py-1 text-sm"
            aria-label="Número de página"
            @focus="opciones.posicion = 'despues'"
          />
        </label>
        <p v-if="opciones.posicion === 'despues'" class="w-full text-xs text-slate-500">
          La portada es la página 1. Si el libro de un alumno tiene menos páginas, se añade al final.
        </p>
      </div>
    </fieldset>

    <!-- Nombre del libro que recibirán -->
    <div v-if="opciones.destino === 'nuevo'">
      <label class="label" for="entrega-titulo-libro">Título del libro que recibirán</label>
      <input id="entrega-titulo-libro" v-model="opciones.titulo" type="text" maxlength="255" class="input" />
    </div>

    <p v-else class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      A quien no tenga ningún libro propio en la biblioteca no se le entrega nada: no hay dónde insertarlo.
      Te diré cuántos han quedado así.
    </p>
  </div>
</template>
