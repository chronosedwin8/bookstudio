<script setup lang="ts">
import { computed } from 'vue';
import { SHAPES, type ShapeName, type ShapePrimitive } from '@/utils/shapes';

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

/**
 * El color de una cara a partir del color elegido.
 *
 * Por debajo de 1 se oscurece y por encima se va hacia el blanco, hasta llegar a
 * blanco puro en 2. Con eso, un cubo se dibuja con las tres caras del color que
 * eligio quien lo puso y se sigue leyendo como un cubo, y el simbolo de una
 * senal sale blanco sobre el fondo, como en las senales de verdad.
 */
function conTono(color: string, tono: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!m || tono === 1) return color;

  const n = parseInt(m[1], 16);
  const canales = [(n >> 16) & 255, (n >> 8) & 255, n & 255];

  const ajustado = canales.map((v) => {
    if (tono <= 1) return Math.round(v * tono);
    // Mezcla con blanco: 2 es blanco del todo
    const hacia = Math.min(tono - 1, 1);
    return Math.round(v + (255 - v) * hacia);
  });

  return `#${ajustado.map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Atributos propios de cada primitiva; el resto (color, grosor) son comunes. */
function attrsFor(primitive: ShapePrimitive): Record<string, unknown> {
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
function fillFor(primitive: ShapePrimitive): string {
  if (primitive.el === 'line' || primitive.el === 'polyline') return 'none';
  // Un trazo suelto dentro de una forma rellena: un arco, un meridiano, un cable.
  if (primitive.el === 'path' && primitive.sinRelleno) return 'none';
  if (definition.value.strokeOnly) return props.strokeColor;

  const tono = 'tono' in primitive ? primitive.tono : undefined;
  if (tono === undefined || fill.value === 'transparent') return fill.value;
  return conTono(fill.value, tono);
}

function dashFor(primitive: ShapePrimitive): string | undefined {
  // El guionado se aplica al cuerpo de la linea, no a la punta.
  return primitive.el === 'line' || (primitive.el === 'path' && primitive.sinRelleno)
    ? dashArray.value
    : undefined;
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
