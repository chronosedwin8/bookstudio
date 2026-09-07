<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ChartInspector from './ChartInspector.vue';
import QuestionInspector from './QuestionInspector.vue';
import {
  FONT_GROUPS,
  type AnimationEffect,
  type CanvasElement,
  type ElementAnimation,
  type ElementInteraction,
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
    },
  ];
  move: [direction: 'front' | 'forward' | 'backward' | 'back'];
  remove: [];
}>();

/** Tipos que admiten enlace; el resto no muestra el campo. */
const LINKABLE = ['text', 'image', 'shape', 'icon'] as const;

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

/** Limites que tambien aplica el backend; aqui solo para avisar antes de enviar. */
const TOPE_GLOBO = 300;
const TOPE_VENTANA = 4000;

const interaccion = computed(() => props.element?.interaction ?? null);

const topeTexto = computed(() => (interaccion.value?.kind === 'popup' ? TOPE_VENTANA : TOPE_GLOBO));

/** El clic ya esta ocupado si el elemento lleva enlace: no caben los dos. */
const clicOcupado = computed(() => linkUrl.value.trim().length > 0);

/**
 * Lo que se esta escribiendo antes de que valga la pena guardarlo. Sin esto, el
 * primer caracter del titulo se perderia: el elemento aun no tiene interaccion
 * guardada y el campo volveria a quedarse vacio en cuanto se repintara.
 */
const borrador = ref<ElementInteraction | null>(null);

const infoActual = computed(() => interaccion.value ?? borrador.value);

function ponerInteraccion(cambio: Partial<ElementInteraction>): void {
  const base: ElementInteraction = interaccion.value ?? {
    kind: 'tooltip',
    trigger: 'hover',
    title: '',
    text: '',
  };
  const siguiente = { ...base, ...cambio };

  // Un globo no admite ni parrafadas ni imagen. Se recorta al vuelo en vez de
  // dejar que el backend rechace el cambio con un error que no explica nada.
  if (siguiente.kind === 'tooltip') {
    siguiente.text = siguiente.text.slice(0, TOPE_GLOBO);
    delete siguiente.imageUrl;
  } else {
    siguiente.text = siguiente.text.slice(0, TOPE_VENTANA);
  }
  if (clicOcupado.value && siguiente.trigger === 'click') siguiente.trigger = 'hover';

  // Sin texto no hay nada que mostrar, y el backend lo rechaza: se guarda solo
  // cuando ya hay contenido. Mientras tanto vive en el borrador de aqui.
  borrador.value = siguiente;
  if (siguiente.text.trim()) emit('patch', { interaction: siguiente });
}

function quitarInteraccion(): void {
  borrador.value = null;
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

watch(() => props.element?.id, () => { borrador.value = null; });

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
          <textarea
            :id="`text-${element.id}`"
            rows="4"
            class="input"
            :value="text.text"
            @change="patchProperty('text', ($event.target as HTMLTextAreaElement).value)"
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
            :class="(infoActual?.kind ?? 'ninguna') === modo.id
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
            @click="modo.id === 'ninguna'
              ? quitarInteraccion()
              : ponerInteraccion({ kind: modo.id as 'tooltip' | 'popup' })"
          >{{ modo.label }}</button>
        </div>

        <template v-if="infoActual">
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
              :class="infoActual.trigger === disparo.id
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

          <input
            type="text"
            class="input"
            placeholder="Título (opcional)"
            maxlength="120"
            :value="infoActual.title"
            @input="ponerInteraccion({ title: ($event.target as HTMLInputElement).value })"
          />

          <textarea
            class="input resize-y"
            :rows="infoActual.kind === 'popup' ? 5 : 3"
            :maxlength="topeTexto"
            placeholder="Texto que verá quien lea el libro"
            :value="infoActual.text"
            @input="ponerInteraccion({ text: ($event.target as HTMLTextAreaElement).value })"
          ></textarea>

          <p class="flex items-center justify-between text-[11px] leading-tight text-slate-400">
            <span>Texto sin formato: se muestra tal cual.</span>
            <span :class="infoActual.text.length >= topeTexto ? 'font-semibold text-amber-600' : ''">
              {{ infoActual.text.length }}/{{ topeTexto }}
            </span>
          </p>

          <template v-if="infoActual.kind === 'popup'">
            <input
              type="url"
              class="input"
              placeholder="Imagen de la ventana (opcional)"
              :value="infoActual.imageUrl ?? ''"
              @change="ponerInteraccion({ imageUrl: ($event.target as HTMLInputElement).value.trim() || undefined })"
            />
            <p class="text-[11px] leading-tight text-slate-400">
              Se abre una ventana centrada. Se cierra con su aspa o con la tecla Escape.
            </p>
          </template>
          <p v-else class="text-[11px] leading-tight text-slate-400">
            Aparece un globo junto al cursor. Para más texto o una imagen, usa una ventana.
          </p>
        </template>

        <p v-else class="text-[11px] leading-tight text-slate-400">
          Añade información que aparece al pasar el ratón o al pulsar, sin ocupar sitio
          en la página.
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
    </template>
  </aside>
</template>
