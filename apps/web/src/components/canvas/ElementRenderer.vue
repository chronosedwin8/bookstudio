<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import ChartRenderer from './ChartRenderer.vue';
import EmbedRenderer from './EmbedRenderer.vue';
import IconRenderer from './IconRenderer.vue';
import MathRenderer from './MathRenderer.vue';
import QuestionRenderer from './QuestionRenderer.vue';
import ShapeRenderer from './ShapeRenderer.vue';
import StrokeRenderer from './StrokeRenderer.vue';

// Leaflet solo se descarga cuando hay un mapa interactivo de verdad: las miniaturas
// del panel y de las listas usan el marcador ligero y no deben cargar la libreria.
const MapWidget = defineAsyncComponent(() => import('@/components/media/MapWidget.vue'));
import type {
  AnswerResult,
  CanvasElement,
  ChartProperties,
  QuestionProperties,
  ShapeProperties,
  TextProperties,
} from '@/types/api';
import type { BrushStyle } from '@/stores/preferences';

const props = defineProps<{
  element: CanvasElement;
  /** Edicion in-situ; solo la activa el elemento seleccionado y editable. */
  editingText?: boolean;
  /**
   * Miniatura estatica: sustituye mapas, videos y audios por marcadores ligeros.
   * Sin esto una rejilla de paginas crearia una instancia de Leaflet por mapa.
   */
  preview?: boolean;
  /** Corrige una pregunta contra el servidor; solo lo aporta el modo lectura. */
  checkAnswer?: (elementId: string, answer: string[]) => Promise<AnswerResult>;
}>();

const emit = defineEmits<{ updateText: [value: string] }>();

const text = computed(() => props.element.properties as unknown as TextProperties);
const shape = computed(() => props.element.properties as unknown as ShapeProperties);

const drawing = computed(() => {
  const p = props.element.properties;
  return {
    svgPath: String(p.svgPath ?? ''),
    extraPaths: Array.isArray(p.extraPaths) ? (p.extraPaths as string[]) : [],
    brushStyle: (p.brushStyle ?? 'pen') as BrushStyle,
    strokeColor: String(p.strokeColor ?? '#333333'),
    strokeWidth: Number(p.strokeWidth ?? 5),
    fillColor: String(p.fillColor ?? 'transparent'),
    viewBox: String(p.viewBox ?? '0 0 1000 1000'),
  };
});

const media = computed(() => {
  const p = props.element.properties;
  return {
    fileUrl: String(p.fileUrl ?? ''),
    hotspotColor: String(p.hotspotColor ?? '#FF5733'),
    transcriptText: String(p.transcriptText ?? ''),
    captionsText: String(p.captionsText ?? ''),
    posterUrl: p.posterUrl ? String(p.posterUrl) : undefined,
    altText: String(p.altText ?? ''),
  };
});

const mapProps = computed(() => {
  const p = props.element.properties;
  return {
    latitude: Number(p.latitude ?? 0),
    longitude: Number(p.longitude ?? 0),
    zoom: Number(p.zoom ?? 13),
    label: String(p.label ?? ''),
    showMarker: p.showMarker !== false,
    interactive: p.interactive !== false,
  };
});

const icon = computed(() => {
  const p = props.element.properties;
  return {
    source: (p.source === 'emoji' ? 'emoji' : 'library') as 'emoji' | 'library',
    char: String(p.char ?? ''),
    paths: Array.isArray(p.paths) ? (p.paths as string[]) : [],
    viewBox: String(p.viewBox ?? '0 0 24 24'),
    color: String(p.color ?? '#333333'),
    strokeWidth: Number(p.strokeWidth ?? 2),
    filled: p.filled === true,
    label: String(p.label ?? ''),
  };
});

const embed = computed(() => {
  const p = props.element.properties;
  return {
    provider: String(p.provider ?? ''),
    embedUrl: String(p.embedUrl ?? ''),
    title: String(p.title ?? ''),
    askBeforeLoading: p.askBeforeLoading === true,
  };
});

const question = computed(() => props.element.properties as unknown as QuestionProperties);
const chart = computed(() => props.element.properties as unknown as ChartProperties);

const math = computed(() => {
  const p = props.element.properties;
  return {
    latex: String(p.latex ?? ''),
    displayMode: p.displayMode !== false,
    color: String(p.color ?? '#1E293B'),
    backgroundColor: String(p.backgroundColor ?? 'transparent'),
  };
});

const attribution = computed(() => {
  const a = props.element.properties.attribution as { text?: string } | undefined;
  return a?.text?.trim() || '';
});

const audioPlaying = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);

function toggleAudio(): void {
  const el = audioRef.value;
  if (!el) return;
  if (el.paused) {
    void el.play();
    audioPlaying.value = true;
  } else {
    el.pause();
    audioPlaying.value = false;
  }
}

const editor = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.editingText,
  async (active) => {
    if (!active) return;
    await nextTick();
    editor.value?.focus();
    editor.value?.select();
  },
);

const textStyle = computed(() => ({
  fontFamily: `"${text.value.fontFamily}", sans-serif`,
  fontSize: `${text.value.fontSize}px`,
  color: text.value.color,
  backgroundColor: text.value.backgroundColor,
  textAlign: text.value.textAlign,
  columnCount: text.value.columns,
  fontWeight: text.value.bold ? 700 : 400,
  fontStyle: text.value.italic ? 'italic' : 'normal',
  textDecoration:
    [text.value.underline && 'underline', text.value.strikethrough && 'line-through'].filter(Boolean).join(' ') ||
    'none',
  paddingLeft: `${text.value.indent * 1.5}rem`,
  lineHeight: String(text.value.lineHeight ?? 1.35),
  letterSpacing: `${text.value.letterSpacing ?? 0}px`,
}));

/** Las listas se componen linea a linea: el texto se guarda en plano. */
const textLines = computed(() => {
  const style = text.value.listStyle ?? 'none';
  if (style === 'none') return null;
  return (text.value.text || '')
    .split(String.fromCharCode(10))
    .map((line, index) => ({
      key: index,
      marker: style === 'number' ? `${index + 1}.` : '•',
      content: line,
    }));
});

</script>

<template>
  <!-- Texto -->
  <template v-if="element.type === 'text'">
    <textarea
      v-if="editingText"
      ref="editor"
      class="h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 p-2 leading-snug outline-none"
      :style="textStyle"
      :value="text.text"
      @pointerdown.stop
      @keydown.stop
      @blur="emit('updateText', ($event.target as HTMLTextAreaElement).value)"
    />
    <ul
      v-else-if="textLines"
      class="h-full w-full overflow-hidden break-words p-2"
      :style="textStyle"
    >
      <li v-for="line in textLines" :key="line.key" class="flex gap-2">
        <span class="shrink-0 opacity-70">{{ line.marker }}</span>
        <span class="min-w-0 flex-1 whitespace-pre-wrap">{{ line.content }}</span>
      </li>
    </ul>

    <div
      v-else
      class="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-2"
      :style="textStyle"
    >{{ text.text || 'Escribe aquí...' }}</div>
  </template>

  <!-- Dibujo vectorial -->
  <StrokeRenderer
    v-else-if="element.type === 'drawing'"
    :svg-path="drawing.svgPath"
    :extra-paths="drawing.extraPaths"
    :brush-style="drawing.brushStyle"
    :stroke-color="drawing.strokeColor"
    :stroke-width="drawing.strokeWidth"
    :fill-color="drawing.fillColor"
    :view-box="drawing.viewBox"
  />

  <!-- Formas -->
  <div v-else-if="element.type === 'shape'" class="relative h-full w-full">
    <ShapeRenderer
      :shape="shape.shape"
      :fill-color="shape.fillColor"
      :stroke-color="shape.strokeColor"
      :stroke-width="shape.strokeWidth"
      :corner-radius="shape.cornerRadius"
    />
    <span
      v-if="shape.label"
      class="pointer-events-none absolute inset-0 grid place-items-center px-3 text-center font-semibold"
      :style="{ color: shape.strokeColor }"
    >{{ shape.label }}</span>
  </div>

  <!-- Iconos y emojis -->
  <IconRenderer
    v-else-if="element.type === 'icon'"
    :source="icon.source"
    :char="icon.char"
    :paths="icon.paths"
    :view-box="icon.viewBox"
    :color="icon.color"
    :stroke-width="icon.strokeWidth"
    :filled="icon.filled"
    :label="icon.label"
  />

  <!-- Bloque de pregunta -->
  <QuestionRenderer
    v-else-if="element.type === 'question'"
    :kind="question.kind"
    :prompt="question.prompt"
    :prompt-image-url="question.promptImageUrl"
    :options="question.options ?? []"
    :feedback-correct="question.feedbackCorrect"
    :feedback-wrong="question.feedbackWrong"
    :accent-color="question.accentColor"
    :allow-retry="question.allowRetry"
    :preview="preview || !checkAnswer"
    :check="checkAnswer ? (answer) => checkAnswer!(element.id, answer) : undefined"
  />

  <!-- Formula matemática -->
  <MathRenderer
    v-else-if="element.type === 'math'"
    :latex="math.latex"
    :display-mode="math.displayMode"
    :color="math.color"
    :background-color="math.backgroundColor"
  />

  <!-- Gráfica estadistica -->
  <ChartRenderer
    v-else-if="element.type === 'chart'"
    :chart-type="chart.chartType"
    :title="chart.title"
    :series="chart.series ?? []"
    :show-values="chart.showValues"
    :show-legend="chart.showLegend"
    :accent-color="chart.accentColor"
  />

  <!-- Contenido externo incrustado -->
  <EmbedRenderer
    v-else-if="element.type === 'embed'"
    :provider="embed.provider"
    :embed-url="embed.embedUrl"
    :title="embed.title"
    :ask-before-loading="embed.askBeforeLoading"
    :preview="preview"
  />

  <!-- Imagen con atribución Creative Commons -->
  <figure v-else-if="element.type === 'image'" class="relative h-full w-full">
    <img
      :src="media.fileUrl"
      :alt="media.altText"
      class="h-full w-full object-cover"
      draggable="false"
      loading="lazy"
    />
    <figcaption
      v-if="attribution"
      class="absolute inset-x-0 bottom-0 bg-white/85 px-2 py-1 text-[11px] leading-tight text-slate-700"
    >{{ attribution }}</figcaption>
  </figure>

  <!-- Audio: hotspot con color personalizable -->
  <div v-else-if="element.type === 'audio' && preview" class="h-full w-full">
    <div
      class="grid h-full w-full place-items-center rounded-full text-white shadow"
      :style="{ backgroundColor: media.hotspotColor }"
      aria-hidden="true"
    >
      <span class="text-3xl">▶</span>
    </div>
  </div>

  <div v-else-if="element.type === 'audio'" class="relative h-full w-full">
    <button
      type="button"
      class="grid h-full w-full place-items-center rounded-full text-white shadow-lg transition hover:brightness-110"
      :style="{ backgroundColor: media.hotspotColor }"
      :aria-label="audioPlaying ? 'Pausar audio' : 'Reproducir audio'"
      @pointerdown.stop
      @click.stop="toggleAudio"
    >
      <span class="text-3xl">{{ audioPlaying ? '⏸' : '▶' }}</span>
    </button>
    <audio ref="audioRef" :src="media.fileUrl" preload="none" @ended="audioPlaying = false" />
  </div>

  <!-- Video -->
  <div
    v-else-if="element.type === 'video' && preview"
    class="grid h-full w-full place-items-center rounded bg-black bg-cover bg-center"
    :style="media.posterUrl ? { backgroundImage: `url(${media.posterUrl})` } : undefined"
    aria-hidden="true"
  >
    <span class="text-2xl text-white/80">▶</span>
  </div>

  <video
    v-else-if="element.type === 'video'"
    :src="media.fileUrl"
    :poster="media.posterUrl"
    class="h-full w-full rounded bg-black object-cover"
    controls
    preload="metadata"
    @pointerdown.stop
  />

  <!-- Mapa OpenStreetMap -->
  <div
    v-else-if="element.type === 'map' && preview"
    class="grid h-full w-full place-items-center overflow-hidden rounded bg-emerald-50 text-center ring-1 ring-emerald-200"
    aria-hidden="true"
  >
    <div>
      <span class="text-2xl">🗺️</span>
      <p v-if="mapProps.label" class="px-1 text-[10px] font-semibold leading-tight text-emerald-800">
        {{ mapProps.label }}
      </p>
    </div>
  </div>

  <div v-else-if="element.type === 'map'" class="relative h-full w-full overflow-hidden rounded">
    <MapWidget
      :latitude="mapProps.latitude"
      :longitude="mapProps.longitude"
      :zoom="mapProps.zoom"
      :show-marker="mapProps.showMarker"
      :interactive="false"
    />
    <span
      v-if="mapProps.label"
      class="pointer-events-none absolute left-1 top-1 rounded bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700"
    >{{ mapProps.label }}</span>
  </div>

  <div v-else class="grid h-full w-full place-items-center rounded bg-slate-100 text-xs text-slate-500">
    {{ element.type }}
  </div>
</template>
