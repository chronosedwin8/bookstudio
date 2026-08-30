<script setup lang="ts">
import { computed, ref } from 'vue';
import ElementRenderer from './ElementRenderer.vue';
import type { CanvasElement, TransformMatrix } from '@/types/api';

const props = defineProps<{
  element: CanvasElement;
  selected: boolean;
  editable: boolean;
  /** Lado del lienzo en px, necesario para convertir desplazamiento de raton a porcentaje. */
  canvasWidth: number;
  canvasHeight: number;
  /** Hay varios elementos seleccionados: arrastrar mueve todo el grupo. */
  grouped?: boolean;
  /** Desplazamiento visual mientras se arrastra el grupo, en % de pagina. */
  offsetX?: number;
  offsetY?: number;
}>();

const emit = defineEmits<{
  select: [id: string, additive: boolean];
  commit: [id: string, transform: TransformMatrix];
  updateText: [id: string, value: string];
  /** Arrastre de grupo en curso; el lienzo lo refleja en todos los seleccionados. */
  groupDrag: [dx: number, dy: number];
  groupCommit: [dx: number, dy: number];
  /** Clic sin arrastre dentro de un grupo: se queda solo este elemento. */
  selectOnly: [id: string];
}>();

const editingText = ref(false);

function onDoubleClick(): void {
  if (interactive.value && props.element.type === 'text') editingText.value = true;
}

function finishTextEdit(value: string): void {
  editingText.value = false;
  emit('updateText', props.element.id, value);
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';

const draft = ref<TransformMatrix | null>(null);
const transform = computed(() => draft.value ?? props.element.transformMatrix);

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

const CORNERS: Array<{ id: Corner; class: string; cursor: string }> = [
  { id: 'nw', class: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { id: 'ne', class: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { id: 'se', class: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
  { id: 'sw', class: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
];

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

function onDragStart(event: PointerEvent): void {
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  emit('select', props.element.id, additive);
  // Con Shift solo se anade o quita de la seleccion; no se arrastra.
  if (additive) return;

  if (props.grouped) {
    dragGroup(event);
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
function dragGroup(event: PointerEvent): void {
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

    // Un clic limpio sobre un miembro del grupo lo deja como unica seleccion.
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
      emit('groupCommit', 0, 0);
      emit('selectOnly', props.element.id);
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
      selected && 'outline outline-2 outline-offset-1 outline-brand-500',
      element.isLocked && selected && 'outline-amber-500',
    ]"
    :style="boxStyle"
    @pointerdown="onDragStart"
    @dblclick="onDoubleClick"
  >
    <ElementRenderer :element="element" :editing-text="editingText" @update-text="finishTextEdit" />

    <span
      v-if="element.isLocked"
      class="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[10px] text-white shadow"
      title="Elemento bloqueado"
    >🔒</span>

    <!-- El enlace no es pulsable mientras se edita; aquí solo se avisa de que existe. -->
    <span
      v-if="element.properties.linkUrl"
      class="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[10px] text-white shadow"
      :title="`Enlace: ${element.properties.linkUrl}`"
    >🔗</span>

    <template v-if="selected && interactive">
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

      <button
        type="button"
        class="absolute -top-8 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-brand-600 text-[11px] text-white shadow"
        style="cursor: grab"
        aria-label="Rotar elemento"
        @pointerdown.stop="onRotateStart"
      >⟳</button>
    </template>
  </div>
</template>
