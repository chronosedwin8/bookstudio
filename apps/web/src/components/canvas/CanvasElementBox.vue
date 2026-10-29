<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ElementRenderer from './ElementRenderer.vue';
import type { CanvasElement, TransformMatrix } from '@/types/api';
import type { Tabla } from '@/utils/tablas';

const props = defineProps<{
  element: CanvasElement;
  selected: boolean;
  editable: boolean;
  /** Lado del lienzo en px, necesario para convertir desplazamiento de raton a porcentaje. */
  canvasWidth: number;
  canvasHeight: number;
  /** Texto recien insertado: se abre para escribir sin que nadie lo pida. */
  autoEdit?: boolean;
  /** Hay varios elementos seleccionados: arrastrar mueve todo el grupo. */
  grouped?: boolean;
  /** Desplazamiento visual mientras se arrastra el grupo, en % de pagina. */
  offsetX?: number;
  offsetY?: number;
  /** El elemento principal de la seleccion: lleva la barra flotante (una sola). */
  principal?: boolean;
  /** Puede bloquear y desbloquear (el profesorado). */
  bloqueable?: boolean;
  /** Como se ve mientras se cambia el tamano de toda la seleccion. */
  vista?: TransformMatrix | null;
}>();

const emit = defineEmits<{
  select: [id: string, additive: boolean];
  commit: [id: string, transform: TransformMatrix];
  updateText: [id: string, value: string];
  updateTable: [id: string, tabla: Tabla];
  /** Arrastre de grupo en curso; el lienzo lo refleja en todos los seleccionados. */
  groupDrag: [dx: number, dy: number];
  groupCommit: [dx: number, dy: number];
  /** La barra flotante: duplicar, bloquear o borrar lo seleccionado. */
  accion: [tipo: 'duplicar' | 'bloquear' | 'borrar' | 'agrupar' | 'desagrupar', id: string];
  /** Clic sin arrastre dentro de un grupo: se queda solo este elemento. */
  selectOnly: [id: string];
}>();

const editingText = ref(false);

/*
 * Un texto recien insertado se abre solo para escribir. Se mira en cuanto se
 * monta y cada vez que cambia, porque el elemento puede existir en el lienzo
 * antes de que llegue la orden.
 */
watch(
  () => props.autoEdit,
  (abrir) => {
    // Las formas y las notas adhesivas tambien: se insertan para escribir en ellas.
    if (abrir && interactive.value && (props.element.type === 'text' || props.element.type === 'shape')) {
      editingText.value = true;
    }
  },
  { immediate: true },
);

/*
 * Doble clic para escribir dentro.
 *
 * Vale para el texto y para la tabla. Hace falta este paso intermedio porque
 * arrastrar el elemento empieza en `pointerdown` y ahi se cancela el evento por
 * omision, con lo que un doble clic nunca llegaria a la celda. Al entrar en modo
 * edicion el arrastre se desactiva y los clics pasan al contenido.
 */
function onDoubleClick(): void {
  if (!interactive.value) return;
  if (['text', 'table', 'shape'].includes(props.element.type)) editingText.value = true;
}

// Al dejar de estar seleccionado se sale de la edicion: si no, la tabla se
// quedaria editable por detras y el elemento no se podria volver a arrastrar.
watch(
  () => props.selected,
  (sigue) => {
    if (!sigue) editingText.value = false;
  },
);

function finishTextEdit(value: string): void {
  editingText.value = false;
  emit('updateText', props.element.id, value);
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';
type Side = 'n' | 's' | 'e' | 'w';

const draft = ref<TransformMatrix | null>(null);
const transform = computed(() => draft.value ?? props.vista ?? props.element.transformMatrix);

const boxStyle = computed(() => ({
  left: `${transform.value.x + (props.offsetX ?? 0)}%`,
  top: `${transform.value.y + (props.offsetY ?? 0)}%`,
  width: `${transform.value.width}%`,
  height: `${transform.value.height}%`,
  transform: `rotate(${transform.value.angle}deg)`,
  opacity: props.element.opacity,
  zIndex: props.element.zIndex + 1,
}));

const interactive = computed(() => props.editable && !props.element.isLocked);

/** Marca visible de "esto no lo vera el alumnado hasta que algo lo muestre". */
const arrancaOculto = computed(() => props.element.actions?.startHidden === true);

const CORNERS: Array<{ id: Corner; class: string; cursor: string }> = [
  { id: 'nw', class: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { id: 'ne', class: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { id: 'se', class: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
  { id: 'sw', class: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
];

/**
 * Tiradores de los lados: estiran en un solo sentido.
 *
 * Las esquinas conservan la proporcion, que es lo que casi siempre se quiere con
 * una foto. Pero para ensanchar un rectangulo hacia los lados hacia falta
 * arrastrar una esquina con Shift, y eso no lo adivina nadie: quien no conoce el
 * atajo acaba creyendo que la forma no se puede deformar. Con un tirador en cada
 * lado se ve, se agarra y no hay que saber ningun truco.
 *
 * Son alargados a proposito, no redondos como los de las esquinas: la forma del
 * tirador ya dice hacia donde tira.
 */
const SIDES: Array<{ id: Side; class: string; cursor: string; eje: 'x' | 'y'; nombre: string }> = [
  { id: 'n', class: 'left-1/2 -top-1.5 -translate-x-1/2 h-2.5 w-5', cursor: 'ns-resize', eje: 'y', nombre: 'Estirar por arriba' },
  { id: 's', class: 'left-1/2 -bottom-1.5 -translate-x-1/2 h-2.5 w-5', cursor: 'ns-resize', eje: 'y', nombre: 'Estirar por abajo' },
  { id: 'w', class: 'top-1/2 -left-1.5 -translate-y-1/2 h-5 w-2.5', cursor: 'ew-resize', eje: 'x', nombre: 'Estirar por la izquierda' },
  { id: 'e', class: 'top-1/2 -right-1.5 -translate-y-1/2 h-5 w-2.5', cursor: 'ew-resize', eje: 'x', nombre: 'Estirar por la derecha' },
];

/**
 * En un objeto pequeno los ocho tiradores se pisan unos a otros y no se puede
 * agarrar ninguno. Por debajo de este tamano solo se dejan las esquinas, que son
 * las que permiten agrandarlo hasta que quepan los demas.
 */
const HUECO_MINIMO_PX = 46;

const ladosVisibles = computed(() => {
  const anchoPx = (props.element.transformMatrix.width / 100) * props.canvasWidth;
  const altoPx = (props.element.transformMatrix.height / 100) * props.canvasHeight;
  return SIDES.filter((lado) => (lado.eje === 'x' ? altoPx : anchoPx) >= HUECO_MINIMO_PX);
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Rota un vector por -angle para trabajar en el sistema local del elemento. */
function unrotate(dx: number, dy: number, angleDeg: number): { dx: number; dy: number } {
  const rad = (-angleDeg * Math.PI) / 180;
  return { dx: dx * Math.cos(rad) - dy * Math.sin(rad), dy: dx * Math.sin(rad) + dy * Math.cos(rad) };
}

function startGesture(
  event: PointerEvent,
  onMove: (dxPercent: number, dyPercent: number, shiftKey: boolean) => TransformMatrix,
): void {
  if (!interactive.value || editingText.value) return;
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);

  const startX = event.clientX;
  const startY = event.clientY;
  const start = { ...props.element.transformMatrix };
  let latest = start;

  const move = (e: PointerEvent) => {
    const dx = ((e.clientX - startX) / props.canvasWidth) * 100;
    const dy = ((e.clientY - startY) / props.canvasHeight) * 100;
    latest = onMove(dx, dy, e.shiftKey);
    draft.value = latest;
  };

  const end = (e: PointerEvent) => {
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    draft.value = null;
    if (latest !== start) emit('commit', props.element.id, latest);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

/**
 * Doble clic detectado a mano.
 *
 * El navegador no lo entrega: arrastrar empieza en `pointerdown` y ahi se llama
 * a `preventDefault()`, lo que suprime los eventos de raton derivados, `dblclick`
 * incluido. Por eso el doble clic para escribir dentro de un texto no llegaba
 * nunca a dispararse, aunque el manejador estuviera puesto.
 *
 * Se mira el tiempo y la distancia entre dos pulsaciones: si son seguidas y en
 * el mismo sitio, es un doble clic y no un arrastre.
 */
const MS_DOBLE_CLIC = 350;
const PX_DOBLE_CLIC = 6;
let ultimaPulsacion = { t: 0, x: 0, y: 0 };

function onDragStart(event: PointerEvent): void {
  // Escribiendo dentro, los clics son del contenido: Mayus+clic en una tabla
  // elige celdas, no saca la tabla de la seleccion.
  if (editingText.value && props.selected) return;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  // Si ya estaba elegido, un clic limpio despues lo deja solo (entrar en el grupo).
  const yaElegido = props.selected;
  emit('select', props.element.id, additive);
  // Con Shift solo se anade o quita de la seleccion; no se arrastra.
  if (additive) return;

  const ahora = event.timeStamp || performance.now();
  const cerca = Math.hypot(event.clientX - ultimaPulsacion.x, event.clientY - ultimaPulsacion.y) <= PX_DOBLE_CLIC;
  if (ahora - ultimaPulsacion.t <= MS_DOBLE_CLIC && cerca) {
    ultimaPulsacion = { t: 0, x: 0, y: 0 };
    onDoubleClick();
    return;
  }
  ultimaPulsacion = { t: ahora, x: event.clientX, y: event.clientY };

  if (props.grouped) {
    dragGroup(event, yaElegido);
    return;
  }

  const start = { ...props.element.transformMatrix };
  startGesture(event, (dx, dy) => ({
    ...start,
    x: clamp(start.x + dx, -20, 100 - start.width + 20),
    y: clamp(start.y + dy, -20, 100 - start.height + 20),
  }));
}

/** Arrastre de varios elementos: se emite el desplazamiento, no una transformacion. */
function dragGroup(event: PointerEvent, yaElegido: boolean): void {
  if (!interactive.value || editingText.value) return;
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  let dx = 0;
  let dy = 0;

  const move = (e: PointerEvent) => {
    dx = ((e.clientX - startX) / props.canvasWidth) * 100;
    dy = ((e.clientY - startY) / props.canvasHeight) * 100;
    emit('groupDrag', dx, dy);
  };

  const end = (e: PointerEvent) => {
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);

    // Un clic limpio sobre un miembro de la seleccion lo deja como unica
    // seleccion. El primer clic sobre un grupo no: ese es el que lo elige entero.
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
      emit('groupCommit', 0, 0);
      if (yaElegido) emit('selectOnly', props.element.id);
      return;
    }
    emit('groupCommit', dx, dy);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}

/** Escala desde la esquina opuesta manteniendo la proporcion original. */
function onResizeStart(event: PointerEvent, corner: Corner): void {
  const start = { ...props.element.transformMatrix };
  const ratio = start.width / start.height;
  const anchorX = corner === 'nw' || corner === 'sw' ? start.x + start.width : start.x;
  const anchorY = corner === 'nw' || corner === 'ne' ? start.y + start.height : start.y;
  const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
  const signY = corner === 'se' || corner === 'sw' ? 1 : -1;

  startGesture(event, (rawDx, rawDy, shiftKey) => {
    const { dx, dy } = unrotate(rawDx, rawDy, start.angle);

    let width = clamp(start.width + signX * dx, 3, 200);
    let height = clamp(start.height + signY * dy, 3, 200);

    // Proporcional por defecto; Shift permite deformacion libre.
    if (!shiftKey) {
      const scale = Math.max(width / start.width, height / start.height);
      width = clamp(start.width * scale, 3, 200);
      height = clamp(width / ratio, 3, 200);
    }

    return {
      ...start,
      width,
      height,
      x: signX === 1 ? anchorX : anchorX - width,
      y: signY === 1 ? anchorY : anchorY - height,
    };
  });
}

/**
 * Estira desde un lado, en un solo sentido y sin conservar la proporcion.
 *
 * Es lo que se espera al agarrar el borde de algo: ensancharlo o alargarlo. El
 * lado opuesto se queda quieto, que es lo que hace que el objeto crezca hacia
 * donde se tira y no desde el centro.
 */
function onResizeSideStart(event: PointerEvent, side: Side): void {
  const start = { ...props.element.transformMatrix };
  const horizontal = side === 'e' || side === 'w';

  // El borde que no se mueve
  const anchorX = side === 'w' ? start.x + start.width : start.x;
  const anchorY = side === 'n' ? start.y + start.height : start.y;
  const signo = side === 'e' || side === 's' ? 1 : -1;

  startGesture(event, (rawDx, rawDy) => {
    const { dx, dy } = unrotate(rawDx, rawDy, start.angle);

    if (horizontal) {
      const width = clamp(start.width + signo * dx, 3, 200);
      return { ...start, width, x: signo === 1 ? anchorX : anchorX - width };
    }

    const height = clamp(start.height + signo * dy, 3, 200);
    return { ...start, height, y: signo === 1 ? anchorY : anchorY - height };
  });
}

function onRotateStart(event: PointerEvent): void {
  if (!interactive.value) return;
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);

  const box = (target.closest('[data-element-box]') as HTMLElement).getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const start = { ...props.element.transformMatrix };
  const startAngle = (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
  let latest = start;

  const move = (e: PointerEvent) => {
    const current = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    let angle = start.angle + (current - startAngle);
    // Shift ancla la rotacion a pasos de 15 grados.
    if (e.shiftKey) angle = Math.round(angle / 15) * 15;
    latest = { ...start, angle: Math.round(angle * 10) / 10 };
    draft.value = latest;
  };

  const end = (e: PointerEvent) => {
    target.releasePointerCapture(e.pointerId);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    draft.value = null;
    if (latest !== start) emit('commit', props.element.id, latest);
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
}
</script>

<template>
  <div
    data-element-box
    class="absolute select-none"
    :class="[
      interactive ? 'cursor-move' : 'cursor-default',
      // Con varios elegidos manda la caja comun: el contorno de cada uno, discreto.
      selected && (grouped ? 'outline outline-1 outline-brand-400/50' : 'outline outline-2 outline-offset-1 outline-brand-500'),
      element.isLocked && selected && 'outline-amber-500',
      // Contorno discontinuo: se ve de un vistazo lo que el alumnado no vera.
      arrancaOculto && !selected && 'outline-dashed outline-2 outline-offset-2 outline-slate-400',
    ]"
    :style="boxStyle"
    @pointerdown="onDragStart"
    @dblclick="onDoubleClick"
  >
    <ElementRenderer
      :element="element"
      :editing-text="editingText"
      :selected="selected"
      @update-text="finishTextEdit"
      @update-table="emit('updateTable', props.element.id, $event)"
    />

    <span
      v-if="element.isLocked"
      class="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] text-white shadow"
      title="Elemento bloqueado"
    >🔒</span>

    <!--
      Este objeto arranca oculto en el modo lectura. En el editor SIEMPRE se ve
      (uno que no se puede seleccionar tampoco se puede volver a mostrar), asi
      que hace falta decirlo de algun modo: sin este aviso no habia forma de
      saber que la mitad de la pagina no la vera el alumnado.
    -->
    <span
      v-if="element.actions?.startHidden"
      class="pointer-events-none absolute -bottom-1.5 -left-1.5 grid h-5 w-5 place-items-center
             rounded-full bg-slate-700 text-[10px] text-white shadow"
      title="Empieza oculto: no se verá hasta que otro objeto lo muestre"
    >🙈</span>

    <!-- El enlace no es pulsable mientras se edita; aquí solo se avisa de que existe. -->
    <span
      v-if="element.properties.linkUrl"
      class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[10px] text-white shadow"
      :title="`Enlace: ${element.properties.linkUrl}`"
    >🔗</span>

    <!-- Con varios elegidos los tiradores son los de la caja comun (FixedCanvas). -->
    <template v-if="selected && interactive && !grouped">
      <button
        v-for="corner in CORNERS"
        :key="corner.id"
        type="button"
        class="absolute h-3 w-3 rounded-full border-2 border-white bg-brand-600 shadow"
        :class="corner.class"
        :style="{ cursor: corner.cursor }"
        :aria-label="`Redimensionar desde ${corner.id}`"
        @pointerdown.stop="onResizeStart($event, corner.id)"
      />

      <!--
        Los lados estiran en un solo sentido, sin tener que pulsar nada. Antes
        eso solo se conseguia con Shift sobre una esquina, y quien no lo sabia
        daba por hecho que la forma no se podia deformar.
      -->
      <button
        v-for="lado in ladosVisibles"
        :key="lado.id"
        type="button"
        class="absolute rounded-sm border-2 border-white bg-brand-600 shadow"
        :class="lado.class"
        :style="{ cursor: lado.cursor }"
        :aria-label="lado.nombre"
        :title="lado.nombre"
        @pointerdown.stop="onResizeSideStart($event, lado.id)"
      />

      <!-- Girar va abajo, como en Canva: arriba queda la barra flotante. -->
      <button
        type="button"
        class="absolute -bottom-9 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-brand-600 text-[11px] text-white shadow"
        style="cursor: grab"
        aria-label="Rotar elemento"
        @pointerdown.stop="onRotateStart"
      >⟳</button>
    </template>

    <!--
      Barra flotante, como la de Canva: duplicar, bloquear y borrar sin ir al
      panel de la derecha. Solo en el elemento principal de la seleccion, para no
      pintar una por objeto cuando hay varios marcados (actua sobre todos).
    -->
    <div
      v-if="selected && editable && principal && !editingText && !grouped"
      class="barra-flotante absolute -top-12 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
      @pointerdown.stop
    >
      <button
        v-if="interactive"
        type="button"
        class="boton-barra"
        title="Duplicar (Ctrl+D)"
        aria-label="Duplicar"
        @click.stop="emit('accion', 'duplicar', element.id)"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      </button>
      <button
        v-if="bloqueable"
        type="button"
        class="boton-barra"
        :title="element.isLocked ? 'Desbloquear' : 'Bloquear'"
        :aria-label="element.isLocked ? 'Desbloquear' : 'Bloquear'"
        @click.stop="emit('accion', 'bloquear', element.id)"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path :d="element.isLocked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2'" />
        </svg>
      </button>
      <button
        v-if="interactive"
        type="button"
        class="boton-barra hover:!bg-red-50 hover:!text-red-600"
        title="Borrar (Supr)"
        aria-label="Borrar"
        @click.stop="emit('accion', 'borrar', element.id)"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.boton-barra {
  display: grid;
  place-items: center;
  height: 1.9rem;
  width: 1.9rem;
  border-radius: 9999px;
  color: #334155;
}
.boton-barra:hover {
  background: #f1f5f9;
  color: #0f172a;
}
</style>
