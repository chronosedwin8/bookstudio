<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CanvasElementBox from './CanvasElementBox.vue';
import DrawingLayer from './DrawingLayer.vue';
import ElementRenderer from './ElementRenderer.vue';
import { paperStyle } from '@/utils/papers';
import type { CanvasElement, Page, TransformMatrix } from '@/types/api';

const props = defineProps<{
  page: Page;
  elements: CanvasElement[];
  aspectRatio: number;
  selectedId: string | null;
  /** Todos los elementos seleccionados; con mas de uno se mueven en bloque. */
  selectedIds?: string[];
  editable: boolean;
  /** `select` deja interactuar con los elementos; el resto activa la capa de dibujo. */
  tool?: 'select' | 'draw' | 'fill';
  /** Elementos de la pagina anterior mostrados en semitransparencia para calcar. */
  onionElements?: CanvasElement[];
}>();

const emit = defineEmits<{
  select: [id: string | null, additive?: boolean];
  selectMany: [ids: string[]];
  selectOnly: [id: string];
  moveSelection: [dx: number, dy: number];
  commit: [id: string, transform: TransformMatrix];
  updateText: [id: string, value: string];
  stroke: [
    payload: {
      points: Array<{ x: number; y: number }>;
      transform: TransformMatrix;
      properties: Record<string, unknown>;
    },
  ];
  fill: [point: { x: number; y: number }];
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
  ...paperStyle(props.page.backgroundPattern),
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
          <!-- Papel cebolla: guia semitransparente de la pagina anterior. -->
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
            :grouped="isGrouped"
            :offset-x="offsetFor(element.id)?.x"
            :offset-y="offsetFor(element.id)?.y"
            :editable="editable"
            :canvas-width="renderedWidth"
            :canvas-height="renderedHeight"
            @select="(id, additive) => emit('select', id, additive)"
            @commit="(id, t) => emit('commit', id, t)"
            @update-text="(id, v) => emit('updateText', id, v)"
            @group-drag="onGroupDrag"
            @group-commit="onGroupCommit"
            @select-only="emit('selectOnly', $event)"
          />

          <!-- Rectangulo de seleccion -->
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
            Pagina vacia
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
