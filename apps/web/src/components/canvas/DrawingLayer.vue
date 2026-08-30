<script setup lang="ts">
import { computed, ref } from 'vue';
import StrokeRenderer from './StrokeRenderer.vue';
import { usePreferencesStore } from '@/stores/preferences';
import { BRUSH_PRESETS, boundsOf, offsetPath, simplify, toSvgPath, type Point } from '@/utils/strokes';

const props = defineProps<{
  /** Modo activo: trazo libre o relleno por clic. */
  tool: 'draw' | 'fill';
  canvasWidth: number;
  canvasHeight: number;
}>();

const emit = defineEmits<{
  /** Trazo terminado, ya normalizado a porcentajes de pagina. */
  stroke: [
    payload: {
      /** Puntos simplificados en el espacio del lienzo (0-1000). */
      points: Point[];
      transform: { x: number; y: number; width: number; height: number; angle: number };
      properties: Record<string, unknown>;
    },
  ];
  fill: [point: { x: number; y: number }];
}>();

const preferences = usePreferencesStore();
const points = ref<Point[]>([]);
const drawing = ref(false);

const preset = computed(() => BRUSH_PRESETS[preferences.brushStyle]);

// Escala local del trazo: se captura en px de pantalla y se guarda relativo al lienzo.
function toLocal(event: PointerEvent, host: HTMLElement): Point {
  const rect = host.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 1000,
    pressure: event.pressure > 0 ? event.pressure : 0.5,
  };
}

const previewPath = computed(() => toSvgPath(points.value));

const previewExtras = computed(() => {
  if (preset.value.passes <= 1) return [];
  return Array.from({ length: preset.value.passes - 1 }, (_, i) =>
    offsetPath(points.value, preset.value.jitter, i + 1),
  );
});

function onPointerDown(event: PointerEvent): void {
  const host = event.currentTarget as HTMLElement;

  if (props.tool === 'fill') {
    const rect = host.getBoundingClientRect();
    emit('fill', {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
    return;
  }

  event.preventDefault();
  host.setPointerCapture(event.pointerId);
  drawing.value = true;
  points.value = [toLocal(event, host)];

  const move = (e: PointerEvent) => {
    if (!drawing.value) return;
    points.value = [...points.value, toLocal(e, host)];
  };

  const end = (e: PointerEvent) => {
    host.releasePointerCapture(e.pointerId);
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', end);
    host.removeEventListener('pointercancel', end);
    drawing.value = false;
    commitStroke();
  };

  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}

function commitStroke(): void {
  const simplified = simplify(points.value, 4);
  points.value = [];
  if (simplified.length < 2) return;

  const stroke = preferences.strokeWidth * preset.value.widthFactor;
  const bounds = boundsOf(simplified, stroke + preset.value.jitter * 2);

  // El path se reescribe relativo a su propia caja para que el viewBox quede ajustado.
  const localized = simplified.map((p) => ({ ...p, x: p.x - bounds.minX, y: p.y - bounds.minY }));
  const boxWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boxHeight = Math.max(bounds.maxY - bounds.minY, 1);

  const extras = Array.from({ length: Math.max(preset.value.passes - 1, 0) }, (_, i) =>
    offsetPath(localized, preset.value.jitter, i + 1),
  );

  emit('stroke', {
    // Los puntos crudos alimentan el reconocedor de formas del editor.
    points: simplified,
    transform: {
      x: (bounds.minX / 1000) * 100,
      y: (bounds.minY / 1000) * 100,
      width: (boxWidth / 1000) * 100,
      height: (boxHeight / 1000) * 100,
      angle: 0,
    },
    properties: {
      svgPath: toSvgPath(localized),
      extraPaths: extras,
      brushStyle: preferences.brushStyle,
      strokeWidth: preferences.strokeWidth,
      strokeColor: preferences.strokeColor,
      fillColor: 'transparent',
      viewBox: `0 0 ${Math.round(boxWidth)} ${Math.round(boxHeight)}`,
    },
  });
}
</script>

<template>
  <div
    class="absolute inset-0 z-[9000]"
    :style="{ cursor: tool === 'fill' ? 'copy' : 'crosshair', touchAction: 'none' }"
    @pointerdown="onPointerDown"
  >
    <StrokeRenderer
      v-if="points.length > 1"
      :svg-path="previewPath"
      :extra-paths="previewExtras"
      :brush-style="preferences.brushStyle"
      :stroke-color="preferences.strokeColor"
      :stroke-width="preferences.strokeWidth"
      fill-color="transparent"
      viewBox="0 0 1000 1000"
    />
  </div>
</template>
