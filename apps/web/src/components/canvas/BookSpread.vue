<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import PagePreview from './PagePreview.vue';
import { construirVistas, paginaDe, vistaDe, type Vista } from '@/utils/pliegos';
import type { AnswerResult, Page } from '@/types/api';

/**
 * El libro abierto del lector: doble pagina y hoja que gira sobre el lomo.
 *
 * Se hizo con CSS 3D en vez de con una libreria de pasar hojas por dos motivos.
 * El de licencia: turn.js, la mas conocida, prohibe expresamente el uso comercial
 * y BookStudio se vende. Y el tecnico, que pesa mas: estas paginas no son imagenes
 * planas sino contenido vivo —preguntas que el alumnado responde, audios, mapas,
 * videos— y una libreria que se adueña de esos nodos acaba peleando con Vue justo
 * cuando alguien contesta algo.
 */
const props = defineProps<{
  pages: Page[];
  aspectRatio: number;
  /** Hueco disponible, en px. */
  available: { width: number; height: number };
  /** Pagina abierta ahora mismo, por indice. */
  modelValue: number;
  checkAnswer?: (elementId: string, answer: string[]) => Promise<AnswerResult>;
}>();

const emit = defineEmits<{
  'update:modelValue': [index: number];
  irAPagina: [numero: number];
}>();

/** Por debajo de esto, dos paginas juntas se leen peor que una sola. */
const MINIMO_POR_PAGINA = 300;
/** Debe coincidir con la duracion de la transicion del CSS. */
const DURACION_MS = 620;
/** Hueco del lomo entre las dos hojas. */
const LOMO = 2;

/**
 * Si caben dos paginas.
 *
 * Un libro apaisado abierto mide casi tres veces su alto, asi que en la practica
 * se queda en pagina unica, que es lo correcto: en papel tampoco se encuaderna
 * asi. Lo mismo en un movil, y en un libro de una sola pagina.
 */
const dobleCabe = computed(() => {
  if (props.pages.length < 2) return false;
  const { width, height } = props.available;
  if (!width || !height) return false;
  return Math.min((width - LOMO) / 2, height * props.aspectRatio) >= MINIMO_POR_PAGINA;
});

const anchoPagina = computed(() => {
  const { width, height } = props.available;
  if (!width || !height) return 0;
  const disponible = dobleCabe.value ? (width - LOMO) / 2 : width;
  return Math.floor(Math.min(disponible, height * props.aspectRatio));
});

const altoPagina = computed(() => Math.floor(anchoPagina.value / props.aspectRatio));

const vistas = computed(() => construirVistas(props.pages.length, dobleCabe.value));
const indiceVista = computed(() => vistaDe(vistas.value, props.modelValue));
const vista = computed<Vista>(() => vistas.value[indiceVista.value] ?? { izquierda: null, derecha: null });

const pagina = (indice: number | null): Page | null => (indice === null ? null : (props.pages[indice] ?? null));

const hayAnterior = computed(() => indiceVista.value > 0);
const haySiguiente = computed(() => indiceVista.value < vistas.value.length - 1);

// --- El giro ---

interface Giro {
  sentido: 'next' | 'prev';
  /** Cara que mira al lector al empezar. */
  frente: number | null;
  /** Lo que hay al otro lado del papel, y que queda a la vista al terminar. */
  dorso: number | null;
  /**
   * Lo que se ve debajo mientras la hoja vuela, que es una mezcla de las dos
   * vistas: la pagina que NO se mueve sigue siendo la de antes, y en el hueco que
   * deja la hoja al levantarse ya asoma la nueva. Pintar aqui la vista de destino
   * entera haria que la pagina quieta cambiara de golpe al empezar el giro, que es
   * justo lo que delata que no hay papel.
   */
  fondo: Vista;
  /** Se activa un fotograma despues: sin estado inicial no hay nada que animar. */
  volcada: boolean;
}

const giro = ref<Giro | null>(null);
let temporizador: number | undefined;

const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function cerrarGiro(): void {
  window.clearTimeout(temporizador);
  temporizador = undefined;
  giro.value = null;
}

onBeforeUnmount(cerrarGiro);

/**
 * Pasa de hoja.
 *
 * El fondo salta a la vista de destino de inmediato y la hoja vieja se anima por
 * encima. Ese orden es lo que hace que al girar aparezca la pagina de debajo en
 * lugar de un hueco. La hoja lleva cara y dorso, asi que el giro descubre lo que
 * de verdad hay al otro lado del papel.
 */
function pasar(paso: 1 | -1): void {
  if (giro.value) return;

  const destino = indiceVista.value + paso;
  if (destino < 0 || destino >= vistas.value.length) return;

  const desde = vista.value;
  const hasta = vistas.value[destino];

  // Sin doble pagina no hay lomo sobre el que girar, y quien pide menos
  // movimiento no debe ver girar nada.
  if (!dobleCabe.value || sinMovimiento()) {
    emit('update:modelValue', paginaDe(hasta));
    return;
  }

  giro.value = {
    sentido: paso > 0 ? 'next' : 'prev',
    frente: paso > 0 ? desde.derecha : desde.izquierda,
    dorso: paso > 0 ? hasta.izquierda : hasta.derecha,
    fondo:
      paso > 0
        ? { izquierda: desde.izquierda, derecha: hasta.derecha }
        : { izquierda: hasta.izquierda, derecha: desde.derecha },
    volcada: false,
  };

  emit('update:modelValue', paginaDe(hasta));

  void nextTick(() => {
    requestAnimationFrame(() => {
      if (giro.value) giro.value.volcada = true;
    });
  });

  /*
   * Se cierra por tiempo y no escuchando transitionend: si la pestaña pierde el
   * foco a mitad del giro ese evento puede no llegar nunca, y la hoja se quedaria
   * clavada encima tapando el libro.
   */
  window.clearTimeout(temporizador);
  temporizador = window.setTimeout(cerrarGiro, DURACION_MS + 60);
}

/**
 * Un salto suelto —una miniatura, un marcador— no debe animar un giro falso: la
 * hoja en vuelo ya no corresponde a lo que hay debajo.
 */
watch(
  () => props.modelValue,
  () => {
    if (!giro.value) return;
    const v = vista.value;
    if (giro.value.dorso !== v.izquierda && giro.value.dorso !== v.derecha) cerrarGiro();
  },
);

// Cambiar de tamaño rehace el reparto; una hoja a medio girar ya no encaja.
watch(dobleCabe, cerrarGiro);

/**
 * Los numeros de pagina que se estan viendo. Los expone el libro porque es quien
 * sabe si hay una hoja o un pliego; el lector solo los rotula.
 */
const paginasVisibles = computed(() =>
  [vista.value.izquierda, vista.value.derecha]
    .map((i) => pagina(i)?.pageNumber)
    .filter((n): n is number => typeof n === 'number'),
);

defineExpose({ pasar, hayAnterior, haySiguiente, paginasVisibles });

/** Lo que se pinta debajo: la mezcla mientras hay giro, la vista normal si no. */
const fondo = computed<Vista>(() => giro.value?.fondo ?? vista.value);

const medidas = computed(() => ({ width: `${anchoPagina.value}px`, height: `${altoPagina.value}px` }));
</script>

<template>
  <div
    v-if="anchoPagina > 0"
    class="libro"
    :class="{ doble: dobleCabe }"
    :style="{
      width: `${dobleCabe ? anchoPagina * 2 + LOMO : anchoPagina}px`,
      height: `${altoPagina}px`,
    }"
  >
    <!-- Hoja izquierda -->
    <div v-if="dobleCabe" class="hoja izquierda" :style="medidas">
      <PagePreview
        v-if="pagina(fondo.izquierda)"
        :key="pagina(fondo.izquierda)!.id"
        :background-color="pagina(fondo.izquierda)!.backgroundColor"
        :background-pattern="pagina(fondo.izquierda)!.backgroundPattern"
        :elements="pagina(fondo.izquierda)!.elements"
        :aspect-ratio="aspectRatio"
        :width="anchoPagina"
        interactive
        :check-answer="checkAnswer"
        @ir-a-pagina="emit('irAPagina', $event)"
      />
      <!-- Guarda: la cara interior de la tapa. Mantiene constante la geometria del
           libro, que es lo que permite que el giro no cambie de sitio a media
           animacion. -->
      <div v-else class="guarda"></div>
      <div class="lomo lomo-derecha"></div>
    </div>

    <!-- Hoja derecha, o unica -->
    <div class="hoja derecha" :style="medidas">
      <PagePreview
        v-if="pagina(fondo.derecha)"
        :key="pagina(fondo.derecha)!.id"
        :background-color="pagina(fondo.derecha)!.backgroundColor"
        :background-pattern="pagina(fondo.derecha)!.backgroundPattern"
        :elements="pagina(fondo.derecha)!.elements"
        :aspect-ratio="aspectRatio"
        :width="anchoPagina"
        interactive
        :check-answer="checkAnswer"
        @ir-a-pagina="emit('irAPagina', $event)"
      />
      <div v-else class="guarda"></div>
      <div v-if="dobleCabe" class="lomo lomo-izquierda"></div>
    </div>

    <!--
      La hoja en vuelo. Se pinta sin interactividad a proposito: durante el giro no
      se debe poder pulsar una pregunta, y ademas asi no se monta un mapa por
      duplicado ni se descarga Leaflet para medio segundo de animacion.
    -->
    <div
      v-if="giro"
      class="giro"
      :class="[giro.sentido, { volcada: giro.volcada }]"
      :style="medidas"
      aria-hidden="true"
    >
      <div class="cara">
        <PagePreview
          v-if="pagina(giro.frente)"
          :background-color="pagina(giro.frente)!.backgroundColor"
          :background-pattern="pagina(giro.frente)!.backgroundPattern"
          :elements="pagina(giro.frente)!.elements"
          :aspect-ratio="aspectRatio"
          :width="anchoPagina"
        />
        <div v-else class="guarda"></div>
        <div class="velo"></div>
      </div>

      <div class="cara dorso">
        <PagePreview
          v-if="pagina(giro.dorso)"
          :background-color="pagina(giro.dorso)!.backgroundColor"
          :background-pattern="pagina(giro.dorso)!.backgroundPattern"
          :elements="pagina(giro.dorso)!.elements"
          :aspect-ratio="aspectRatio"
          :width="anchoPagina"
        />
        <div v-else class="guarda"></div>
        <div class="velo velo-dorso"></div>
      </div>
    </div>

    <!--
      Zonas de paso por el borde exterior. Van ahi y no sobre la hoja entera para no
      robarle el clic a una pregunta o a un audio de la propia pagina, que es
      exactamente lo que pasaba con el video antes de arreglarlo.
    -->
    <button
      v-if="hayAnterior"
      type="button"
      class="canto canto-izquierda"
      aria-label="Página anterior"
      @click="pasar(-1)"
    ></button>
    <button
      v-if="haySiguiente"
      type="button"
      class="canto canto-derecha"
      aria-label="Página siguiente"
      @click="pasar(1)"
    ></button>
  </div>
</template>

<style scoped>
/*
 * La perspectiva vive en el libro para que el giro tenga profundidad sin deformar
 * lo de alrededor. Un valor alto da un giro sereno; uno bajo lo exagera y parece
 * un truco de presentacion.
 */
.libro {
  position: relative;
  /*
   * Cuanto mas corta la perspectiva, mas se abre la hoja al girar y mas se sale
   * del ancho del libro. A 2600 se salia bastante; con 3400 el vuelo sigue
   * teniendo cuerpo pero cabe mejor en el hueco.
   */
  perspective: 3400px;
  perspective-origin: center center;
  border-radius: 6px;
}

/* El canto: las hojas apiladas que asoman bajo la de arriba. */
.libro.doble::after {
  content: '';
  position: absolute;
  inset: 7px -6px -7px -6px;
  z-index: -1;
  border-radius: 4px;
  background: #e7e2d8;
  box-shadow:
    0 12px 34px rgba(0, 0, 0, 0.5),
    0 2px 0 #f3efe7,
    0 4px 0 #e2ddd2,
    0 6px 0 #f0ece3;
}

.hoja {
  position: absolute;
  top: 0;
  overflow: hidden;
  background: #fff;
}

.libro:not(.doble) .hoja.derecha {
  left: 0;
  border-radius: 6px;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.5);
}

.libro.doble .hoja.izquierda {
  left: 0;
  border-radius: 6px 2px 2px 6px;
}

.libro.doble .hoja.derecha {
  right: 0;
  border-radius: 2px 6px 6px 2px;
}

.guarda {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f6f2ea, #e9e3d7);
}

/*
 * Sombra del lomo. Es lo que mas hace por la ilusion: sin ella, dos paginas juntas
 * se leen como dos rectangulos pegados y no como un pliego encuadernado.
 */
.lomo {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 46px;
  pointer-events: none;
}

.lomo-derecha {
  right: 0;
  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.28));
}

.lomo-izquierda {
  left: 0;
  background: linear-gradient(to left, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.28));
}

/* --- La hoja que gira --- */

.giro {
  position: absolute;
  top: 0;
  z-index: 5;
  transform-style: preserve-3d;
  transition: transform 620ms cubic-bezier(0.42, 0.02, 0.35, 1);
  will-change: transform;
}

/*
 * Se ancla al borde exterior y no al 50%: con el hueco del lomo por medio, la
 * mitad del libro no cae exactamente donde empieza la pagina, y la hoja arrancaria
 * desplazada un pixel respecto a la que esta tapando.
 */
.giro.next {
  right: 0;
  transform-origin: left center;
}

.giro.next.volcada {
  transform: rotateY(-180deg);
}

.giro.prev {
  left: 0;
  transform-origin: right center;
}

.giro.prev.volcada {
  transform: rotateY(180deg);
}

.cara {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #fff;
  backface-visibility: hidden;
  box-shadow: 0 0 26px rgba(0, 0, 0, 0.32);
}

.dorso {
  transform: rotateY(180deg);
}

/*
 * Velo: oscurece el papel segun deja de mirar a la luz. Comparte curva con el giro
 * para que la sombra no se despegue del movimiento.
 */
.velo {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 620ms cubic-bezier(0.42, 0.02, 0.35, 1);
  background: linear-gradient(to left, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.38));
}

.velo-dorso {
  opacity: 0.5;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.38));
}

.giro.volcada .velo {
  opacity: 0.42;
}

.giro.volcada .velo-dorso {
  opacity: 0;
}

/* --- Cantos para pasar de hoja --- */

.canto {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 6;
  width: 7%;
  max-width: 56px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease;
}

.canto:hover,
.canto:focus-visible {
  background: rgba(255, 255, 255, 0.13);
}

.canto:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: -3px;
}

.canto-izquierda {
  left: 0;
  border-radius: 6px 0 0 6px;
}

.canto-derecha {
  right: 0;
  border-radius: 0 6px 6px 0;
}

/*
 * Quien pide menos movimiento no ve girar nada: pasar() ya cambia de vista sin
 * animar, y aqui se apagan tambien perspectiva y transiciones por si quedara
 * alguna hoja en vuelo.
 */
@media (prefers-reduced-motion: reduce) {
  .libro {
    perspective: none;
  }

  .giro,
  .velo {
    transition: none;
  }
}
</style>
