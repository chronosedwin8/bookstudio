<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CanvasElementBox from './CanvasElementBox.vue';
import DrawingLayer from './DrawingLayer.vue';
import ElementRenderer from './ElementRenderer.vue';
import PageNumberMark from './PageNumberMark.vue';
import { fondoDePagina } from '@/utils/papers';
import { cajaDe, escalarCaja, type Escala } from '@/utils/grupo';
import type { CanvasElement, Page, PageNumbering, TransformMatrix } from '@/types/api';
import type { Tabla } from '@/utils/tablas';

const props = defineProps<{
  page: Page;
  elements: CanvasElement[];
  aspectRatio: number;
  selectedId: string | null;
  /** Todos los elementos seleccionados; con mas de uno se mueven en bloque. */
  selectedIds?: string[];
  editable: boolean;
  /** Bloquear y desbloquear desde la barra flotante: el profesorado. */
  puedeBloquear?: boolean;
  /** La seleccion es un grupo guardado: la barra ofrece desagrupar. */
  agrupada?: boolean;
  /** `select` deja interactuar con los elementos; el resto activa la capa de dibujo. */
  tool?: 'select' | 'draw' | 'fill';
  /** Elementos de la pagina anterior mostrados en semitransparencia para calcar. */
  onionElements?: CanvasElement[];
  /** Texto recien insertado: se abre para escribir sin tener que buscarlo. */
  autoEditId?: string | null;
  /** Numeracion del libro: se ve mientras se edita, igual que al leer. */
  numbering?: PageNumbering | null;
  totalPages?: number;
}>();

const emit = defineEmits<{
  select: [id: string | null, additive?: boolean];
  selectMany: [ids: string[]];
  selectOnly: [id: string];
  moveSelection: [dx: number, dy: number];
  commit: [id: string, transform: TransformMatrix];
  updateText: [id: string, value: string];
  updateTable: [id: string, tabla: Tabla];
  stroke: [
    payload: {
      points: Array<{ x: number; y: number }>;
      transform: TransformMatrix;
      properties: Record<string, unknown>;
    },
  ];
  fill: [point: { x: number; y: number }];
  accion: [tipo: 'duplicar' | 'bloquear' | 'borrar' | 'agrupar' | 'desagrupar', id: string];
  /** Cambiar el tamano de toda la seleccion a la vez. */
  escalar: [escala: Escala];
}>();

/** Lienzo logico; el render se adapta con transform: scale() sin recalcular coordenadas. */
const BASE_WIDTH = 1000;
/** Debe coincidir con el p-4 del viewport: el hueco util descuenta ese margen. */
const VIEWPORT_PADDING = 16;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

const container = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
/** Escala que hace que la pagina entera quepa en pantalla. */
const fitScale = ref(1);
/** Multiplicador elegido por el usuario: 1 = ajustado a la ventana. */
const zoom = ref(1);

const baseHeight = computed(() => BASE_WIDTH / props.aspectRatio);

function recalcFit(): void {
  // Se mide el contenedor exterior, no el que scrollea: sus barras cambiarian la medida.
  const el = container.value;
  if (!el) return;
  const width = el.clientWidth - VIEWPORT_PADDING * 2;
  const height = el.clientHeight - VIEWPORT_PADDING * 2;
  if (width <= 0 || height <= 0) return;
  fitScale.value = Math.min(width / BASE_WIDTH, height / baseHeight.value, 1.5);
}

let observer: ResizeObserver | undefined;

onMounted(() => {
  recalcFit();
  observer = new ResizeObserver(recalcFit);
  if (container.value) observer.observe(container.value);
});

onBeforeUnmount(() => observer?.disconnect());

// Un formato de pagina distinto invalida el ajuste anterior.
watch(() => props.aspectRatio, recalcFit);

const scale = computed(() => fitScale.value * zoom.value);
const renderedWidth = computed(() => BASE_WIDTH * scale.value);
const renderedHeight = computed(() => baseHeight.value * scale.value);

/**
 * El marco ocupa el tamano ya escalado: transform no altera la caja de layout, asi
 * que sin esto la pagina seguiria midiendo 1000 x baseHeight y se desbordaria
 * (los formatos verticales quedaban cortados por abajo).
 */
const frameStyle = computed(() => ({
  width: `${renderedWidth.value}px`,
  height: `${renderedHeight.value}px`,
}));

const pageStyle = computed(() => ({
  width: `${BASE_WIDTH}px`,
  height: `${baseHeight.value}px`,
  transform: `scale(${scale.value})`,
  backgroundColor: props.page.backgroundColor,
  // El patron se dibuja en el espacio logico, asi que el zoom no lo pixela.
  ...fondoDePagina(props.page.backgroundPattern, props.page.backgroundImage),
}));

// --- Seleccion multiple ---

const chosen = computed(() => props.selectedIds ?? (props.selectedId ? [props.selectedId] : []));
const isGrouped = computed(() => chosen.value.length > 1);

/** Desplazamiento en curso de un arrastre de grupo, en % de pagina. */
const groupOffset = ref({ x: 0, y: 0 });

function onGroupDrag(dx: number, dy: number): void {
  groupOffset.value = { x: dx, y: dy };
}

function onGroupCommit(dx: number, dy: number): void {
  groupOffset.value = { x: 0, y: 0 };
  if (dx !== 0 || dy !== 0) emit('moveSelection', dx, dy);
}

const offsetFor = (id: string) => (isGrouped.value && chosen.value.includes(id) ? groupOffset.value : null);

/**
 * Un elemento de un grupo guardado que aun no esta elegido: al pulsarlo se
 * eligen todos los del grupo, asi que hay que arrastrarlo como grupo desde ya.
 */
function arrastraComoGrupo(element: CanvasElement): boolean {
  if (chosen.value.includes(element.id)) return isGrouped.value;
  const grupo = element.transformMatrix.group;
  if (!grupo) return false;
  return props.elements.some((otro) => otro.id !== element.id && otro.transformMatrix.group === grupo);
}

/* --- Cambiar el tamano de varios a la vez --- */

const seleccionados = computed(() => props.elements.filter((el) => chosen.value.includes(el.id)));
/** Escalado en curso; mientras dura, los elementos se ven ya con su tamano nuevo. */
const escalaEnCurso = ref<Escala | null>(null);

const cajaGrupo = computed(() => {
  if (!isGrouped.value) return null;
  const c = cajaDe(seleccionados.value);
  if (!c) return null;
  const e = escalaEnCurso.value;
  if (e) {
    return { x: e.ax + (c.x - e.ax) * e.sx, y: e.ay + (c.y - e.ay) * e.sy, width: c.width * e.sx, height: c.height * e.sy };
  }
  return { ...c, x: c.x + groupOffset.value.x, y: c.y + groupOffset.value.y };
});

const vistaDe = (element: CanvasElement): TransformMatrix | null =>
  escalaEnCurso.value && chosen.value.includes(element.id) && !element.isLocked
    ? escalarCaja(element.transformMatrix, escalaEnCurso.value)
    : null;

type Tirador = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';
const TIRADORES: Array<{ id: Tirador; clase: string; cursor: string }> = [
  { id: 'nw', clase: '-left-2 -top-2 h-4 w-4 rounded-full', cursor: 'nwse-resize' },
  { id: 'ne', clase: '-right-2 -top-2 h-4 w-4 rounded-full', cursor: 'nesw-resize' },
  { id: 'se', clase: '-bottom-2 -right-2 h-4 w-4 rounded-full', cursor: 'nwse-resize' },
  { id: 'sw', clase: '-bottom-2 -left-2 h-4 w-4 rounded-full', cursor: 'nesw-resize' },
  { id: 'n', clase: 'left-1/2 -top-1.5 h-3 w-6 -translate-x-1/2 rounded-sm', cursor: 'ns-resize' },
  { id: 's', clase: 'left-1/2 -bottom-1.5 h-3 w-6 -translate-x-1/2 rounded-sm', cursor: 'ns-resize' },
  { id: 'w', clase: 'top-1/2 -left-1.5 h-6 w-3 -translate-y-1/2 rounded-sm', cursor: 'ew-resize' },
  { id: 'e', clase: 'top-1/2 -right-1.5 h-6 w-3 -translate-y-1/2 rounded-sm', cursor: 'ew-resize' },
];

/**
 * Esquinas: todo crece o encoge parejo, en proporcion (con Shift, libre).
 * Lados: se estira el conjunto en un solo sentido. El punto fijo es siempre la
 * esquina o el lado contrario, como al cambiar el tamano de un solo objeto.
 */
function onEscalarInicio(event: PointerEvent, tirador: Tirador): void {
  const c = cajaDe(seleccionados.value);
  if (!c || !props.editable) return;
  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);

  const startX = event.clientX;
  const startY = event.clientY;
  const izq = tirador.includes('w');
  const der = tirador.includes('e');
  const arr = tirador.includes('n');
  const aba = tirador.includes('s');
  const ax = izq ? c.x + c.width : c.x;
  const ay = arr ? c.y + c.height : c.y;
  const esquina = tirador.length === 2;

  const move = (e: PointerEvent) => {
    const dx = ((e.clientX - startX) / renderedWidth.value) * 100;
    const dy = ((e.clientY - startY) / renderedHeight.value) * 100;
    let sx = 1;
    let sy = 1;
    if (izq || der) sx = Math.max(0.05, (c.width + (der ? dx : -dx)) / c.width);
    if (arr || aba) sy = Math.max(0.05, (c.height + (aba ? dy : -dy)) / c.height);
    if (esquina && !e.shiftKey) sx = sy = Math.max(sx, sy);
    escalaEnCurso.value = { ax, ay, sx, sy };
  };

  const end = (e: PointerEvent) => {
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    const escala = escalaEnCurso.value;
    escalaEnCurso.value = null;
    if (escala && (Math.abs(escala.sx - 1) > 0.005 || Math.abs(escala.sy - 1) > 0.005)) emit('escalar', escala);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

/** Rectangulo de seleccion sobre el fondo de la pagina. */
const marquee = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

const marqueeStyle = computed(() => {
  const m = marquee.value;
  if (!m) return {};
  return {
    left: `${Math.min(m.x1, m.x2)}%`,
    top: `${Math.min(m.y1, m.y2)}%`,
    width: `${Math.abs(m.x2 - m.x1)}%`,
    height: `${Math.abs(m.y2 - m.y1)}%`,
  };
});

/** Convierte un evento de puntero a coordenadas en % de la pagina. */
function toPagePercent(event: PointerEvent, host: HTMLElement): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

function onBackgroundPointerDown(event: PointerEvent): void {
  if (!props.editable || props.tool !== 'select') {
    emit('select', null);
    return;
  }

  const host = event.currentTarget as HTMLElement;
  host.setPointerCapture(event.pointerId);
  const origin = toPagePercent(event, host);
  marquee.value = { x1: origin.x, y1: origin.y, x2: origin.x, y2: origin.y };

  const move = (e: PointerEvent) => {
    const point = toPagePercent(e, host);
    marquee.value = { ...marquee.value!, x2: point.x, y2: point.y };
  };

  const end = (e: PointerEvent) => {
    host.releasePointerCapture(e.pointerId);
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', end);
    host.removeEventListener('pointercancel', end);

    const m = marquee.value;
    marquee.value = null;
    if (!m) return;

    const left = Math.min(m.x1, m.x2);
    const right = Math.max(m.x1, m.x2);
    const top = Math.min(m.y1, m.y2);
    const bottom = Math.max(m.y1, m.y2);

    // Un rectangulo minusculo es un clic, no una seleccion.
    if (right - left < 1.5 && bottom - top < 1.5) {
      emit('select', null);
      return;
    }

    // Basta con que el elemento toque el rectangulo, no que quepa entero dentro.
    const inside = props.elements.filter((element) => {
      const t = element.transformMatrix;
      return t.x < right && t.x + t.width > left && t.y < bottom && t.y + t.height > top;
    });
    emit('selectMany', inside.map((element) => element.id));
  };

  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}

const zoomPercent = computed(() => Math.round(zoom.value * 100));

function setZoom(value: number): void {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

const zoomIn = () => setZoom(zoom.value + ZOOM_STEP);
const zoomOut = () => setZoom(zoom.value - ZOOM_STEP);
const resetZoom = () => setZoom(1);

/** Ctrl/Cmd + rueda hace zoom; la rueda sola sigue desplazando el lienzo. */
function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  setZoom(zoom.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}
</script>

<template>
  <div ref="container" class="relative h-full w-full">
    <!-- place-items: safe center evita que al ampliar se recorte el borde superior. -->
    <div
      ref="viewport"
      class="grid h-full w-full overflow-auto p-4"
      style="place-items: safe center"
      @wheel="onWheel"
    >
      <div class="relative shadow-xl ring-1 ring-slate-300" :style="frameStyle">
        <div
          class="absolute left-0 top-0 origin-top-left"
          :style="pageStyle"
          @pointerdown.self="onBackgroundPointerDown"
        >
          <!-- Papel cebolla: guia semitransparente de la página anterior. -->
          <div v-if="onionElements?.length" class="pointer-events-none absolute inset-0 opacity-25 grayscale">
            <div
              v-for="element in onionElements"
              :key="`onion-${element.id}`"
              class="absolute"
              :style="{
                left: `${element.transformMatrix.x}%`,
                top: `${element.transformMatrix.y}%`,
                width: `${element.transformMatrix.width}%`,
                height: `${element.transformMatrix.height}%`,
                transform: `rotate(${element.transformMatrix.angle}deg)`,
              }"
            >
              <ElementRenderer :element="element" />
            </div>
          </div>

          <CanvasElementBox
            v-for="element in elements"
            :key="element.id"
            :element="element"
            :selected="chosen.includes(element.id)"
            :principal="element.id === selectedId"
            :bloqueable="puedeBloquear"
            :grouped="arrastraComoGrupo(element)"
            :vista="vistaDe(element)"
            :offset-x="offsetFor(element.id)?.x"
            :offset-y="offsetFor(element.id)?.y"
            :editable="editable"
            :auto-edit="autoEditId === element.id"
            :canvas-width="renderedWidth"
            :canvas-height="renderedHeight"
            @select="(id, additive) => emit('select', id, additive)"
            @commit="(id, t) => emit('commit', id, t)"
            @update-text="(id, v) => emit('updateText', id, v)"
            @update-table="(id, t) => emit('updateTable', id, t)"
            @group-drag="onGroupDrag"
            @group-commit="onGroupCommit"
            @select-only="emit('selectOnly', $event)"
            @accion="(tipo, id) => emit('accion', tipo, id)"
          />

          <!--
            Varios elegidos: una sola caja alrededor de todos, con sus tiradores,
            para cambiar el tamano del conjunto, y su barra (agrupar, duplicar,
            borrar). La caja no recoge clics: se arrastra pulsando los objetos.
          -->
          <div
            v-if="cajaGrupo && editable && tool === 'select'"
            data-caja-grupo
            class="pointer-events-none absolute border-2 border-dashed"
            :class="agrupada ? 'border-violet-500' : 'border-brand-500'"
            :style="{
              left: `${cajaGrupo.x}%`,
              top: `${cajaGrupo.y}%`,
              width: `${cajaGrupo.width}%`,
              height: `${cajaGrupo.height}%`,
              zIndex: 20000,
            }"
          >
            <button
              v-for="t in TIRADORES"
              :key="t.id"
              type="button"
              class="pointer-events-auto absolute border-2 border-white shadow"
              :class="[t.clase, agrupada ? 'bg-violet-600' : 'bg-brand-600']"
              :style="{ cursor: t.cursor }"
              :aria-label="`Cambiar el tamaño de la selección (${t.id})`"
              @pointerdown.stop="onEscalarInicio($event, t.id)"
            />
            <div
              v-if="!escalaEnCurso"
              class="barra-grupo pointer-events-auto absolute -top-14 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
              @pointerdown.stop
            >
              <button
                type="button"
                class="boton-grupo"
                :title="agrupada ? 'Desagrupar (Ctrl+Shift+G)' : 'Agrupar (Ctrl+G)'"
                @click.stop="emit('accion', agrupada ? 'desagrupar' : 'agrupar', selectedId ?? chosen[0])"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="8" height="8" rx="1" />
                  <rect x="13" y="13" width="8" height="8" rx="1" />
                  <path v-if="!agrupada" d="M11 7h4a2 2 0 0 1 2 2v4" />
                  <path v-else d="M11 7h2M17 11v2" />
                </svg>
                <span>{{ agrupada ? 'Desagrupar' : 'Agrupar' }}</span>
              </button>
              <button
                type="button"
                class="boton-grupo"
                title="Duplicar (Ctrl+D)"
                aria-label="Duplicar"
                @click.stop="emit('accion', 'duplicar', selectedId ?? chosen[0])"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                </svg>
              </button>
              <button
                type="button"
                class="boton-grupo hover:!bg-red-50 hover:!text-red-600"
                title="Borrar (Supr)"
                aria-label="Borrar"
                @click.stop="emit('accion', 'borrar', selectedId ?? chosen[0])"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          </div>

          <PageNumberMark
            v-if="numbering"
            :numbering="numbering"
            :page-number="page.pageNumber"
            :total="totalPages ?? page.pageNumber"
          />

          <!-- Rectangulo de selección -->
          <div
            v-if="marquee"
            class="pointer-events-none absolute border-2 border-dashed border-brand-500 bg-brand-500/10"
            :style="marqueeStyle"
          />

          <DrawingLayer
            v-if="editable && (tool === 'draw' || tool === 'fill')"
            :tool="tool"
            :canvas-width="renderedWidth"
            :canvas-height="renderedHeight"
            @stroke="emit('stroke', $event as never)"
            @fill="emit('fill', $event)"
          />

          <p
            v-if="!elements.length"
            class="pointer-events-none absolute inset-0 grid place-items-center text-2xl text-slate-300"
          >
            Página vacia
          </p>
        </div>
      </div>
    </div>

    <div
      class="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-slate-300 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded text-lg font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        :disabled="zoom <= MIN_ZOOM"
        title="Alejar (Ctrl + rueda)"
        aria-label="Alejar"
        @click="zoomOut"
      >−</button>

      <button
        type="button"
        class="min-w-[3.5rem] rounded px-1 py-0.5 text-xs font-bold tabular-nums text-slate-700 hover:bg-slate-100"
        title="Ajustar a la ventana"
        @click="resetZoom"
      >{{ zoomPercent }}%</button>

      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded text-lg font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        :disabled="zoom >= MAX_ZOOM"
        title="Acercar (Ctrl + rueda)"
        aria-label="Acercar"
        @click="zoomIn"
      >+</button>
    </div>
  </div>
</template>

<style scoped>
.boton-grupo {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  height: 1.9rem;
  min-width: 1.9rem;
  justify-content: center;
  padding: 0 0.45rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}
.boton-grupo:hover {
  background: #f1f5f9;
  color: #0f172a;
}
</style>
