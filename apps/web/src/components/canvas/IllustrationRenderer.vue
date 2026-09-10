<script setup lang="ts">
import { computed } from 'vue';
import { dibujarEscena } from '@/utils/ilustracion/dibujo';
import { normalizarEscena, resumirEscena, type Escena } from '@/utils/ilustracion/escena';
import { ALTO_LIENZO, ANCHO_LIENZO, aplanar } from '@/utils/ilustracion/primitivas';

/**
 * Ilustracion educativa en SVG, igual que la grafica: sin librerias y escalando
 * con el elemento.
 *
 * No recibe un dibujo, recibe una escena, y la dibuja aqui. Es lo que permite
 * que no exista ningun SVG guardado ni ninguna cadena de marcado que sanear:
 * cada forma es una etiqueta que pone Vue con numeros ya validados.
 */
const props = defineProps<{
  escena: Escena | Record<string, unknown> | null | undefined;
  /** Lo que se pidio, que sirve de texto alternativo si la escena no trae otro. */
  prompt?: string;
}>();

const escena = computed(() => normalizarEscena(props.escena, props.prompt ?? ''));
const formas = computed(() => aplanar(dibujarEscena(escena.value)));
const alternativo = computed(() => resumirEscena(escena.value));
const idTexto = computed(() => `ilus-${Math.abs(hash(alternativo.value))}`);

/** Un identificador estable para enlazar el titulo, sin depender del azar. */
function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return h;
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${ANCHO_LIENZO} ${ALTO_LIENZO}`"
    class="h-full w-full"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-labelledby="idTexto"
  >
    <title :id="idTexto">{{ alternativo }}</title>

    <template v-for="(forma, indice) in formas" :key="indice">
      <rect
        v-if="forma.tipo === 'rect'"
        :x="forma.x" :y="forma.y" :width="forma.ancho" :height="forma.alto" :rx="forma.radio"
        :fill="forma.relleno ?? 'none'" :stroke="forma.trazo" :stroke-width="forma.grosor"
        :stroke-linecap="forma.redondo ? 'round' : undefined"
        :stroke-linejoin="forma.redondo ? 'round' : undefined"
        :opacity="forma.opacidad"
      />
      <circle
        v-else-if="forma.tipo === 'circulo'"
        :cx="forma.cx" :cy="forma.cy" :r="forma.r"
        :fill="forma.relleno ?? 'none'" :stroke="forma.trazo" :stroke-width="forma.grosor"
        :opacity="forma.opacidad"
      />
      <ellipse
        v-else-if="forma.tipo === 'elipse'"
        :cx="forma.cx" :cy="forma.cy" :rx="forma.rx" :ry="forma.ry"
        :transform="forma.giro ? `rotate(${forma.giro} ${forma.cx} ${forma.cy})` : undefined"
        :fill="forma.relleno ?? 'none'" :stroke="forma.trazo" :stroke-width="forma.grosor"
        :opacity="forma.opacidad"
      />
      <path
        v-else-if="forma.tipo === 'ruta'"
        :d="forma.d"
        :fill="forma.relleno ?? 'none'" :stroke="forma.trazo" :stroke-width="forma.grosor"
        :stroke-linecap="forma.redondo ? 'round' : undefined"
        :stroke-linejoin="forma.redondo ? 'round' : undefined"
        :opacity="forma.opacidad"
      />
      <line
        v-else-if="forma.tipo === 'linea'"
        :x1="forma.x1" :y1="forma.y1" :x2="forma.x2" :y2="forma.y2"
        :stroke="forma.trazo" :stroke-width="forma.grosor"
        :stroke-linecap="forma.redondo ? 'round' : undefined"
        :opacity="forma.opacidad"
      />
    </template>
  </svg>
</template>
