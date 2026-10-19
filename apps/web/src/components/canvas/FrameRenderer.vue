<script setup lang="ts">
import { computed } from 'vue';
import { PAISAJE_MUESTRA, cuerpoDe, encimaDe, marcoDe, mascaraUrl } from '@/utils/marcos';

/**
 * Marco: una silueta con una imagen dentro (ver utils/marcos.ts).
 *
 * La foto va con object-fit: cover dentro de la mascara, asi que estirar el
 * marco no la deforma. `zoom` y `posX/posY` deciden que parte se ve. Sin foto se
 * muestra un paisaje de muestra, como en Canva, para que se vea la silueta.
 */
const props = defineProps<{ properties: Record<string, unknown> }>();

const marco = computed(() => marcoDe(props.properties.frame));
const fileUrl = computed(() => String(props.properties.fileUrl ?? ''));
const zoom = computed(() => Math.min(5, Math.max(1, Number(props.properties.zoom ?? 1))));
const pos = computed(() => `${Number(props.properties.posX ?? 50)}% ${Number(props.properties.posY ?? 50)}%`);

const estiloArea = computed(() => {
  const a = marco.value.area;
  const mascara = mascaraUrl(marco.value);
  return {
    left: `${a.x}%`,
    top: `${a.y}%`,
    width: `${a.w}%`,
    height: `${a.h}%`,
    ...(mascara
      ? { maskImage: mascara, WebkitMaskImage: mascara, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }
      : {}),
  };
});
</script>

<template>
  <div class="relative h-full w-full">
    <!-- Las capas son SVG del catalogo; solo el color viene del usuario y va validado. -->
    <div v-if="marco.cuerpo" class="absolute inset-0" v-html="cuerpoDe(marco, properties.frameColor)" />
    <div class="absolute overflow-hidden" :style="estiloArea">
      <img
        v-if="fileUrl"
        :src="fileUrl"
        :alt="String(properties.altText ?? '')"
        class="h-full w-full object-cover"
        :style="{ objectPosition: pos, transform: `scale(${zoom})`, transformOrigin: pos }"
        draggable="false"
        loading="lazy"
      />
      <div v-else class="h-full w-full" v-html="PAISAJE_MUESTRA" />
    </div>
    <div v-if="marco.encima" class="pointer-events-none absolute inset-0" v-html="encimaDe(marco, properties.frameColor)" />
  </div>
</template>
