<script setup lang="ts">
import { computed } from 'vue';
import type { PageNumbering } from '@/types/api';
import { estiloNumero, normalizarNumeracion, numeroDeHoja } from '@/utils/numeracion';

/**
 * El numero de una hoja, encima de su contenido.
 *
 * Va dentro del lienzo logico de 1000 de ancho de la hoja, asi que escala con
 * ella: se ve igual en una miniatura que a pantalla completa. No recibe el
 * puntero, para no tapar lo que haya debajo.
 */
const props = defineProps<{
  numbering: PageNumbering | null | undefined;
  pageNumber: number;
  total: number;
}>();

const cfg = computed(() => normalizarNumeracion(props.numbering));
const texto = computed(() => (cfg.value ? numeroDeHoja(cfg.value, props.pageNumber, props.total) : null));
const estilo = computed(() => (cfg.value ? estiloNumero(cfg.value, props.pageNumber) : {}));
</script>

<template>
  <span v-if="texto" class="numero-de-hoja" :style="estilo" aria-hidden="true">{{ texto }}</span>
</template>
