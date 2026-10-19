<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import type { Recorte } from '@/types/api';

/**
 * Recortar una imagen de la hoja.
 *
 * El recorte es de verdad: se guarda que parte de la imagen se ve (en
 * fracciones de la imagen entera) y el lienzo, el lector y la pagina exportada
 * pintan solo esa parte, por mucho que despues se agrande la caja. El archivo
 * original no se toca, asi que el recorte se puede cambiar o quitar cuando se
 * quiera.
 */
const props = defineProps<{ fileUrl: string; recorte: Recorte | null }>();
const emit = defineEmits<{
  close: [];
  /** null quita el recorte. `ratio` es ancho/alto en pixeles de lo recortado. */
  aplicar: [recorte: Recorte | null, ratio: number];
}>();
const cierre = useCierreExterior(() => emit('close'));

const sel = ref<Recorte>(props.recorte ? { ...props.recorte } : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
const natural = ref<{ w: number; h: number } | null>(null);
const caja = ref<HTMLElement | null>(null);

/** Proporciones fijas, en pixeles de imagen (ancho/alto). null = libre. */
const PROPORCIONES: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: 'libre', label: 'Libre', ratio: null },
  { id: '1:1', label: 'Cuadrado', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];
const proporcion = ref<number | null>(null);

function alCargar(e: Event): void {
  const img = e.target as HTMLImageElement;
  natural.value = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Ajusta el alto a la proporcion elegida, sin salirse de la imagen. */
function encajarProporcion(r: Recorte): Recorte {
  if (!proporcion.value || !natural.value) return r;
  // En fracciones, la proporcion depende de la forma de la imagen entera.
  const k = proporcion.value * (natural.value.h / natural.value.w);
  let w = r.w;
  let h = w / k;
  if (r.y + h > 1) {
    h = 1 - r.y;
    w = h * k;
  }
  if (r.x + w > 1) {
    w = 1 - r.x;
    h = w / k;
  }
  return { ...r, w: Math.max(0.02, w), h: Math.max(0.02, h) };
}

function elegirProporcion(ratio: number | null): void {
  proporcion.value = ratio;
  sel.value = encajarProporcion(sel.value);
}

type Agarre = 'mover' | 'nw' | 'ne' | 'sw' | 'se';
let arrastre: { tipo: Agarre; x0: number; y0: number; inicial: Recorte } | null = null;

function fraccion(e: PointerEvent): { x: number; y: number } {
  const r = caja.value!.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

function empezar(tipo: Agarre, e: PointerEvent): void {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const p = fraccion(e);
  arrastre = { tipo, x0: p.x, y0: p.y, inicial: { ...sel.value } };
}

function mover(e: PointerEvent): void {
  if (!arrastre) return;
  const p = fraccion(e);
  const dx = p.x - arrastre.x0;
  const dy = p.y - arrastre.y0;
  const i = arrastre.inicial;
  if (arrastre.tipo === 'mover') {
    sel.value = { ...i, x: limitar(i.x + dx, 0, 1 - i.w), y: limitar(i.y + dy, 0, 1 - i.h) };
    return;
  }
  let { x, y, w, h } = i;
  if (arrastre.tipo.includes('w')) {
    x = limitar(i.x + dx, 0, i.x + i.w - 0.02);
    w = i.x + i.w - x;
  } else {
    w = limitar(i.w + dx, 0.02, 1 - i.x);
  }
  if (arrastre.tipo.includes('n')) {
    y = limitar(i.y + dy, 0, i.y + i.h - 0.02);
    h = i.y + i.h - y;
  } else {
    h = limitar(i.h + dy, 0.02, 1 - i.y);
  }
  sel.value = encajarProporcion({ x, y, w, h });
}

function soltar(): void {
  arrastre = null;
}
onBeforeUnmount(soltar);

const estiloSel = computed(() => ({
  left: `${sel.value.x * 100}%`,
  top: `${sel.value.y * 100}%`,
  width: `${sel.value.w * 100}%`,
  height: `${sel.value.h * 100}%`,
}));

/** Proporcion en pixeles de lo recortado: con ella se da forma a la caja en la hoja. */
const ratioPx = computed(() =>
  natural.value ? (sel.value.w * natural.value.w) / (sel.value.h * natural.value.h) : sel.value.w / sel.value.h,
);

function aplicar(): void {
  const r = sel.value;
  const redondo = (v: number) => Math.round(v * 10000) / 10000;
  emit('aplicar', { x: redondo(r.x), y: redondo(r.y), w: redondo(r.w), h: redondo(r.h) }, ratioPx.value);
}

function quitar(): void {
  emit('aplicar', null, natural.value ? natural.value.w / natural.value.h : 1);
}

const ESQUINAS: Agarre[] = ['nw', 'ne', 'sw', 'se'];
const posEsquina: Record<string, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize',
  se: '-right-1.5 -bottom-1.5 cursor-nwse-resize',
};
</script>

<template>
  <div
    class="fixed inset-0 z-[9300] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="recorte-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-3xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-center justify-between gap-4 border-b border-slate-200 p-4">
        <div>
          <h2 id="recorte-titulo" class="text-lg font-black text-slate-900">Recortar imagen</h2>
          <p class="text-sm text-slate-500">Mueve el marco o arrastra sus esquinas. Solo se verá lo de dentro.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-4">
        <div class="mb-3 flex flex-wrap gap-1">
          <button
            v-for="p in PROPORCIONES"
            :key="p.id"
            type="button"
            class="rounded-lg border px-2.5 py-1 text-xs font-semibold"
            :class="proporcion === p.ratio ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'"
            @click="elegirProporcion(p.ratio)"
          >{{ p.label }}</button>
        </div>

        <div class="grid place-items-center rounded-lg bg-slate-800 p-3">
          <div
            ref="caja"
            class="relative inline-block touch-none select-none"
            @pointermove="mover"
            @pointerup="soltar"
            @pointercancel="soltar"
          >
            <img :src="fileUrl" alt="" class="block max-h-[60vh] max-w-full" draggable="false" @load="alCargar" />
            <!-- Lo que se quita, oscurecido; lo que queda, con su marco -->
            <div
              class="absolute border-2 border-white"
              :style="{ ...estiloSel, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6)', cursor: 'move' }"
              @pointerdown="empezar('mover', $event)"
            >
              <span class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                <span v-for="n in 9" :key="n" class="border border-white/25" />
              </span>
              <span
                v-for="esq in ESQUINAS"
                :key="esq"
                class="absolute h-3.5 w-3.5 rounded-sm border-2 border-brand-600 bg-white"
                :class="posEsquina[esq]"
                @pointerdown.stop="empezar(esq, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4">
        <button v-if="recorte" type="button" class="btn-secondary" @click="quitar">Quitar el recorte</button>
        <span v-else></span>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="!natural" @click="aplicar">Recortar</button>
        </div>
      </footer>
    </div>
  </div>
</template>
