<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';

/**
 * Formula matematica compuesta con KaTeX (licencia MIT, autoalojado).
 *
 * `trust: false` es lo que hace segura la insercion con v-html: KaTeX se niega a
 * generar enlaces o etiquetas arbitrarias, asi que el LaTeX guardado en la base de
 * datos no puede convertirse en marcado inyectado.
 */
const props = defineProps<{
  latex: string;
  displayMode: boolean;
  color: string;
  backgroundColor: string;
}>();

const rendered = computed(() => {
  try {
    return katex.renderToString(props.latex || '', {
      displayMode: props.displayMode,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'html',
    });
  } catch {
    // renderToString con throwOnError:false casi nunca lanza; por si acaso.
    return '';
  }
});
</script>

<template>
  <div
    class="math-box grid h-full w-full place-items-center overflow-hidden p-1"
    :style="{ color, backgroundColor }"
  >
    <div v-if="rendered" class="math-content" v-html="rendered" />
    <p v-else class="text-xs text-slate-400">Escribe una formula</p>
  </div>
</template>

<style scoped>
/* La formula crece con su recuadro, igual que los iconos y las preguntas. */
.math-box {
  container-type: size;
}

.math-content {
  font-size: clamp(10px, 22cqmin, 120px);
  line-height: 1.2;
}

/* KaTeX inserta su propio marcado; los estilos deben atravesar el scoped. */
.math-content :deep(.katex-display) {
  margin: 0;
}

.math-content :deep(.katex) {
  color: inherit;
}
</style>
