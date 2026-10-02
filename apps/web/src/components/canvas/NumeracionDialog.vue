<script setup lang="ts">
import { computed, ref } from 'vue';
import PagePreview from './PagePreview.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { FONT_GROUPS, type Page, type PageNumbering } from '@/types/api';
import {
  DECORACIONES,
  FORMATOS,
  NUMERACION_POR_DEFECTO,
  POSICIONES,
  estiloNumero,
  normalizarNumeracion,
  numeroDeHoja,
} from '@/utils/numeracion';

/**
 * Numerar las paginas del libro: formato, estilo y posicion.
 *
 * Se aplica a todo el libro, como en un procesador de textos, y se ve al momento
 * sobre dos hojas de muestra (una par y una impar, para que la posicion
 * "exterior" se entienda). Guardar con "Quitar" deja el libro sin numerar.
 */
const props = defineProps<{
  numbering: PageNumbering | null | undefined;
  pages: Page[];
  aspectRatio: number;
  busy?: boolean;
}>();

const emit = defineEmits<{ close: []; save: [numbering: PageNumbering | null] }>();
const cierre = useCierreExterior(() => emit('close'));

const cfg = ref<PageNumbering>({ ...(normalizarNumeracion(props.numbering) ?? NUMERACION_POR_DEFECTO) });
const yaNumerado = computed(() => Boolean(props.numbering));

/**
 * Al cambiar si la portada se numera, el primer numero sigue a la hoja: si
 * estaba en el valor natural (la hoja 2 dice 2, o la portada dice 1), se mueve
 * con ella para que no acabe la hoja 2 diciendo 1 sin que nadie lo pidiera.
 */
function alternarPortada(saltar: boolean): void {
  const natural = cfg.value.skipCover ? 2 : 1;
  if (cfg.value.startAt === natural) cfg.value.startAt = saltar ? 2 : 1;
  cfg.value.skipCover = saltar;
}

/** Dos hojas de muestra: la 2 y la 3 si existen, que es un pliego abierto. */
const muestras = computed(() => {
  const elegidas = props.pages.length >= 3 ? props.pages.slice(1, 3) : props.pages.slice(0, 2);
  return elegidas.length ? elegidas : [];
});
const ANCHO_MUESTRA = 230;

/**
 * El numero a tamano de lectura. En las hojas de muestra va a escala, igual que
 * se vera, pero tan pequeno que no deja juzgar la letra ni el adorno.
 */
const lupa = computed(() => {
  const pagina = muestras.value[0]?.pageNumber ?? 2;
  // Como en el lector a pantalla normal: la hoja de 1000 se ve a unos 650 px. Se
  // escala el tamano de partida, para que el adorno guarde su proporcion.
  const estilo = { ...estiloNumero({ ...cfg.value, fontSize: Math.round(cfg.value.fontSize * 0.65) }, pagina) };
  for (const k of ['position', 'top', 'bottom', 'left', 'right', 'transform', 'z-index']) delete estilo[k];
  return { texto: numeroDeHoja(cfg.value, pagina, props.pages.length) ?? '', estilo };
});
</script>

<template>
  <div
    class="fixed inset-0 z-[9300] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="numeracion-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-4xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <h2 id="numeracion-titulo" class="text-lg font-black text-slate-900">Números de página</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            Se aplican a todo el libro y se ven al editar, al leer, al imprimir y al exportar.
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="grid gap-6 p-5 md:grid-cols-[1fr_auto]">
        <div class="space-y-5">
          <!-- Formato -->
          <fieldset>
            <legend class="label">Formato</legend>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="f in FORMATOS"
                :key="f.id"
                class="cursor-pointer rounded-lg border-2 px-3 py-1.5 text-sm"
                :class="cfg.format === f.id ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-slate-200'"
              >
                <input v-model="cfg.format" type="radio" :value="f.id" class="sr-only" />
                {{ f.ejemplo }}
              </label>
            </div>
          </fieldset>

          <!-- Posición -->
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label" for="num-posicion">Ubicación</label>
              <select id="num-posicion" v-model="cfg.position" class="input">
                <option v-for="p in POSICIONES" :key="p.id" :value="p.id">{{ p.texto }}</option>
              </select>
            </div>
            <div>
              <label class="label" for="num-margen">Distancia al borde ({{ cfg.margin }} %)</label>
              <input id="num-margen" v-model.number="cfg.margin" type="range" min="0" max="20" step="0.5" class="w-full" />
            </div>
          </div>

          <!-- Estilo -->
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="sm:col-span-2">
              <label class="label" for="num-fuente">Tipografía</label>
              <select id="num-fuente" v-model="cfg.fontFamily" class="input">
                <optgroup v-for="group in FONT_GROUPS" :key="group.label" :label="group.label">
                  <option v-for="font in group.fonts" :key="font" :value="font" :style="{ fontFamily: `'${font}', sans-serif` }">
                    {{ font }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div>
              <label class="label" for="num-tamano">Tamaño ({{ cfg.fontSize }})</label>
              <input id="num-tamano" v-model.number="cfg.fontSize" type="range" min="10" max="80" class="w-full" />
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-4">
            <div>
              <label class="label" for="num-color">Color</label>
              <input id="num-color" v-model="cfg.color" type="color" class="h-9 w-14 cursor-pointer rounded border border-slate-300" />
            </div>
            <label class="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input v-model="cfg.bold" type="checkbox" class="h-4 w-4 rounded" />
              Negrita
            </label>
            <div class="min-w-[12rem] flex-1">
              <label class="label" for="num-adorno">Adorno</label>
              <select id="num-adorno" v-model="cfg.decoration" class="input">
                <option v-for="d in DECORACIONES" :key="d.id" :value="d.id">{{ d.texto }}</option>
              </select>
            </div>
            <div v-if="cfg.decoration !== 'ninguno'">
              <label class="label" for="num-acento">{{ cfg.decoration === 'linea' ? 'Color de la raya' : 'Fondo' }}</label>
              <input
                id="num-acento"
                v-model="cfg.accentColor"
                type="color"
                class="h-9 w-14 cursor-pointer rounded border border-slate-300"
              />
            </div>
          </div>

          <!-- Desde dónde -->
          <div class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-slate-50 p-3">
            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                class="h-4 w-4 rounded"
                :checked="cfg.skipCover"
                @change="alternarPortada(($event.target as HTMLInputElement).checked)"
              />
              Sin número en la portada
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-700">
              La primera página numerada lleva el
              <input v-model.number="cfg.startAt" type="number" min="0" max="9999" class="input w-20 py-1" />
            </label>
          </div>
        </div>

        <!-- Vista previa -->
        <div class="flex flex-col items-center gap-2">
          <p class="label mb-0">Vista previa</p>
          <div class="flex gap-1 rounded-lg bg-slate-200 p-2">
            <div v-for="pagina in muestras" :key="pagina.id" class="overflow-hidden bg-white shadow">
              <PagePreview
                :background-color="pagina.backgroundColor"
                :background-pattern="pagina.backgroundPattern"
                :elements="pagina.elements"
                :aspect-ratio="aspectRatio"
                :width="ANCHO_MUESTRA"
                :numbering="cfg"
                :page-number="pagina.pageNumber"
                :total-pages="pages.length"
              />
            </div>
          </div>
          <p class="text-xs text-slate-500">Páginas {{ muestras.map((p) => p.pageNumber).join(' y ') }}</p>
          <div class="mt-2 grid w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <span class="inline-block" :style="lupa.estilo">{{ lupa.texto }}</span>
          </div>
          <p class="text-xs text-slate-500">Tamaño real al leer</p>
        </div>
      </div>

      <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5">
        <button
          v-if="yaNumerado"
          type="button"
          class="btn-secondary text-red-600"
          :disabled="busy"
          @click="emit('save', null)"
        >Quitar los números</button>
        <span v-else></span>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" :disabled="busy" @click="emit('close')">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="busy" @click="emit('save', { ...cfg })">
            {{ busy ? 'Guardando...' : yaNumerado ? 'Guardar cambios' : 'Numerar páginas' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
