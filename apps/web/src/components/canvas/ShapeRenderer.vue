<script setup lang="ts">
import { computed } from 'vue';
import { SHAPES, type ShapeName } from '@/utils/shapes';

const props = defineProps<{
  shape: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius?: number;
}>();

// Una forma desconocida (guardada por una version anterior) cae al rectangulo.
const definition = computed(() => SHAPES[props.shape as ShapeName] ?? SHAPES.rectangle);

const primitives = computed(() => definition.value.primitives);

/** Las lineas y flechas finas se dibujan solo con trazo, aunque haya relleno elegido. */
const fill = computed(() => (definition.value.strokeOnly ? 'none' : props.fillColor));

const dashArray = computed(() =>
  definition.value.dashed ? `${Math.max(2, props.strokeWidth * 1.8)} ${Math.max(2, props.strokeWidth * 1.6)}` : undefined,
);

/** Atributos propios de cada primitiva; el resto (color, grosor) son comunes. */
function attrsFor(primitive: (typeof primitives.value)[number]): Record<string, unknown> {
  switch (primitive.el) {
    case 'rect':
      return { x: 0, y: 0, width: 100, height: 100, rx: props.cornerRadius ?? 0 };
    case 'ellipse':
      return { cx: 50, cy: 50, rx: 49, ry: 49 };
    case 'circle':
      return { cx: primitive.cx, cy: primitive.cy, r: primitive.r };
    case 'line':
      return { x1: primitive.x1, y1: primitive.y1, x2: primitive.x2, y2: primitive.y2 };
    case 'path':
      return { d: primitive.d };
    default:
      return { points: primitive.points };
  }
}

/** Las lineas nunca se rellenan; las puntas de flecha si, aunque la forma sea de trazo. */
function fillFor(primitive: (typeof primitives.value)[number]): string {
  if (primitive.el === 'line' || primitive.el === 'polyline') return 'none';
  if (definition.value.strokeOnly) return props.strokeColor;
  return fill.value;
}

function dashFor(primitive: (typeof primitives.value)[number]): string | undefined {
  // El guionado se aplica al cuerpo de la linea, no a la punta.
  return primitive.el === 'line' ? dashArray.value : undefined;
}
</script>

<template>
  <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <component
      :is="primitive.el"
      v-for="(primitive, index) in primitives"
      :key="index"
      v-bind="attrsFor(primitive)"
      :fill="fillFor(primitive)"
      :stroke="strokeColor"
      :stroke-width="strokeWidth"
      :stroke-dasharray="dashFor(primitive)"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
