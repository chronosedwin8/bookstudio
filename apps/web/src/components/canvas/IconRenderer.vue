<script setup lang="ts">
import { computed } from 'vue';
import { urlOpenmoji } from '@/utils/openmoji';

/**
 * Dibuja un icono de la biblioteca, un emoji o un OpenMoji. Los iconos se pintan
 * siempre con <path :d>, nunca con v-html: las propiedades vienen de la base de
 * datos y el marcado libre seria un vector de inyeccion. Los OpenMoji son una
 * imagen nuestra (/openmoji/<codigo>.svg), con el codigo ya validado.
 */
const props = defineProps<{
  source: 'emoji' | 'library' | 'openmoji';
  char?: string;
  hexcode?: string;
  paths?: string[];
  viewBox?: string;
  color: string;
  strokeWidth?: number;
  filled?: boolean;
  label?: string;
}>();

const dibujo = computed(() => (props.source === 'openmoji' ? urlOpenmoji(props.hexcode ?? '') : ''));
</script>

<template>
  <div class="icon-box grid h-full w-full place-items-center">
    <!-- El emoji escala con el contenedor gracias a la unidad de viewport del padre. -->
    <span
      v-if="source === 'emoji'"
      class="emoji-fit select-none leading-none"
      role="img"
      :aria-label="label || 'emoji'"
    >{{ char }}</span>

    <img
      v-else-if="source === 'openmoji'"
      :src="dibujo"
      :alt="label || 'emoji'"
      class="pointer-events-none h-full w-full select-none object-contain"
      draggable="false"
    />

    <svg
      v-else
      class="h-full w-full"
      :viewBox="viewBox || '0 0 24 24'"
      preserveAspectRatio="xMidYMid meet"
      :aria-label="label || undefined"
      :role="label ? 'img' : undefined"
      :aria-hidden="label ? undefined : true"
    >
      <path
        v-for="(d, index) in paths"
        :key="index"
        :d="d"
        :fill="filled ? color : 'none'"
        :stroke="color"
        :stroke-width="strokeWidth ?? 2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
/*
 * El emoji crece con su recuadro: la caja declara el contexto de consulta y el
 * texto se mide en cqmin. Debe estar en el ancestro, no en el propio <span>.
 */
.icon-box {
  container-type: size;
}

/*
 * 72, no 88: el glifo de un emoji incluye sus propios margenes laterales y a 88
 * se salia por la derecha del recuadro, que ademas lo recortaba. Con 72 cabe
 * entero en cualquiera de las fuentes de emoji de Windows, Mac y Android.
 */
.emoji-fit {
  font-size: 72cqmin;
  /* Que nunca lo recorte el recuadro, pase lo que pase con la fuente. */
  overflow: visible;
  text-align: center;
}
</style>
