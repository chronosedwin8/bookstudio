<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ElementRenderer from './ElementRenderer.vue';
import InteractionLayer from './InteractionLayer.vue';
import { paperStyle } from '@/utils/papers';
import type { AnswerResult, CanvasElement, ElementInteraction } from '@/types/api';

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
  /**
   * Esta pagina va dibujada en la hoja que esta girando. Lo que tenga animacion
   * de entrada se calla hasta que la hoja aterrice: si se viera durante el giro,
   * al posarse volveria a entrar desde cero y daria un respingo.
   */
  enVuelo?: boolean;
  /**
   * Respeta "empieza oculto" aunque no sea el modo lectura.
   *
   * Lo usa la vista de impresion: sin esto, imprimir una ficha para repartirla
   * en papel salia con las respuestas puestas, porque en papel no hay nada que
   * pulsar y se pintaba todo.
   */
  respetarOcultos?: boolean;
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
function paginaDestino(element: CanvasElement): number | null {
  const url = String(element.properties.linkUrl ?? '').trim();
  const m = /^#pagina-(\d{1,4})$/.exec(url);
  return m ? Number(m[1]) : null;
}

/* --------------------------------------------------------------------------
 * Interactividad y animacion
 *
 * Las dos se limitan al modo lectura. En una rejilla de miniaturas no habria a
 * quien mostrarle un globo, y una veintena de objetos animandose en bucle a la
 * vez convierte el panel de paginas en un cartel luminoso.
 * ------------------------------------------------------------------------ */

const activa = ref<{ interaction: ElementInteraction; x: number; y: number } | null>(null);

function interaccionDe(element: CanvasElement): ElementInteraction | null {
  return props.interactive ? (element.interaction ?? null) : null;
}

function alEntrar(element: CanvasElement, event: MouseEvent): void {
  dispararReglas(element, 'hover');
  const info = interaccionDe(element);
  if (info?.trigger === 'hover') activa.value = { interaction: info, x: event.clientX, y: event.clientY };
}

function alMover(element: CanvasElement, event: MouseEvent): void {
  // El globo sigue al cursor; la ventana no, que se abrio centrada.
  if (activa.value?.interaction.kind !== 'tooltip') return;
  const info = interaccionDe(element);
  if (info?.trigger === 'hover' && info.kind === 'tooltip') {
    activa.value = { interaction: info, x: event.clientX, y: event.clientY };
  }
}

function alSalir(element: CanvasElement): void {
  const info = interaccionDe(element);
  // Una ventana abierta al pasar el raton se queda: se cierra con su aspa o con
  // Escape. Si se cerrara al salir, seria imposible leerla hasta el final.
  if (info?.trigger === 'hover' && info.kind === 'tooltip') activa.value = null;
}

function alPulsar(element: CanvasElement, event: MouseEvent): void {
  dispararReglas(element, 'click');
  const destino = paginaDestino(element);
  if (destino !== null && props.interactive) emit('irAPagina', destino);

  const info = interaccionDe(element);
  if (info?.trigger === 'click') {
    event.preventDefault();
    activa.value = { interaction: info, x: event.clientX, y: event.clientY };
  }

  animarAlPulsar(element);
}

/** Un elemento con informacion o con animacion al pulsar responde al teclado. */
function esFocalizable(element: CanvasElement): boolean {
  if (!props.interactive || linkOf(element)) return false;
  return Boolean(element.interaction) || element.animation?.trigger === 'click' || actuaAlPulsar(element);
}

/**
 * Perder el foco cierra el globo, pero NUNCA la ventana.
 *
 * La ventana se lleva el foco al abrirse, para que Escape y el tabulador vayan a
 * ella. Eso hace que el elemento pierda el foco acto seguido, y cerrar aqui sin
 * mirar el tipo cerraba la ventana en el mismo instante de abrirla. Era ademas
 * una carrera: segun quien llegara antes, el clic o el foco, unas veces se abria
 * y otras no.
 *
 * Una ventana se cierra con su aspa, con su boton, con Escape o pulsando fuera.
 */
function alPerderFoco(): void {
  if (activa.value?.interaction.kind === 'tooltip') activa.value = null;
}

/** El foco del teclado abre lo mismo que el raton, centrado en el elemento. */
function alEnfocar(element: CanvasElement, event: FocusEvent): void {
  const info = interaccionDe(element);
  if (!info) return;
  const caja = (event.target as HTMLElement).getBoundingClientRect();
  activa.value = { interaction: info, x: caja.left + caja.width / 2, y: caja.bottom };
}

/* --------------------------------------------------------------------------
 * Mostrar y ocultar objetos
 *
 * Un objeto puede esconder o revelar a otro de su misma pagina al pulsarlo.
 * Los objetivos se apuntan por nombre, y el nombre se busca SOLO entre los
 * elementos de esta pagina: dos paginas duplicadas comparten nombres y no deben
 * interferir entre ellas.
 * ------------------------------------------------------------------------ */

/**
 * Nombres que estan escondidos ahora mismo.
 *
 * Se guarda lo escondido y no lo visible porque lo normal es que casi todo se
 * vea: asi el conjunto arranca con lo poco que nace oculto y se queda pequeno.
 */
const ocultos = ref(new Set<string>());

/** Donde tiene sentido esconder: al leer, y al imprimir si se pide. */
const aplicaOcultos = computed(() => props.interactive === true || props.respetarOcultos === true);

/** Arranca escondiendo lo que su autor marco como oculto. */
function reiniciarVisibilidad(): void {
  if (!aplicaOcultos.value) {
    ocultos.value = new Set();
    return;
  }
  const inicial = new Set<string>();
  for (const el of props.elements) {
    const clave = el.actions?.key;
    if (clave && el.actions?.startHidden) inicial.add(clave);
  }
  ocultos.value = inicial;
}

reiniciarVisibilidad();
// Al cambiar de pagina se vuelve al estado de partida: si no, una pagina que se
// revisita apareceria con lo que alguien destapo hace media hora.
watch(() => props.elements, reiniciarVisibilidad);
watch(aplicaOcultos, reiniciarVisibilidad);

function estaVisible(element: CanvasElement): boolean {
  if (!aplicaOcultos.value) return true; // en el editor y en las miniaturas, todo
  const clave = element.actions?.key;
  return !clave || !ocultos.value.has(clave);
}

/** Nombres que existen de verdad en esta pagina; el resto no se toca. */
const clavesDeLaPagina = computed(() => {
  const claves = new Set<string>();
  for (const el of props.elements) if (el.actions?.key) claves.add(el.actions.key);
  return claves;
});

/**
 * Aplica las reglas de un objeto. Una regla que apunta a un nombre que ya no
 * existe (porque borraron el objeto) se ignora en silencio: romper la pagina
 * entera por una regla huerfana seria peor que no hacer nada.
 */
function dispararReglas(element: CanvasElement, disparador: 'click' | 'hover'): void {
  const reglas = props.interactive ? (element.actions?.rules ?? []) : [];
  if (!reglas.length) return;

  const siguiente = new Set(ocultos.value);
  let cambio = false;

  for (const regla of reglas) {
    if (regla.trigger !== disparador) continue;
    if (!clavesDeLaPagina.value.has(regla.target)) continue;

    if (regla.action === 'show') siguiente.delete(regla.target);
    else if (regla.action === 'hide') siguiente.add(regla.target);
    else if (siguiente.has(regla.target)) siguiente.delete(regla.target);
    else siguiente.add(regla.target);
    cambio = true;
  }

  if (cambio) ocultos.value = siguiente;
}

/** Si el objeto hace algo al pulsarlo: para el cursor y para el teclado. */
function actuaAlPulsar(element: CanvasElement): boolean {
  return Boolean(props.interactive && element.actions?.rules?.some((r) => r.trigger === 'click'));
}

// --- Animacion ---

/**
 * Las de entrada tienen que volver a correr cada vez que la pagina cambia de
 * contenido. Vue reaprovecha los nodos, y una animacion ya reproducida no se
 * repite sola: cambiando esta parte de la clave, el nodo se recrea y arranca.
 */
const ciclo = ref(0);
watch(() => props.elements, () => { ciclo.value++; });

/** Elementos a los que se les esta reproduciendo la animacion de clic. */
const pulsados = ref(new Set<string>());

/** Lo que entrara animado no se ensena todavia mientras la hoja da la vuelta. */
function esperaSuTurno(element: CanvasElement): boolean {
  return Boolean(props.enVuelo && element.animation?.trigger === 'entrance');
}

function clasesAnimacion(element: CanvasElement): string[] {
  const a = element.animation;
  if (!props.interactive || !a) return [];
  const clases = ['anim', `anim-${a.effect}`, `anim-${a.trigger}`];
  if (a.trigger === 'click' && pulsados.value.has(element.id)) clases.push('anim-activa');
  return clases;
}

function estiloAnimacion(element: CanvasElement): Record<string, string> {
  const a = element.animation;
  if (!props.interactive || !a) return {};
  return { '--anim-dur': `${a.duration}s`, '--anim-esp': `${a.delay}s` };
}

function animarAlPulsar(element: CanvasElement): void {
  if (!props.interactive || element.animation?.trigger !== 'click') return;
  // Se quita al terminar; si se quedara puesta, el segundo clic no animaria nada.
  pulsados.value = new Set(pulsados.value).add(element.id);
}

/** Enter equivale al clic para quien navega sin raton. */
function alPulsarTeclado(element: CanvasElement, event: KeyboardEvent): void {
  dispararReglas(element, 'click');
  const destino = paginaDestino(element);
  if (destino !== null && props.interactive) emit('irAPagina', destino);

  const info = interaccionDe(element);
  if (info?.trigger === 'click') {
    event.preventDefault();
    const caja = (event.target as HTMLElement).getBoundingClientRect();
    activa.value = { interaction: info, x: caja.left + caja.width / 2, y: caja.bottom };
  }

  animarAlPulsar(element);
}

function alTerminarAnimacion(element: CanvasElement): void {
  if (!pulsados.value.has(element.id)) return;
  const resto = new Set(pulsados.value);
  resto.delete(element.id);
  pulsados.value = resto;
}
</script>

<template>
  <div class="relative overflow-hidden" :style="frameStyle">
    <div class="absolute left-0 top-0 origin-top-left" :style="pageStyle">
      <component
        :is="linkOf(element) ? 'a' : 'div'"
        v-for="element in sorted"
        v-show="estaVisible(element)"
        :key="element.id"
        class="absolute"
        :class="[
          linkOf(element) || paginaDestino(element) !== null || actuaAlPulsar(element) ? 'cursor-pointer' : '',
          interactive && element.interaction ? 'cursor-help' : '',
        ]"
        :href="linkOf(element) ?? undefined"
        :tabindex="esFocalizable(element) ? 0 : undefined"
        @click="alPulsar(element, $event)"
        @mouseenter="alEntrar(element, $event)"
        @mousemove="alMover(element, $event)"
        @mouseleave="alSalir(element)"
        @focus="alEnfocar(element, $event)"
        @blur="alPerderFoco()"
        @keydown.enter="alPulsarTeclado(element, $event)"
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
        <!-- La animacion va en una capa interior: la de fuera ya gasta su
             `transform` en colocar y girar el elemento donde lo puso el autor. -->
        <div
          :key="`${element.id}-${ciclo}`"
          class="h-full w-full"
          :class="clasesAnimacion(element)"
          :style="{ ...estiloAnimacion(element), visibility: esperaSuTurno(element) ? 'hidden' : undefined }"
          @animationend="alTerminarAnimacion(element)"
        >
          <ElementRenderer :element="element" :preview="!interactive" :check-answer="checkAnswer" />
        </div>
      </component>
    </div>

    <p
      v-if="!elements.length"
      class="absolute inset-0 grid place-items-center text-[11px] text-slate-300"
    >
      Sin contenido
    </p>

    <InteractionLayer :activa="activa" @cerrar="activa = null" />
  </div>
</template>
