<script setup lang="ts">
import { computed } from 'vue';
import ElementRenderer from './ElementRenderer.vue';
import { paperStyle } from '@/utils/papers';
import type { AnswerResult, CanvasElement } from '@/types/api';

/**
 * Miniatura no interactiva de una pagina. Reutiliza el mismo lienzo logico de 1000px
 * que FixedCanvas para que los tamanos en px (tipografias, trazos) escalen igual.
 */
const props = defineProps<{
  backgroundColor?: string;
  backgroundPattern?: string | null;
  elements: CanvasElement[];
  aspectRatio: number;
  /** Ancho en px de la miniatura; el alto se deduce de la proporcion. */
  width: number;
  /** En modo lectura los audios, videos y mapas si deben funcionar. */
  interactive?: boolean;
  /** Corrige las preguntas contra el servidor; solo lo aporta el modo lectura. */
  checkAnswer?: (elementId: string, answer: string[]) => Promise<AnswerResult>;
}>();

/** Salto a otra pagina del propio libro, desde un marcador. */
const emit = defineEmits<{ irAPagina: [numero: number] }>();

const BASE_WIDTH = 1000;

const baseHeight = computed(() => BASE_WIDTH / props.aspectRatio);
const scale = computed(() => props.width / BASE_WIDTH);

const frameStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${baseHeight.value * scale.value}px`,
  backgroundColor: props.backgroundColor ?? '#FFFFFF',
}));

const pageStyle = computed(() => ({
  width: `${BASE_WIDTH}px`,
  height: `${baseHeight.value}px`,
  transform: `scale(${scale.value})`,
  ...paperStyle(props.backgroundPattern),
}));

const sorted = computed(() => [...props.elements].sort((a, b) => a.zIndex - b.zIndex));

/**
 * Enlace del elemento, solo en modo lectura. Se revalida en el cliente aunque el
 * backend ya lo filtre: un `javascript:` guardado por otra via nunca debe pulsarse.
 */
function linkOf(element: CanvasElement): string | null {
  if (!props.interactive) return null;
  const url = String(element.properties.linkUrl ?? '').trim();
  if (!url) return null;
  // Los saltos internos no son enlaces del navegador: los atiende el lector.
  if (paginaDestino(element) !== null) return null;
  return /^https?:\/\//i.test(url) || url.startsWith('/') ? url : null;
}

/** Numero de pagina al que salta el elemento, si es un marcador interno. */
export function paginaDestino(element: CanvasElement): number | null {
  const url = String(element.properties.linkUrl ?? '').trim();
  const m = /^#pagina-(\d{1,4})$/.exec(url);
  return m ? Number(m[1]) : null;
}
</script>

<template>
  <div class="relative overflow-hidden" :style="frameStyle">
    <div class="absolute left-0 top-0 origin-top-left" :style="pageStyle">
      <component
        :is="linkOf(element) ? 'a' : 'div'"
        v-for="element in sorted"
        :key="element.id"
        class="absolute"
        :class="linkOf(element) && 'cursor-pointer'"
        :href="linkOf(element) ?? undefined"
        :class="paginaDestino(element) !== null ? 'cursor-pointer' : ''"
        @click="paginaDestino(element) !== null && emit('irAPagina', paginaDestino(element)!)"
        :target="linkOf(element) ? '_blank' : undefined"
        :rel="linkOf(element) ? 'noopener noreferrer' : undefined"
        :style="{
          left: `${element.transformMatrix.x}%`,
          top: `${element.transformMatrix.y}%`,
          width: `${element.transformMatrix.width}%`,
          height: `${element.transformMatrix.height}%`,
          transform: `rotate(${element.transformMatrix.angle}deg)`,
          opacity: element.opacity,
        }"
      >
        <ElementRenderer :element="element" :preview="!interactive" :check-answer="checkAnswer" />
      </component>
    </div>

    <p
      v-if="!elements.length"
      class="absolute inset-0 grid place-items-center text-[11px] text-slate-300"
    >
      Sin contenido
    </p>
  </div>
</template>
