<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  FONDOS,
  NOMBRES as NOMBRES_ILUSTRACION,
  POSES,
  TEMAS,
  es,
} from '@/utils/ilustracion/catalogo';
import { normalizarEscena, type Escena } from '@/utils/ilustracion/escena';
import ChartInspector from './ChartInspector.vue';
import InteractionContentDialog from './InteractionContentDialog.vue';
import QuestionInspector from './QuestionInspector.vue';
import {
  FONT_GROUPS,
  type AnimationEffect,
  type CanvasElement,
  type ElementAnimation,
  type ButtonProperties,
  type ElementActionRule,
  type ElementActions,
  type ElementInteraction,
  type RichBlock,
  type ChartProperties,
  type QuestionProperties,
  type ShapeProperties,
  type TextProperties,
} from '@/types/api';

const props = defineProps<{
  element: CanvasElement | null;
  isManager: boolean;
  /** Numeros de pagina del libro, para los marcadores internos. */
  pageNumbers?: number[];
  /** Los demas objetos de esta pagina, para elegir a cual mostrar u ocultar. */
  pageElements?: CanvasElement[];
}>();

const emit = defineEmits<{
  patch: [
    payload: {
      properties?: Record<string, unknown>;
      isLocked?: boolean;
      opacity?: number;
      /** null la quita; ausente la deja como estaba. */
      interaction?: ElementInteraction | null;
      animation?: ElementAnimation | null;
      actions?: ElementActions | null;
    },
  ];
  move: [direction: 'front' | 'forward' | 'backward' | 'back'];
  remove: [];
  /**
   * Cambia OTRO elemento de la pagina, no el seleccionado.
   *
   * Hace falta para ponerle nombre al objeto que se quiere mostrar u ocultar: la
   * regla vive en este elemento, pero el nombre tiene que quedar guardado en el
   * otro, que es quien lo lleva.
   */
  patchOtro: [payload: { elementId: string; actions: ElementActions }];
  /**
   * Cambio que hay que ver YA en el lienzo, sin guardar todavia.
   *
   * Va aparte de `patch` porque no es lo mismo: `patch` guarda y deja un paso de
   * "deshacer", y eso en cada tecla serian treinta peticiones y treinta pasos
   * para escribir una frase.
   */
  patchVivo: [payload: { elementId: string; properties: Record<string, unknown> }];
  /** Guarda de verdad, nombrando el elemento: al soltarlo puede que ya no sea el seleccionado. */
  patchElemento: [payload: { elementId: string; properties: Record<string, unknown> }];
  /**
   * Devolverle a la imagen su proporcion original.
   *
   * Lo resuelve quien conoce la forma de la pagina, que este panel no tiene por
   * que saber.
   */
  ajustarAImagen: [];
  /** Volver a describir la ilustracion con otras palabras. */
  rehacerIlustracion: [];
}>();

/**
 * Escritura en vivo.
 *
 * Cada tecla se refleja al momento en el lienzo; el guardado espera a que se
 * deje de teclear. Asi se ve lo que se escribe mientras se escribe, y al
 * servidor y al historial les llega una sola vez.
 */
let temporizadorVivo: ReturnType<typeof setTimeout> | undefined;
let porGuardar: { elementId: string; properties: Record<string, unknown> } | undefined;

/** Manda al servidor lo que estuviera esperando, si es que habia algo. */
function guardarPendiente(): void {
  clearTimeout(temporizadorVivo);
  temporizadorVivo = undefined;
  if (!porGuardar) return;
  emit('patchElemento', porGuardar);
  porGuardar = undefined;
}

function patchPropertyVivo(key: string, value: unknown): void {
  if (!props.element) return;
  const elementId = props.element.id;
  const properties = { ...props.element.properties, [key]: value };
  emit('patchVivo', { elementId, properties });

  porGuardar = { elementId, properties };
  clearTimeout(temporizadorVivo);
  temporizadorVivo = setTimeout(guardarPendiente, 450);
}

/*
 * Al cambiar de elemento o al cerrarse el panel hay que guardar lo pendiente en
 * el acto. Si se tirara, el lienzo seguiria mostrando un texto que el servidor
 * nunca llego a recibir, y al recargar reapareceria el de antes.
 */
watch(() => props.element?.id, guardarPendiente);

onBeforeUnmount(guardarPendiente);

/**
 * La escena de una ilustracion, si el elemento seleccionado es una.
 *
 * Se normaliza al leerla para que el panel nunca muestre un valor que el dibujo
 * no sepa pintar, aunque la fila venga de una version anterior del catalogo.
 */
const ilustracion = computed(() => {
  if (props.element?.type !== 'illustration') return null;
  const p = props.element.properties as Record<string, unknown>;
  return {
    escena: normalizarEscena(p.escena, String(p.prompt ?? '')),
    prompt: String(p.prompt ?? ''),
  };
});

/** Cambia la escena y guarda; el dibujo se rehace solo, sin llamar a nadie. */
function cambiarEscena(parte: Partial<Escena>): void {
  if (!props.element || !ilustracion.value) return;
  emit('patch', {
    properties: {
      ...props.element.properties,
      escena: { ...ilustracion.value.escena, ...parte },
    },
  });
}

function cambiarPose(indice: number, pose: string): void {
  if (!ilustracion.value || !es.pose(pose)) return;
  const personajes = ilustracion.value.escena.personajes.map((p, i) =>
    i === indice ? { ...p, pose } : p,
  );
  cambiarEscena({ personajes });
}

/** Tipos que admiten enlace; el resto no muestra el campo. */
const LINKABLE = ['text', 'image', 'shape', 'icon', 'button'] as const;

const canLink = computed(() => LINKABLE.includes(props.element?.type as (typeof LINKABLE)[number]));
const linkUrl = computed(() => String(props.element?.properties.linkUrl ?? ''));

/** Vacia el campo o guarda la URL; el backend rechaza esquemas no navegables. */
type ModoEnlace = 'ninguno' | 'pagina' | 'externo';

const MODOS_ENLACE: Array<{ id: ModoEnlace; label: string }> = [
  { id: 'ninguno', label: 'Sin enlace' },
  { id: 'pagina', label: 'A una página' },
  { id: 'externo', label: 'A una web' },
];

/** Numero de pagina al que apunta el marcador, si lo es. */
const paginaEnlazada = computed(() => {
  const m = /^#pagina-(\d{1,4})$/.exec(String(props.element?.properties.linkUrl ?? ''));
  return m ? Number(m[1]) : null;
});

const modoEnlace = ref<ModoEnlace>('ninguno');

// Al cambiar de elemento, el selector refleja el enlace que ese elemento ya tenga.
watch(
  () => props.element?.id,
  () => {
    const url = String(props.element?.properties.linkUrl ?? '').trim();
    modoEnlace.value = paginaEnlazada.value !== null ? 'pagina' : url ? 'externo' : 'ninguno';
  },
  { immediate: true },
);

function cambiarModoEnlace(modo: ModoEnlace): void {
  modoEnlace.value = modo;
  // Cambiar de modo borra el enlace anterior: dejarlo escondido confundiria.
  if (modo === 'ninguno') patchLink('');
}

function patchLink(value: string): void {
  patchProperty('linkUrl', value.trim());
}

const text = computed(() => props.element?.properties as unknown as TextProperties | undefined);
const shape = computed(() => props.element?.properties as unknown as ShapeProperties | undefined);
const question = computed(() => props.element?.properties as unknown as QuestionProperties | undefined);
const chart = computed(() => props.element?.properties as unknown as ChartProperties | undefined);
const boton = computed(() => props.element?.properties as unknown as ButtonProperties | undefined);

/* --------------------------------------------------------------------------
 * Mostrar y ocultar objetos
 *
 * Los objetivos se apuntan por NOMBRE. Aqui se elige de una lista desplegable
 * con los objetos de la pagina, y el nombre se genera solo si el objeto elegido
 * aun no tenia: nadie deberia tener que inventarse identificadores para que un
 * boton destape una respuesta.
 * ------------------------------------------------------------------------ */

const acciones = computed(() => props.element?.actions ?? null);
const reglas = computed<ElementActionRule[]>(() => acciones.value?.rules ?? []);

/** Texto con el que se reconoce un objeto en la lista. */
function describir(el: CanvasElement): string {
  const p = el.properties as Record<string, unknown>;
  const texto = String(p.text ?? p.label ?? p.prompt ?? p.title ?? '').trim();
  const nombre = TIPOS[el.type] ?? el.type;
  if (!texto) return nombre;
  return `${nombre}: ${texto.length > 28 ? texto.slice(0, 28) + '...' : texto}`;
}

const TIPOS: Record<string, string> = {
  text: 'Texto', shape: 'Forma', drawing: 'Dibujo', image: 'Imagen', audio: 'Audio',
  video: 'Vídeo', map: 'Mapa', icon: 'Icono', embed: 'Incrustado', question: 'Pregunta',
  chart: 'Gráfica', math: 'Fórmula', button: 'Botón',
};

/** Los demas objetos de la pagina; uno no puede actuar sobre si mismo. */
const objetivos = computed(() =>
  (props.pageElements ?? [])
    .filter((el) => el.id !== props.element?.id)
    .map((el) => ({ el, etiqueta: describir(el), clave: el.actions?.key ?? '' })),
);

/**
 * Nombre para un objeto que aun no tiene. Se saca del texto que ya lleva, para
 * que en el desplegable se lea "respuesta" y no "obj-7f3a".
 */
function nombrePara(el: CanvasElement, usados: Set<string>): string {
  const p = el.properties as Record<string, unknown>;
  const base = String(p.text ?? p.label ?? p.title ?? TIPOS[el.type] ?? 'objeto')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'objeto';

  if (!usados.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const intento = `${base}-${i}`.slice(0, 32);
    if (!usados.has(intento)) return intento;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`.slice(0, 32);
}

function ponerAcciones(cambio: Partial<ElementActions>): void {
  const base: ElementActions = acciones.value ?? { startHidden: false, rules: [] };
  const siguiente = { ...base, ...cambio };
  const vacio = !siguiente.key && !siguiente.startHidden && siguiente.rules.length === 0;
  emit('patch', { actions: vacio ? null : siguiente });
}

/**
 * Anade una regla sobre otro objeto. Si ese objeto aun no tenia nombre, se le
 * pone: sin nombre no hay forma de apuntarle, y pedirselo a quien monta la
 * pagina seria pedirle que entienda como esta hecho esto por dentro.
 */
function anadirRegla(objetivoId: string): void {
  const destino = (props.pageElements ?? []).find((el) => el.id === objetivoId);
  if (!destino || !props.element) return;

  let clave = destino.actions?.key ?? '';
  if (!clave) {
    const usados = new Set(
      (props.pageElements ?? []).map((el) => el.actions?.key).filter(Boolean) as string[],
    );
    clave = nombrePara(destino, usados);
    emit('patchOtro', {
      elementId: destino.id,
      actions: { ...(destino.actions ?? { startHidden: false, rules: [] }), key: clave },
    });
  }

  const yaHay = reglas.value.some((r) => r.target === clave && r.trigger === 'click');
  if (yaHay) return;
  ponerAcciones({ rules: [...reglas.value, { trigger: 'click', action: 'toggle', target: clave }] });
}

function cambiarRegla(indice: number, cambio: Partial<ElementActionRule>): void {
  ponerAcciones({ rules: reglas.value.map((r, i) => (i === indice ? { ...r, ...cambio } : r)) });
}

function quitarRegla(indice: number): void {
  ponerAcciones({ rules: reglas.value.filter((_, i) => i !== indice) });
}

/** Como se llama el objeto al que apunta una regla, para leerlo en la lista. */
function etiquetaDe(clave: string): string {
  return objetivos.value.find((o) => o.clave === clave)?.etiqueta ?? `«${clave}» (ya no está)`;
}

const ACCIONES: Array<{ id: ElementActionRule['action']; label: string }> = [
  { id: 'toggle', label: 'Mostrar u ocultar' },
  { id: 'show', label: 'Mostrar' },
  { id: 'hide', label: 'Ocultar' },
];

/* --------------------------------------------------------------------------
 * Boton
 * ------------------------------------------------------------------------ */

const VARIANTES: Array<{ id: ButtonProperties['variant']; label: string }> = [
  { id: 'solid', label: 'Relleno' },
  { id: 'soft', label: 'Suave' },
  { id: 'outline', label: 'Contorno' },
  { id: 'ghost', label: 'Sin fondo' },
  { id: 'link', label: 'Enlace' },
];

const FORMAS_BOTON: Array<{ id: ButtonProperties['shape']; label: string }> = [
  { id: 'rounded', label: 'Redondeado' },
  { id: 'pill', label: 'Pastilla' },
  { id: 'square', label: 'Recto' },
];

const TAMANOS: Array<{ id: ButtonProperties['size']; label: string }> = [
  { id: 'sm', label: 'Pequeño' },
  { id: 'md', label: 'Mediano' },
  { id: 'lg', label: 'Grande' },
];

/** Paleta de partida; cualquier otro color se elige con el selector de al lado. */
const COLORES_BOTON = [
  '#2563EB', '#0EA5E9', '#16A34A', '#F59E0B',
  '#DC2626', '#DB2777', '#7C3AED', '#0F172A',
];

/**
 * Emojis a mano para el icono del boton. El catalogo completo vive en el dialogo
 * de pegatinas, que se abre desde el lienzo; aqui basta con los mas usados para
 * senalar hacia donde lleva el boton.
 */
const EMOJIS_BOTON = ['▶', '➡', '⬅', '⬆', '⬇', '🔗', '📄', '🏠', '❓', '⭐', '✅', '🔊'];

/**
 * Al elegir un color de relleno se ajusta tambien el borde, un poco mas oscuro.
 * Sin esto habia que tocar dos campos para cambiar un color, y el borde claro
 * sobre relleno oscuro se veia como un fallo.
 */
function oscurecer(hex: string, factor = 0.82): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function ponerColorBoton(hex: string): void {
  if (!props.element) return;
  emit('patch', {
    properties: { ...props.element.properties, backgroundColor: hex, borderColor: oscurecer(hex) },
  });
}

function ponerIcono(fuente: ButtonProperties['iconSource'], char = ''): void {
  if (!props.element) return;
  emit('patch', {
    properties: { ...props.element.properties, iconSource: fuente, iconChar: char, iconPaths: [] },
  });
}

/** Video y audio comparten fileUrl y duracion; el video anade portada y subtitulos. */
const media = computed(
  () =>
    props.element?.properties as unknown as
      | { fileUrl?: string; durationSeconds?: number; posterUrl?: string; captionsText?: string; hotspotColor?: string }
      | undefined,
);

/** "1:23" a partir de los segundos que guarda el elemento. */
const duracion = computed(() => {
  const s = Math.round(media.value?.durationSeconds ?? 0);
  if (!s) return null;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});


/* --------------------------------------------------------------------------
 * Interactividad: informacion ampliada al pasar el raton o al pulsar
 * ------------------------------------------------------------------------ */

const interaccion = computed(() => props.element?.interaction ?? null);

/** El clic ya esta ocupado si el elemento lleva enlace: no caben los dos. */
const clicOcupado = computed(() => linkUrl.value.trim().length > 0);

/** Resumen de lo que hay dentro, para no tener que abrir el dialogo a mirar. */
const resumen = computed(() => {
  const info = interaccion.value;
  if (!info) return null;
  const bloques: RichBlock[] = info.content ?? [];
  const imagenes = bloques.filter((b) => b.type === 'image').length + (info.imageUrl ? 1 : 0);
  const texto = (info.text ?? '').trim();
  return {
    titulo: info.title,
    adelanto: texto.length > 90 ? texto.slice(0, 90) + '...' : texto,
    imagenes,
  };
});

const editandoContenido = ref(false);

/**
 * Al elegir tipo o disparo se guarda enseguida, pero solo si ya hay contenido:
 * el servidor rechaza una interaccion vacia, y con razon. Sin contenido, elegir
 * el tipo abre directamente el dialogo para escribirlo.
 */
function ponerInteraccion(cambio: Partial<ElementInteraction>): void {
  const base: ElementInteraction = interaccion.value ?? {
    kind: 'tooltip',
    trigger: 'hover',
    title: '',
    text: '',
  };
  const siguiente = { ...base, ...cambio };
  if (clicOcupado.value && siguiente.trigger === 'click') siguiente.trigger = 'hover';

  if (!interaccion.value) {
    // Aun no hay nada guardado: se lleva al dialogo con el tipo ya elegido.
    pendiente.value = siguiente;
    editandoContenido.value = true;
    return;
  }
  emit('patch', { interaction: siguiente });
}

/** Interaccion a medio crear, mientras el dialogo esta abierto. */
const pendiente = ref<ElementInteraction | null>(null);

const enEdicion = computed<ElementInteraction | null>(() => pendiente.value ?? interaccion.value);

function guardarContenido(valor: ElementInteraction): void {
  editandoContenido.value = false;
  pendiente.value = null;
  emit('patch', { interaction: valor });
}

function cerrarContenido(): void {
  editandoContenido.value = false;
  pendiente.value = null;
}

function quitarInteraccion(): void {
  pendiente.value = null;
  emit('patch', { interaction: null });
}

/* --------------------------------------------------------------------------
 * Animacion
 * ------------------------------------------------------------------------ */

const EFECTOS: Array<{ id: AnimationEffect; label: string }> = [
  { id: 'fade', label: 'Aparecer' },
  { id: 'zoom', label: 'Acercar' },
  { id: 'slide', label: 'Deslizar' },
  { id: 'bounce', label: 'Rebotar' },
  { id: 'rotate', label: 'Girar' },
  { id: 'swirl', label: 'Remolino' },
  { id: 'roll-in', label: 'Rodar' },
  { id: 'focus', label: 'Enfocar' },
  { id: 'pulse', label: 'Latir' },
];

const MOMENTOS: Array<{ id: ElementAnimation['trigger']; label: string; ayuda: string }> = [
  { id: 'entrance', label: 'Al entrar', ayuda: 'Se reproduce una vez al abrir la página.' },
  { id: 'loop', label: 'Continua', ayuda: 'No para mientras la página esté abierta.' },
  { id: 'hover', label: 'Al pasar el ratón', ayuda: 'Se reproduce cuando el ratón pasa por encima.' },
  { id: 'click', label: 'Al pulsar', ayuda: 'Se reproduce cada vez que se pulsa el elemento.' },
];

watch(() => props.element?.id, () => { pendiente.value = null; editandoContenido.value = false; });

const animacion = computed(() => props.element?.animation ?? null);

const ayudaMomento = computed(
  () => MOMENTOS.find((m) => m.id === animacion.value?.trigger)?.ayuda ?? '',
);

function ponerAnimacion(cambio: Partial<ElementAnimation>): void {
  const base: ElementAnimation = animacion.value ?? {
    trigger: 'entrance',
    effect: 'fade',
    duration: 0.8,
    delay: 0,
  };
  emit('patch', { animation: { ...base, ...cambio } });
  reproducir();
}

function quitarAnimacion(): void {
  emit('patch', { animation: null });
}

/**
 * Muestra el efecto en el cuadrito de al lado. Se recrea el nodo cambiando la
 * clave porque una animacion CSS ya terminada no vuelve a empezar sola.
 */
const ensayo = ref(0);
function reproducir(): void {
  ensayo.value++;
}

const claseEnsayo = computed(() =>
  animacion.value ? ['anim', `anim-${animacion.value.effect}`, 'anim-entrance'] : [],
);

const estiloEnsayo = computed(() => ({
  '--anim-dur': `${animacion.value?.duration ?? 0.8}s`,
  // La espera no se respeta en el ensayo: quien pulsa "Probar" quiere verlo ya.
  '--anim-esp': '0s',
}));

function patchProperty(key: string, value: unknown): void {
  if (!props.element) return;
  emit('patch', { properties: { ...props.element.properties, [key]: value } });
}

// El catalogo vive en types/api.ts para no duplicarlo con el enum del backend.

/** Plantillas de formula habituales en primaria y secundaria. */
const MATH_SAMPLES = [
  { label: 'Fraccion', latex: '\frac{a}{b}' },
  { label: 'Potencia', latex: 'x^{2}' },
  { label: 'Raiz', latex: '\sqrt{x}' },
  { label: 'Ecuacion', latex: 'ax^2 + bx + c = 0' },
  { label: 'Pitagoras', latex: 'a^2 + b^2 = c^2' },
  { label: 'Sumatorio', latex: '\sum_{i=1}^{n} i' },
  { label: 'Integral', latex: '\int_{a}^{b} f(x)\,dx' },
  { label: 'Matriz', latex: '\begin{pmatrix} a & b \\ c & d \end{pmatrix}' },
] as const;
// Tonos hueso y opalo recomendados para reducir el contraste excesivo.
const SOFT_BACKGROUNDS = ['transparent', '#F7F4EC', '#EDF2F0', '#FBF3E4', '#EFEAF6', '#FFFFFF'] as const;
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4">
    <p v-if="!element" class="text-sm text-slate-500">Selecciona un elemento para editarlo.</p>

    <template v-else>
      <div>
        <h2 class="text-sm font-bold capitalize text-slate-800">{{ element.type }}</h2>
        <p class="mt-0.5 text-xs text-slate-400">
          {{ Math.round(element.transformMatrix.width) }}% × {{ Math.round(element.transformMatrix.height) }}% ·
          {{ Math.round(element.transformMatrix.angle) }}°
        </p>
      </div>

      <!-- Capas -->
      <section>
        <h3 class="label">Capa (z-index {{ element.zIndex }})</h3>
        <div class="grid grid-cols-4 gap-1">
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Traer al frente" @click="emit('move', 'front')">⤒</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Subir una" @click="emit('move', 'forward')">↑</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Bajar una" @click="emit('move', 'backward')">↓</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Enviar al fondo" @click="emit('move', 'back')">⤓</button>
        </div>
      </section>

      <!-- Opacidad -->
      <section>
        <label class="label" :for="`opacity-${element.id}`">Opacidad · {{ Math.round(element.opacity * 100) }}%</label>
        <input
          :id="`opacity-${element.id}`"
          type="range"
          min="0" max="1" step="0.05"
          class="w-full accent-brand-600"
          :value="element.opacity"
          @input="emit('patch', { opacity: Number(($event.target as HTMLInputElement).value) })"
        />
      </section>

      <!--
        Ilustracion educativa.

        El ambiente y los colores se cambian sin volver a describir nada: el
        dibujo se recompone al vuelo desde la escena guardada, que es
        deterministica. Solo "Describirla de nuevo" vuelve a analizar el texto.
      -->
      <section v-if="element.type === 'illustration' && ilustracion" class="space-y-3">
        <h3 class="label">Ilustración</h3>

        <p v-if="ilustracion.prompt" class="rounded bg-slate-50 px-2 py-1.5 text-xs italic text-slate-600">
          “{{ ilustracion.prompt }}”
        </p>

        <div>
          <p class="label">Ambiente</p>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="f in FONDOS"
              :key="f"
              type="button"
              class="btn-secondary px-0 py-1 text-[11px]"
              :class="ilustracion.escena.fondo === f && 'bg-brand-50 text-brand-700'"
              @click="cambiarEscena({ fondo: f })"
            >{{ NOMBRES_ILUSTRACION.fondo[f] }}</button>
          </div>
        </div>

        <div>
          <p class="label">Colores</p>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="t in TEMAS"
              :key="t"
              type="button"
              class="btn-secondary px-0 py-1 text-[11px]"
              :class="ilustracion.escena.tema === t && 'bg-brand-50 text-brand-700'"
              @click="cambiarEscena({ tema: t })"
            >{{ NOMBRES_ILUSTRACION.tema[t] }}</button>
          </div>
        </div>

        <div>
          <p class="label">Quién aparece</p>
          <ul class="space-y-1">
            <li
              v-for="(p, i) in ilustracion.escena.personajes"
              :key="i"
              class="flex items-center gap-1"
            >
              <select
                class="input flex-1 py-1 text-xs"
                :value="p.pose"
                @change="cambiarPose(i, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="pose in POSES" :key="pose" :value="pose">
                  {{ NOMBRES_ILUSTRACION.papel[p.papel] }} · {{ NOMBRES_ILUSTRACION.pose[pose] }}
                </option>
              </select>
            </li>
          </ul>
        </div>

        <button type="button" class="btn-secondary w-full justify-center text-xs" @click="emit('rehacerIlustracion')">
          Describirla de nuevo
        </button>
      </section>

      <!--
        Imagen: recuperar su proporcion.

        Sirve para las que se pusieron antes de que la insercion respetara la
        forma de la pagina y quedaron con la caja aplastada, y tambien para
        cuando alguien estira una imagen sin querer.
      -->
      <section v-if="element.type === 'image'">
        <h3 class="label">Imagen</h3>
        <button type="button" class="btn-secondary w-full justify-center text-xs" @click="emit('ajustarAImagen')">
          Ajustar a la proporcion de la imagen
        </button>
        <p class="mt-1 text-[11px] leading-tight text-slate-400">
          Le devuelve su forma original para que no se vea recortada.
        </p>
      </section>

      <!-- Bloqueo (solo docentes) -->
      <section v-if="isManager">
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            :checked="element.isLocked"
            @change="emit('patch', { isLocked: !element.isLocked })"
          />
          Bloquear elemento (plantilla)
        </label>
      </section>
      <p v-else-if="element.isLocked" class="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
        Bloqueado por el docente.
      </p>

      <!-- Propiedades de texto -->
      <section v-if="element.type === 'text' && text" class="space-y-3 border-t border-slate-100 pt-3">
        <div>
          <label class="label" :for="`text-${element.id}`">Contenido</label>
          <!--
            @input, no @change: con @change habia que salir del campo para ver el
            texto en la pagina, asi que se escribia a ciegas. El guardado se
            retrasa hasta que se deja de teclear.
          -->
          <textarea
            :id="`text-${element.id}`"
            rows="4"
            class="input"
            :value="text.text"
            @input="patchPropertyVivo('text', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <div>
          <label class="label" :for="`font-${element.id}`">Tipografía</label>
          <select :id="`font-${element.id}`" class="input" :value="text.fontFamily" @change="patchProperty('fontFamily', ($event.target as HTMLSelectElement).value)">
            <optgroup v-for="group in FONT_GROUPS" :key="group.label" :label="group.label">
              <!-- Cada opción se muestra con su propia tipografía para elegir de un vistazo. -->
              <option
                v-for="font in group.fonts"
                :key="font"
                :value="font"
                :style="{ fontFamily: `'${font}', sans-serif` }"
              >{{ font }}</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label class="label">Lista</label>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="option in [
                { id: 'none', label: 'Sin lista' },
                { id: 'bullet', label: '• Vinetas' },
                { id: 'number', label: '1. Numeros' },
              ]"
              :key="option.id"
              type="button"
              class="btn-secondary px-1 py-1.5 text-[11px]"
              :class="(text.listStyle ?? 'none') === option.id && 'bg-brand-50 text-brand-700'"
              @click="patchProperty('listStyle', option.id)"
            >{{ option.label }}</button>
          </div>
        </div>

        <div>
          <label class="label" :for="`lh-${element.id}`">
            Interlineado · {{ (text.lineHeight ?? 1.35).toFixed(2) }}
          </label>
          <input
            :id="`lh-${element.id}`"
            type="range" min="0.9" max="2.4" step="0.05"
            class="w-full accent-brand-600"
            :value="text.lineHeight ?? 1.35"
            @input="patchProperty('lineHeight', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div>
          <label class="label" :for="`size-${element.id}`">Tamaño · {{ text.fontSize }}px</label>
          <input
            :id="`size-${element.id}`"
            type="range" min="24" max="120" step="2"
            class="w-full accent-brand-600"
            :value="text.fontSize"
            @change="patchProperty('fontSize', Number(($event.target as HTMLInputElement).value))"
          />
          <p class="mt-0.5 text-[11px] text-slate-400">Mínimo accesible: 24px</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" :for="`color-${element.id}`">Texto</label>
            <input :id="`color-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="text.color" @change="patchProperty('color', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <label class="label" :for="`align-${element.id}`">Alineacion</label>
            <select :id="`align-${element.id}`" class="input" :value="text.textAlign" @change="patchProperty('textAlign', ($event.target as HTMLSelectElement).value)">
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
          </div>
        </div>

        <div>
          <span class="label">Fondo suave</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="bg in SOFT_BACKGROUNDS"
              :key="bg"
              type="button"
              class="h-7 w-7 rounded border-2"
              :class="text.backgroundColor === bg ? 'border-brand-600' : 'border-slate-300'"
              :style="bg === 'transparent' ? { backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '8px 8px' } : { backgroundColor: bg }"
              :title="bg"
              @click="patchProperty('backgroundColor', bg)"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-1">
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs font-bold" :class="text.bold && 'bg-brand-50 text-brand-700'" @click="patchProperty('bold', !text.bold)">B</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs italic" :class="text.italic && 'bg-brand-50 text-brand-700'" @click="patchProperty('italic', !text.italic)">I</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs underline" :class="text.underline && 'bg-brand-50 text-brand-700'" @click="patchProperty('underline', !text.underline)">U</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs line-through" :class="text.strikethrough && 'bg-brand-50 text-brand-700'" @click="patchProperty('strikethrough', !text.strikethrough)">S</button>
        </div>
      </section>

      <!-- Propiedades de forma -->
      <section v-else-if="element.type === 'shape' && shape" class="space-y-3 border-t border-slate-100 pt-3">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" :for="`fill-${element.id}`">Relleno</label>
            <input :id="`fill-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="shape.fillColor === 'transparent' ? '#ffffff' : shape.fillColor" @change="patchProperty('fillColor', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <label class="label" :for="`stroke-${element.id}`">Borde</label>
            <input :id="`stroke-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="shape.strokeColor === 'transparent' ? '#000000' : shape.strokeColor" @change="patchProperty('strokeColor', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>

        <div>
          <label class="label" :for="`sw-${element.id}`">Grosor · {{ shape.strokeWidth }}</label>
          <input :id="`sw-${element.id}`" type="range" min="0" max="20" step="1" class="w-full accent-brand-600" :value="shape.strokeWidth" @change="patchProperty('strokeWidth', Number(($event.target as HTMLInputElement).value))" />
        </div>

        <div>
          <label class="label" :for="`label-${element.id}`">Texto interior</label>
          <input :id="`label-${element.id}`" type="text" class="input" :value="shape.label" @change="patchProperty('label', ($event.target as HTMLInputElement).value)" />
        </div>
      </section>

      <!-- Pregunta -->
      <section v-if="element.type === 'question' && question">
        <h3 class="label">Pregunta</h3>
        <QuestionInspector :question="question" @patch="emit('patch', { properties: $event })" />
      </section>

      <!-- Video -->
      <section v-if="element.type === 'video' && media" class="space-y-3 border-t border-slate-100 pt-3">
        <h3 class="label">Vídeo</h3>

        <p class="text-xs text-slate-500">
          <span v-if="duracion">Duración {{ duracion }}</span>
          <span v-else>Duración desconocida</span>
          · pulsa ▶ en la esquina para verlo sin salir del lienzo.
        </p>

        <div>
          <label class="label" :for="`poster-${element.id}`">Imagen de portada (opcional)</label>
          <input
            :id="`poster-${element.id}`"
            type="url"
            class="input text-xs"
            placeholder="https://..."
            :value="media.posterUrl ?? ''"
            @change="patchProperty('posterUrl', ($event.target as HTMLInputElement).value.trim() || undefined)"
          />
          <p class="mt-1 text-xs text-slate-500">Se ve antes de darle al play, y en las miniaturas.</p>
        </div>

        <div>
          <label class="label" :for="`captions-${element.id}`">Subtítulos o transcripción</label>
          <textarea
            :id="`captions-${element.id}`"
            class="input min-h-[5rem] resize-y text-xs"
            placeholder="Lo que se dice en el vídeo, para quien no pueda oírlo."
            :value="media.captionsText ?? ''"
            @change="patchProperty('captionsText', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
          <p class="mt-1 text-xs text-slate-500">
            Hace el libro utilizable por quien no oye, y por quien lo abre sin auriculares.
          </p>
        </div>

        <a
          v-if="media.fileUrl"
          :href="media.fileUrl"
          target="_blank"
          rel="noopener"
          class="inline-block text-xs font-semibold text-brand-600 hover:underline"
        >Abrir el archivo en otra pestaña</a>
      </section>

      <!-- Formula matemática -->
      <section v-if="element.type === 'math'">
        <label class="label" :for="`latex-${element.id}`">Formula (LaTeX)</label>
        <textarea
          :id="`latex-${element.id}`"
          class="input min-h-[5rem] resize-y font-mono text-xs"
          :value="String(element.properties.latex ?? '')"
          @change="patchProperty('latex', ($event.target as HTMLTextAreaElement).value)"
        />
        <div class="mt-1.5 flex flex-wrap gap-1">
          <button
            v-for="sample in MATH_SAMPLES"
            :key="sample.latex"
            type="button"
            class="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            :title="sample.latex"
            @click="patchProperty('latex', sample.latex)"
          >{{ sample.label }}</button>
        </div>
        <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            :checked="element.properties.displayMode !== false"
            @change="patchProperty('displayMode', ($event.target as HTMLInputElement).checked)"
          />
          Formula en bloque (centrada y grande)
        </label>
      </section>

      <!-- Gráfica -->
      <section v-if="element.type === 'chart' && chart">
        <h3 class="label">Gráfica</h3>
        <ChartInspector :chart="chart" @patch="emit('patch', { properties: $event })" />
      </section>

      <!-- Boton: aspecto y contenido; el destino va en la seccion de Enlace -->
      <section v-if="element.type === 'button' && boton" class="space-y-3 border-t border-slate-100 pt-3">
        <div>
          <label class="label" :for="`btn-texto-${element.id}`">Texto del botón</label>
          <input
            :id="`btn-texto-${element.id}`"
            type="text"
            class="input"
            maxlength="120"
            :value="boton.label"
            @input="patchProperty('label', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <div>
          <span class="label">Estilo</span>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="v in VARIANTES"
              :key="v.id"
              type="button"
              class="rounded-lg border px-1 py-1.5 text-[11px] font-medium transition"
              :class="boton.variant === v.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
              @click="patchProperty('variant', v.id)"
            >{{ v.label }}</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="label">Bordes</span>
            <select
              class="input py-1 text-xs"
              :value="boton.shape"
              @change="patchProperty('shape', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="f in FORMAS_BOTON" :key="f.id" :value="f.id">{{ f.label }}</option>
            </select>
          </div>
          <div>
            <span class="label">Tamaño del texto</span>
            <select
              class="input py-1 text-xs"
              :value="boton.size"
              @change="patchProperty('size', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="t in TAMANOS" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </div>
        </div>

        <div>
          <span class="label">Color</span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="c in COLORES_BOTON"
              :key="c"
              type="button"
              class="h-7 w-7 rounded-lg border-2 transition"
              :class="boton.backgroundColor.toLowerCase() === c.toLowerCase()
                ? 'border-slate-800' : 'border-white shadow-sm'"
              :style="{ backgroundColor: c }"
              :title="c"
              @click="ponerColorBoton(c)"
            ></button>
            <label class="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-slate-300 text-[10px] text-slate-500">
              <input
                type="color"
                class="sr-only"
                :value="boton.backgroundColor"
                @change="ponerColorBoton(($event.target as HTMLInputElement).value.toUpperCase())"
              />
              +
            </label>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="text-[11px] text-slate-500">
            Color del texto
            <input
              type="color"
              class="mt-0.5 h-7 w-full cursor-pointer rounded border border-slate-300"
              :value="boton.textColor"
              @change="patchProperty('textColor', ($event.target as HTMLInputElement).value.toUpperCase())"
            />
          </label>
          <label class="text-[11px] text-slate-500">
            Color del borde
            <input
              type="color"
              class="mt-0.5 h-7 w-full cursor-pointer rounded border border-slate-300"
              :value="boton.borderColor"
              @change="patchProperty('borderColor', ($event.target as HTMLInputElement).value.toUpperCase())"
            />
          </label>
        </div>

        <div>
          <span class="label">Tipografía</span>
          <select
            class="input py-1 text-xs"
            :value="boton.fontFamily"
            @change="patchProperty('fontFamily', ($event.target as HTMLSelectElement).value)"
          >
            <optgroup v-for="grupo in FONT_GROUPS" :key="grupo.label" :label="grupo.label">
              <option v-for="f in grupo.fonts" :key="f" :value="f">{{ f }}</option>
            </optgroup>
          </select>
        </div>

        <div>
          <span class="label">Icono</span>
          <div class="mb-1 flex flex-wrap gap-1">
            <button
              type="button"
              class="h-7 rounded-lg border px-2 text-[11px] transition"
              :class="boton.iconSource === 'none'
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
              @click="ponerIcono('none')"
            >Sin icono</button>
            <button
              v-for="e in EMOJIS_BOTON"
              :key="e"
              type="button"
              class="h-7 w-7 rounded-lg border text-sm transition"
              :class="boton.iconSource === 'emoji' && boton.iconChar === e
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-300 bg-white hover:bg-slate-50'"
              @click="ponerIcono('emoji', e)"
            >{{ e }}</button>
          </div>
          <div v-if="boton.iconSource !== 'none'" class="flex gap-1">
            <button
              v-for="lado in [{ id: 'left', label: 'Icono a la izquierda' }, { id: 'right', label: 'A la derecha' }]"
              :key="lado.id"
              type="button"
              class="flex-1 rounded-lg border px-2 py-1 text-[11px] transition"
              :class="boton.iconPosition === lado.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
              @click="patchProperty('iconPosition', lado.id)"
            >{{ lado.label }}</button>
          </div>
        </div>

        <label class="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-slate-300"
            :checked="boton.shadow"
            @change="patchProperty('shadow', ($event.target as HTMLInputElement).checked)"
          />
          Sombra
        </label>

        <p class="text-[11px] leading-tight text-slate-400">
          El destino del botón se elige abajo, en <strong>Enlace</strong>: otra página
          de este libro o una dirección web.
        </p>
      </section>

      <!-- Enlace: se abre al pulsar el elemento en el modo lectura -->
      <section v-if="canLink" class="space-y-2">
        <h3 class="label">Enlace</h3>

        <div class="flex gap-1">
          <button
            v-for="modo in MODOS_ENLACE"
            :key="modo.id"
            type="button"
            class="flex-1 rounded-lg border px-2 py-1 text-xs font-semibold transition"
            :class="modoEnlace === modo.id
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-200 text-slate-600 hover:border-brand-300'"
            @click="cambiarModoEnlace(modo.id)"
          >{{ modo.label }}</button>
        </div>

        <!-- Marcador: salta a otra pagina del propio libro -->
        <template v-if="modoEnlace === 'pagina'">
          <select
            :id="`link-${element.id}`"
            class="input"
            :value="paginaEnlazada ?? ''"
            @change="patchLink(
              ($event.target as HTMLSelectElement).value
                ? `#pagina-${($event.target as HTMLSelectElement).value}`
                : '',
            )"
          >
            <option value="">Elige la página de destino</option>
            <option v-for="n in pageNumbers" :key="n" :value="n">
              {{ n === 1 ? 'Portada' : `Página ${n}` }}
            </option>
          </select>
          <p class="text-[11px] leading-tight text-slate-400">
            Al pulsarlo en el modo lectura, el libro salta a esa página. Sirve para hacer un índice.
          </p>
        </template>

        <template v-else-if="modoEnlace === 'externo'">
          <input
            :id="`link-${element.id}`"
            type="url"
            class="input"
            placeholder="https://..."
            :value="linkUrl"
            @change="patchLink(($event.target as HTMLInputElement).value)"
          />
          <p class="text-[11px] leading-tight text-slate-400">
            Se abrirá en una pestaña nueva al pulsarlo en el modo lectura.
          </p>
        </template>

        <p v-else class="text-[11px] leading-tight text-slate-400">
          Este elemento no lleva enlace.
        </p>
      </section>

      <!-- Interactividad: informacion ampliada sobre el propio elemento -->
      <section class="space-y-2 border-t border-slate-100 pt-3">
        <h3 class="label">Interactividad</h3>

        <div class="flex gap-1">
          <button
            v-for="modo in [
              { id: 'ninguna', label: 'Ninguna' },
              { id: 'tooltip', label: 'Globo' },
              { id: 'popup', label: 'Ventana' },
            ]"
            :key="modo.id"
            type="button"
            class="flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition"
            :class="(interaccion?.kind ?? 'ninguna') === modo.id
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
            @click="modo.id === 'ninguna'
              ? quitarInteraccion()
              : ponerInteraccion({ kind: modo.id as 'tooltip' | 'popup' })"
          >{{ modo.label }}</button>
        </div>

        <template v-if="interaccion">
          <div class="flex gap-1">
            <button
              v-for="disparo in [
                { id: 'hover', label: 'Al pasar el ratón' },
                { id: 'click', label: 'Al pulsar' },
              ]"
              :key="disparo.id"
              type="button"
              class="flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition
                     disabled:cursor-not-allowed disabled:opacity-40"
              :class="interaccion.trigger === disparo.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
              :disabled="disparo.id === 'click' && clicOcupado"
              @click="ponerInteraccion({ trigger: disparo.id as 'hover' | 'click' })"
            >{{ disparo.label }}</button>
          </div>

          <p v-if="clicOcupado" class="text-[11px] leading-tight text-amber-600">
            Este elemento ya tiene un enlace, que se abre al pulsarlo. La información
            se mostrará al pasar el ratón.
          </p>

          <!-- Resumen de lo que hay guardado -->
          <div v-if="resumen" class="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p v-if="resumen.titulo" class="text-xs font-semibold text-slate-700">{{ resumen.titulo }}</p>
            <p v-if="resumen.adelanto" class="text-[11px] leading-tight text-slate-500">{{ resumen.adelanto }}</p>
            <p v-if="resumen.imagenes" class="mt-0.5 text-[11px] text-slate-400">
              {{ resumen.imagenes }} {{ resumen.imagenes === 1 ? 'imagen' : 'imágenes' }}
            </p>
          </div>

          <button type="button" class="btn-secondary w-full py-1.5 text-xs" @click="editandoContenido = true">
            Editar contenido
          </button>

          <p class="text-[11px] leading-tight text-slate-400">
            {{ interaccion.kind === 'tooltip'
              ? 'Aparece una tarjeta junto al cursor. Admite texto con formato y una imagen.'
              : 'Se abre una ventana centrada. Admite texto con formato, listas y varias imágenes.' }}
          </p>
        </template>

        <p v-else class="text-[11px] leading-tight text-slate-400">
          Añade información que aparece al pasar el ratón o al pulsar, sin ocupar sitio
          en la página.
        </p>
      </section>

      <!-- Mostrar y ocultar: este objeto actua sobre otros de la misma pagina -->
      <section class="space-y-2 border-t border-slate-100 pt-3">
        <h3 class="label">Mostrar y ocultar</h3>

        <label class="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-slate-300"
            :checked="acciones?.startHidden ?? false"
            @change="ponerAcciones({ startHidden: ($event.target as HTMLInputElement).checked })"
          />
          <span>
            Empieza oculto
            <span class="block text-[11px] leading-tight text-slate-400">
              En el modo lectura no se ve hasta que otro objeto lo muestre. Aquí en el
              editor se sigue viendo, para poder trabajarlo.
            </span>
          </span>
        </label>

        <div v-if="reglas.length" class="space-y-2">
          <div
            v-for="(regla, i) in reglas"
            :key="i"
            class="rounded-lg border border-slate-200 p-2"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <p class="min-w-0 truncate text-[11px] font-semibold text-slate-600">
                {{ etiquetaDe(regla.target) }}
              </p>
              <button
                type="button"
                class="shrink-0 rounded px-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Quitar"
                @click="quitarRegla(i)"
              >✕</button>
            </div>
            <div class="grid grid-cols-2 gap-1">
              <select
                class="input py-1 text-[11px]"
                :value="regla.action"
                @change="cambiarRegla(i, { action: ($event.target as HTMLSelectElement).value as ElementActionRule['action'] })"
              >
                <option v-for="a in ACCIONES" :key="a.id" :value="a.id">{{ a.label }}</option>
              </select>
              <select
                class="input py-1 text-[11px]"
                :value="regla.trigger"
                @change="cambiarRegla(i, { trigger: ($event.target as HTMLSelectElement).value as 'click' | 'hover' })"
              >
                <option value="click">Al pulsar</option>
                <option value="hover">Al pasar el ratón</option>
              </select>
            </div>
          </div>
        </div>

        <select
          v-if="objetivos.length"
          class="input py-1 text-xs"
          :value="''"
          @change="anadirRegla(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Añadir un objeto al que afectar...</option>
          <option v-for="o in objetivos" :key="o.el.id" :value="o.el.id">{{ o.etiqueta }}</option>
        </select>
        <p v-else class="text-[11px] leading-tight text-slate-400">
          Esta página no tiene otros objetos sobre los que actuar.
        </p>

        <p v-if="!reglas.length" class="text-[11px] leading-tight text-slate-400">
          Al pulsar este objeto puedes hacer que otro aparezca o desaparezca. Sirve
          para respuestas que se destapan, pistas y capas.
        </p>
      </section>

      <!-- Animacion: movimiento del elemento en el modo lectura -->
      <section class="space-y-2 border-t border-slate-100 pt-3">
        <div class="flex items-center justify-between">
          <h3 class="label mb-0">Animación</h3>
          <button
            v-if="animacion"
            type="button"
            class="text-[11px] font-medium text-slate-400 hover:text-red-600"
            @click="quitarAnimacion()"
          >Quitar</button>
        </div>

        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="efecto in EFECTOS"
            :key="efecto.id"
            type="button"
            class="rounded-lg border px-1 py-1.5 text-[11px] font-medium transition"
            :class="animacion?.effect === efecto.id
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
            @click="ponerAnimacion({ effect: efecto.id })"
          >{{ efecto.label }}</button>
        </div>

        <template v-if="animacion">
          <select
            class="input"
            :value="animacion.trigger"
            @change="ponerAnimacion({ trigger: ($event.target as HTMLSelectElement).value as ElementAnimation['trigger'] })"
          >
            <option v-for="m in MOMENTOS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <p class="text-[11px] leading-tight text-slate-400">{{ ayudaMomento }}</p>

          <label class="block text-[11px] text-slate-500">
            Duración: {{ animacion.duration.toFixed(1) }} s
            <input
              type="range"
              class="w-full"
              min="0.2"
              max="6"
              step="0.1"
              :value="animacion.duration"
              @change="ponerAnimacion({ duration: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>

          <label v-if="animacion.trigger === 'entrance'" class="block text-[11px] text-slate-500">
            Espera antes de empezar: {{ animacion.delay.toFixed(1) }} s
            <input
              type="range"
              class="w-full"
              min="0"
              max="10"
              step="0.1"
              :value="animacion.delay"
              @change="ponerAnimacion({ delay: Number(($event.target as HTMLInputElement).value) })"
            />
          </label>

          <!-- Ensayo: se ve el efecto sin tener que irse a leer el libro -->
          <div class="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
            <div class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden">
              <div
                :key="ensayo"
                class="h-8 w-8 rounded bg-brand-500"
                :class="claseEnsayo"
                :style="estiloEnsayo"
              ></div>
            </div>
            <button type="button" class="btn-secondary flex-1 py-1 text-xs" @click="reproducir()">
              Probar de nuevo
            </button>
          </div>
        </template>

        <p v-else class="text-[11px] leading-tight text-slate-400">
          Elige un efecto para que el elemento se mueva en el modo lectura.
        </p>
      </section>

      <button type="button" class="btn-danger mt-auto w-full" @click="emit('remove')">Eliminar elemento</button>

      <InteractionContentDialog
        v-if="editandoContenido && enEdicion"
        :interaction="enEdicion"
        @close="cerrarContenido()"
        @save="guardarContenido"
      />
    </template>
  </aside>
</template>
