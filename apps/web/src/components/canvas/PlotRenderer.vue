<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { dibujar2D, dibujar3D, normalizarGrafica, redondear, type Vista } from '@/utils/graficas';

/**
 * Grafica de funciones, en 2D o en 3D.
 *
 * El dibujo lo hace utils/graficas.ts (el mismo que usa la pagina exportada);
 * aqui solo va la interaccion:
 *  - deslizadores, que se mueven tanto al editar como al leer;
 *  - al leer: arrastrar para mover (o girar en 3D), rueda o botones para
 *    acercar, y el cursor muestra el valor de cada curva;
 *  - al editar no: el gesto es para mover el elemento por la hoja.
 */
const props = defineProps<{
  properties: Record<string, unknown>;
  /** Lectura o presentacion: se puede mover, acercar y girar. */
  lectura?: boolean;
  /** Miniatura: dibujo fijo, mas basto y sin controles. */
  preview?: boolean;
}>();

const g = computed(() => normalizarGrafica(props.properties));

const caja = ref<HTMLElement | null>(null);
const lienzo = ref<HTMLElement | null>(null);
const tam = ref({ w: 400, h: 300 });

/** Lo que el lector ha movido: no se guarda, al recargar vuelve a lo del autor. */
const valores = ref<Record<string, number>>({});
const vista = ref<Vista | null>(null);
const giro = ref<{ rotZ: number; rotX: number } | null>(null);
const rastreo = ref<number | null>(null);

// Si el autor cambia la grafica, se olvida lo que se hubiera movido encima.
watch(
  () => props.properties,
  () => {
    vista.value = null;
    giro.value = null;
    const nombres = new Set(g.value.params.map((d) => d.name));
    valores.value = Object.fromEntries(Object.entries(valores.value).filter(([k]) => nombres.has(k)));
  },
  { deep: true },
);

let observador: ResizeObserver | undefined;
function medir(): void {
  const el = lienzo.value;
  if (!el) return;
  // clientWidth es el tamano sin la escala de la hoja: el del lienzo logico.
  tam.value = { w: Math.max(80, el.clientWidth), h: Math.max(60, el.clientHeight) };
}
onMounted(() => {
  medir();
  if (typeof ResizeObserver !== 'undefined' && lienzo.value) {
    observador = new ResizeObserver(medir);
    observador.observe(lienzo.value);
  }
});
onBeforeUnmount(() => observador?.disconnect());

const vistaActual = computed<Vista>(
  () => vista.value ?? { xMin: g.value.xMin, xMax: g.value.xMax, yMin: g.value.yMin, yMax: g.value.yMax },
);

const dibujo = computed(() => {
  const { w, h } = tam.value;
  if (g.value.mode === '3d') {
    const r = dibujar3D(g.value, {
      w,
      h,
      valores: valores.value,
      rotZ: giro.value?.rotZ,
      rotX: giro.value?.rotX,
      // Mientras se gira, malla mas ligera para que vaya fluido.
      malla: props.preview ? 14 : arrastrando.value ? 22 : 34,
    });
    return { svg: r.svg, errores: r.errores };
  }
  const r = dibujar2D(g.value, { w, h, vista: vistaActual.value, valores: valores.value, rastreo: rastreo.value });
  return { svg: r.svg, errores: r.errores };
});

const conInteraccion = computed(() => props.lectura && g.value.interactive && !props.preview);
const conDeslizadores = computed(() => !props.preview && g.value.params.length > 0);

/* --- Interaccion al leer --- */

const arrastrando = ref(false);
let inicio: { x: number; y: number; vista: Vista; rotZ: number; rotX: number } | null = null;

/** Posicion del puntero en coordenadas del lienzo logico (sin la escala de la hoja). */
function enLienzo(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const r = lienzo.value!.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * tam.value.w, y: ((e.clientY - r.top) / r.height) * tam.value.h };
}

function alPulsar(e: PointerEvent): void {
  if (!conInteraccion.value) return;
  e.stopPropagation();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  arrastrando.value = true;
  const p = enLienzo(e);
  inicio = {
    ...p,
    vista: { ...vistaActual.value },
    rotZ: giro.value?.rotZ ?? g.value.rotZ,
    rotX: giro.value?.rotX ?? g.value.rotX,
  };
}

function alMover(e: PointerEvent): void {
  if (!conInteraccion.value) return;
  const p = enLienzo(e);
  if (arrastrando.value && inicio) {
    const dx = p.x - inicio.x;
    const dy = p.y - inicio.y;
    if (g.value.mode === '3d') {
      giro.value = {
        rotZ: inicio.rotZ + dx * 0.5,
        rotX: Math.max(0, Math.min(90, inicio.rotX - dy * 0.4)),
      };
    } else {
      const v = inicio.vista;
      const ux = ((v.xMax - v.xMin) * dx) / tam.value.w;
      const uy = ((v.yMax - v.yMin) * dy) / tam.value.h;
      vista.value = { xMin: v.xMin - ux, xMax: v.xMax - ux, yMin: v.yMin + uy, yMax: v.yMax + uy };
    }
    return;
  }
  if (g.value.mode === '2d') {
    const v = vistaActual.value;
    rastreo.value = v.xMin + (p.x / tam.value.w) * (v.xMax - v.xMin);
  }
}

function alSoltar(): void {
  arrastrando.value = false;
  inicio = null;
}

/** Acercar o alejar alrededor de un punto (el cursor, o el centro con los botones). */
function zoom(factor: number, centro?: { x: number; y: number }): void {
  const v = vistaActual.value;
  const cx = centro ? v.xMin + (centro.x / tam.value.w) * (v.xMax - v.xMin) : (v.xMin + v.xMax) / 2;
  const cy = centro ? v.yMax - (centro.y / tam.value.h) * (v.yMax - v.yMin) : (v.yMin + v.yMax) / 2;
  const nueva = {
    xMin: cx - (cx - v.xMin) * factor,
    xMax: cx + (v.xMax - cx) * factor,
    yMin: cy - (cy - v.yMin) * factor,
    yMax: cy + (v.yMax - cy) * factor,
  };
  // Ni tan cerca que todo sean decimales ni tan lejos que no se vea nada.
  const ancho = nueva.xMax - nueva.xMin;
  if (ancho < 1e-4 || ancho > 1e7) return;
  vista.value = nueva;
}

function alRueda(e: WheelEvent): void {
  if (!conInteraccion.value || g.value.mode === '3d') return;
  e.preventDefault();
  e.stopPropagation();
  zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, enLienzo(e));
}

function reiniciar(): void {
  vista.value = null;
  giro.value = null;
  valores.value = {};
}

const movida = computed(() => Boolean(vista.value || giro.value || Object.keys(valores.value).length));

function valorDe(nombre: string, defecto: number): number {
  return valores.value[nombre] ?? defecto;
}
function alDeslizar(nombre: string, e: Event): void {
  valores.value = { ...valores.value, [nombre]: Number((e.target as HTMLInputElement).value) };
}
</script>

<template>
  <div ref="caja" class="flex h-full w-full flex-col overflow-hidden rounded bg-white">
    <div
      ref="lienzo"
      class="relative min-h-0 flex-1"
      :class="conInteraccion ? (g.mode === '3d' ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-crosshair touch-none') : ''"
      @pointerdown="alPulsar"
      @pointermove="alMover"
      @pointerup="alSoltar"
      @pointercancel="alSoltar"
      @pointerleave="rastreo = null"
      @wheel="alRueda"
    >
      <!-- El SVG lo arma utils/graficas.ts con numeros y textos escapados. -->
      <div class="h-full w-full" v-html="dibujo.svg" />

      <div
        v-if="conInteraccion"
        class="absolute right-1.5 top-1.5 flex gap-1"
        @pointerdown.stop
      >
        <template v-if="g.mode === '2d'">
          <button type="button" class="control" aria-label="Acercar" title="Acercar" @click="zoom(1 / 1.4)">+</button>
          <button type="button" class="control" aria-label="Alejar" title="Alejar" @click="zoom(1.4)">−</button>
        </template>
        <button
          v-if="movida"
          type="button"
          class="control"
          aria-label="Volver a la vista original"
          title="Volver a la vista original"
          @click="reiniciar"
        >⟲</button>
      </div>

      <p
        v-if="dibujo.errores.length && !preview"
        class="absolute inset-x-1 bottom-1 rounded bg-red-50/95 px-2 py-1 text-[11px] text-red-700"
      >
        {{ dibujo.errores.map((e) => `Función ${e.indice + 1}: ${e.error}`).join(' · ') }}
      </p>
    </div>

    <!-- Deslizadores: cambian la grafica en vivo, al editar y al leer. -->
    <div
      v-if="conDeslizadores"
      class="deslizadores flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 bg-slate-50 px-3 py-1.5"
      @pointerdown.stop
    >
      <label
        v-for="d in g.params"
        :key="d.name"
        class="flex min-w-[11rem] flex-1 items-center gap-2 text-slate-700"
      >
        <span class="font-bold italic">{{ d.name }}</span>
        <input
          type="range"
          class="min-w-0 flex-1"
          :min="d.min"
          :max="d.max"
          :step="d.step"
          :value="valorDe(d.name, d.value)"
          :aria-label="`Deslizador ${d.name}`"
          @input="alDeslizar(d.name, $event)"
        />
        <span class="w-14 text-right tabular-nums">{{ redondear(valorDe(d.name, d.value)) }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
/* Tamanos en px del lienzo de 1000: la hoja los escala con todo lo demas. */
.deslizadores {
  font-size: 18px;
}
.deslizadores input[type='range'] {
  height: 22px;
}
.control {
  display: grid;
  place-items: center;
  height: 36px;
  width: 36px;
  font-size: 20px;
  border-radius: 0.375rem;
  border: 1px solid #cbd5e1;
  background: rgba(255, 255, 255, 0.92);
  color: #334155;
  font-weight: 700;
  line-height: 1;
}
.control:hover {
  background: #fff;
  color: #0f172a;
}
</style>
