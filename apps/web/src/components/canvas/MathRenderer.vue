<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

/*
 * Ajuste al recuadro.
 *
 * El tamano de letra crece con el lado MENOR del recuadro, asi que una formula
 * ancha (una matriz, un sistema, una desviacion tipica) se salia por la derecha
 * en cuanto el recuadro no era alto. Aqui se mide lo que ocupa de verdad una vez
 * compuesta y se encoge lo justo para que quepa entera; nunca se agranda, para
 * que una formula corta no salga desproporcionada.
 */
const caja = ref<HTMLElement | null>(null);
const contenido = ref<HTMLElement | null>(null);
/**
 * Tamano de letra en pixeles cuando hay que encoger; `null` deja el de la hoja
 * de estilos.
 *
 * Se ajusta la LETRA y no una transformacion de escala. Con `transform: scale`
 * la formula encogia pero se descolocaba: KaTeX envuelve la formula en un bloque
 * mas ancho que el recuadro, y al escalar ese bloque la formula se iba hacia un
 * lado. Cambiando el tamano de letra, KaTeX recompone y queda centrada como debe.
 */
const tamano = ref<number | null>(null);

/** Espera a que el navegador haya pintado, para medir lo que de verdad se ve. */
const unFotograma = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') resolve();
    else requestAnimationFrame(() => resolve());
  });

/*
 * Solo un ajuste a la vez.
 *
 * Se llama al montar y cada vez que cambia el recuadro, y las dos llamadas se
 * solapaban: la primera encogia la formula y la segunda la media YA encogida,
 * asi que calculaba que cabia de sobra y la dejaba saliendose. Con el cerrojo,
 * la segunda espera y vuelve a medir desde cero.
 */
let ajustando = false;
let pendiente = false;

async function ajustar(): Promise<void> {
  if (ajustando) {
    pendiente = true;
    return;
  }
  ajustando = true;
  try {
    await medirYEncoger();
  } finally {
    ajustando = false;
    if (pendiente) {
      pendiente = false;
      void ajustar();
    }
  }
}

async function medirYEncoger(): Promise<void> {
  const marco = caja.value;
  const dentro = contenido.value;
  if (!marco || !dentro) return;

  // Se mide sin encoger: si no, cada medida partiria de la anterior
  tamano.value = null;
  await nextTick();
  await unFotograma();

  /*
   * Las dos medidas tienen que estar en las mismas unidades, y esto costo
   * encontrarlo: `clientWidth` da el tamano de maquetacion y
   * `getBoundingClientRect` el de pantalla, que no coinciden porque el lienzo
   * aplica su propio zoom a todo lo que hay dentro. Mezclarlas daba un recuadro
   * de 550 frente a una formula de 614 cuando en realidad eran 550 y 805, y el
   * ajuste se quedaba corto justo lo que se veia sobresalir.
   *
   * Con `getBoundingClientRect` en ambas, el zoom afecta igual a las dos y la
   * proporcion sale bien sin tener que saber cuanto vale.
   */
  const marcoRect = marco.getBoundingClientRect();
  // Se mide el `.katex`, que es la formula; su contenedor ocupa todo el ancho
  const formula = dentro.querySelector('.katex') ?? dentro;
  const formulaRect = formula.getBoundingClientRect();

  // Un dedo de margen para que no quede pegada al borde
  const anchoLibre = marcoRect.width * 0.96;
  const altoLibre = marcoRect.height * 0.96;
  const ancho = formulaRect.width;
  const alto = formulaRect.height;
  if (anchoLibre <= 0 || altoLibre <= 0 || ancho <= 0 || alto <= 0) return;

  const factor = Math.min(1, anchoLibre / ancho, altoLibre / alto);
  if (!Number.isFinite(factor) || factor >= 0.995) return;

  // KaTeX escala proporcionalmente al tamano de letra, asi que una sola pasada
  // basta: se toma el tamano que tiene ahora y se le aplica el factor.
  const actual = parseFloat(getComputedStyle(dentro).fontSize);
  if (!Number.isFinite(actual) || actual <= 0) return;
  tamano.value = Math.max(6, actual * Math.max(factor, 0.05));
}

let observador: ResizeObserver | undefined;

onMounted(() => {
  void ajustar();

  /*
   * Se vigilan las dos cajas, y hacen falta las dos:
   *
   * - el recuadro, que cambia cada vez que se arrastra un tirador;
   * - la formula, que cambia sola cuando llegan las tipografias de KaTeX. Esto
   *   ultimo era lo que dejaba el ajuste corto: se median 467 puntos de ancho
   *   con la letra de reserva y luego la formula pasaba a 614 sin que el
   *   recuadro se moviera, asi que nadie volvia a medir.
   *
   * Observar la formula es seguro aunque este encogida: ResizeObserver informa
   * del tamano de maquetacion, que no cambia al aplicar una escala.
   */
  if (typeof ResizeObserver !== 'undefined') {
    observador = new ResizeObserver(() => void ajustar());
    if (caja.value) observador.observe(caja.value);
    if (contenido.value) observador.observe(contenido.value);
  }

  // Y por si las tipografias llegan sin provocar ningun cambio de tamano
  void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => void ajustar());
});

onBeforeUnmount(() => observador?.disconnect());

watch(rendered, () => void nextTick(() => void ajustar()));
</script>

<template>
  <div
    ref="caja"
    class="math-box grid h-full w-full place-items-center overflow-hidden p-1"
    :style="{ color, backgroundColor }"
  >
    <div
      v-if="rendered"
      ref="contenido"
      class="math-content"
      :style="tamano ? { fontSize: `${tamano}px` } : undefined"
      v-html="rendered"
    />
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
