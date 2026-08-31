<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import DrawingToolbar from '@/components/canvas/DrawingToolbar.vue';
import ElementInspector from '@/components/canvas/ElementInspector.vue';
import FixedCanvas from '@/components/canvas/FixedCanvas.vue';
import ShapeRenderer from '@/components/canvas/ShapeRenderer.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import PagesPanel from '@/components/canvas/PagesPanel.vue';
import ShareDialog from '@/components/ShareDialog.vue';
import BookGradesPanel from '@/components/library/BookGradesPanel.vue';
import DistributeDialog from '@/components/library/DistributeDialog.vue';
import MapSearchDialog from '@/components/media/MapSearchDialog.vue';
import EmbedDialog from '@/components/media/EmbedDialog.vue';
import MediaSearchDialog from '@/components/media/MediaSearchDialog.vue';
import ChartTypeDialog from '@/components/media/ChartTypeDialog.vue';
import QuestionBlockDialog from '@/components/media/QuestionBlockDialog.vue';
import SoundLibraryDialog from '@/components/media/SoundLibraryDialog.vue';
import RecorderDialog from '@/components/media/RecorderDialog.vue';
import StickerDialog from '@/components/media/StickerDialog.vue';
import TemplateDialog from '@/components/media/TemplateDialog.vue';
import { booksApi, mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { useEditorStore } from '@/stores/editor';
import { usePreferencesStore } from '@/stores/preferences';
import type {
  CanvasElement,
  ChartType,
  DistributeResult,
  ElementType,
  MediaResult,
  TransformMatrix,
} from '@/types/api';
import { MIN_SCORE, recognize, type Candidate } from '@/utils/recognize';
import { downloadBookHtml } from '@/utils/exportBook';
import { PAPER_CATALOGUE, PAPER_GROUPS, paperStyle } from '@/utils/papers';
import { SHAPES, ratioOf, type ShapeName } from '@/utils/shapes';
import type { QuestionBlock } from '@/utils/questions';
import type { PageTemplate } from '@/utils/templates';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const editor = useEditorStore();
const preferences = usePreferencesStore();

const titleDraft = ref('');
const tool = ref<'select' | 'draw' | 'fill'>('select');
const onionSkin = ref(false);
const dialog = ref<
  'none' | 'image' | 'gif' | 'map' | 'audio' | 'video' | 'photo' | 'sticker' | 'embed' | 'question' | 'chart' | 'sound'
>('none');
const stickerTab = ref<'shapes' | 'icons' | 'emojis'>('shapes');

function openStickers(tab: 'shapes' | 'icons' | 'emojis'): void {
  stickerTab.value = tab;
  dialog.value = 'sticker';
}

/**
 * Alto en % que da a un elemento la proporcion pedida.
 *
 * El ancho va en % del ancho de pagina y el alto en % del alto, que no miden lo
 * mismo: sin corregir por la proporcion de la pagina, un cuadrado sale rectangular.
 */
function heightForRatio(widthPercent: number, ratio: number): number {
  const height = (widthPercent / ratio) * editor.aspectRatio;
  return Math.min(90, Math.max(3, Number(height.toFixed(1))));
}

async function onPickShape(shape: ShapeName): Promise<void> {
  dialog.value = 'none';
  const width = 34;
  await editor.addElement(
    'shape',
    { x: 20, y: 20, width, height: heightForRatio(width, ratioOf(shape)), angle: 0 },
    { shape, fillColor: '#59A1FF', strokeColor: preferences.strokeColor, strokeWidth: 2 },
  );
}

async function onPickIcon(icon: { name: string; paths: string[]; viewBox: string }): Promise<void> {
  dialog.value = 'none';
  await editor.addElement(
    'icon',
    { x: 30, y: 30, width: 18, height: heightForRatio(18, 1), angle: 0 },
    {
      source: 'library',
      name: icon.name,
      paths: icon.paths,
      viewBox: icon.viewBox,
      color: preferences.strokeColor,
      strokeWidth: 2,
      label: icon.name,
    },
  );
}

/** Formula nueva con un ejemplo dentro, para que no aparezca un hueco vacio. */
async function addMathElement(): Promise<void> {
  await editor.addElement(
    'math',
    { x: 22, y: 25, width: 40, height: heightForRatio(40, 2.6), angle: 0 },
    { latex: 'a^2 + b^2 = c^2', displayMode: true, color: '#1E293B', backgroundColor: 'transparent' },
  );
}

/** Sonido de la biblioteca: se inserta como hotspot de audio, igual que una grabacion. */
async function onPickSound(result: MediaResult, withAttribution: boolean): Promise<void> {
  dialog.value = 'none';
  await editor.addElement(
    'audio',
    { x: 20, y: 20, width: 12, height: heightForRatio(12, 1), angle: 0 },
    {
      fileUrl: result.url,
      durationSeconds: 0,
      hotspotColor: preferences.strokeColor,
      transcriptText: withAttribution ? result.attributionText : '',
    },
  );
}

/** Grafica nueva con datos de ejemplo, para que se vea algo desde el primer momento. */
async function onPickChart(chartType: ChartType): Promise<void> {
  dialog.value = 'none';
  await editor.addElement(
    'chart',
    { x: 14, y: 20, width: 58, height: heightForRatio(58, 1.5), angle: 0 },
    {
      chartType,
      title: 'Mi grafica',
      series: [
        { label: 'Lunes', value: 4, color: '#2563EB' },
        { label: 'Martes', value: 7, color: '#F59E0B' },
        { label: 'Miercoles', value: 3, color: '#16A34A' },
        { label: 'Jueves', value: 9, color: '#DB2777' },
      ],
      showValues: true,
      showLegend: true,
      accentColor: '#2563EB',
    },
  );
}

async function onPickQuestion(block: QuestionBlock): Promise<void> {
  dialog.value = 'none';
  await editor.addElement(
    'question',
    { x: 12, y: 16, width: block.size.width, height: block.size.height, angle: 0 },
    { ...block.properties },
  );
}

async function onPickEmbed(payload: {
  sourceUrl: string;
  title: string;
  askBeforeLoading: boolean;
}): Promise<void> {
  dialog.value = 'none';
  // El backend deriva provider y embedUrl del enlace: aqui solo se manda el original.
  await editor.addElement('embed', { x: 12, y: 18, width: 60, height: 40, angle: 0 }, payload);
}

async function onPickEmoji(char: string): Promise<void> {
  dialog.value = 'none';
  await editor.addElement(
    'icon',
    { x: 35, y: 30, width: 15, height: heightForRatio(15, 1), angle: 0 },
    { source: 'emoji', char, label: char },
  );
}
const uploading = ref(false);

const onionElements = computed<CanvasElement[]>(() => {
  if (!onionSkin.value || editor.currentPageIndex === 0) return [];
  return editor.book?.pages[editor.currentPageIndex - 1]?.elements ?? [];
});

const DEFAULT_TRANSFORM: TransformMatrix = { x: 20, y: 20, width: 40, height: 25, angle: 0 };

/** Solo los tipos que se insertan desde la barra lateral; el resto llega desde sus dialogos. */
const DEFAULT_PROPERTIES: Partial<Record<ElementType, Record<string, unknown>>> = {
  text: { text: 'Escribe aqui...' },
  shape: { shape: 'rectangle', fillColor: '#59A1FF', strokeColor: '#1549E1', strokeWidth: 2 },
};

async function addTextElement(): Promise<void> {
  await addElement('text', {
    fontFamily: preferences.fontFamily,
    fontSize: preferences.fontSize,
    color: preferences.textColor,
    backgroundColor: preferences.textBackground,
  });
}

async function onPickImage(result: MediaResult, withAttribution: boolean): Promise<void> {
  dialog.value = 'none';
  // Conserva la proporcion original de la imagen dentro de un ancho fijo del lienzo.
  const width = 45;
  const ratio = result.width && result.height ? result.height / result.width : 0.75;

  await editor.addElement(
    'image',
    { x: 15, y: 15, width, height: Math.min(width * ratio, 80), angle: 0 },
    {
      fileUrl: result.url,
      altText: result.title,
      attribution: withAttribution
        ? {
            author: result.creator,
            licence: result.licence,
            sourceUrl: result.sourceUrl ?? undefined,
            text: result.attributionText,
          }
        : undefined,
    },
  );
}

async function onPickMap(payload: {
  latitude: number;
  longitude: number;
  zoom: number;
  label: string;
}): Promise<void> {
  dialog.value = 'none';
  await editor.addElement('map', { x: 15, y: 15, width: 55, height: 40, angle: 0 }, { ...payload });
}

/** Sube el archivo y lo coloca en la pagina segun el tipo que devuelva el servidor. */
async function uploadAndInsert(dataUrl: string, durationSeconds: number, altText = ''): Promise<void> {
  uploading.value = true;
  try {
    const file = await mediaApi.upload(dataUrl);

    if (file.kind === 'audio') {
      await editor.addElement(
        'audio',
        { x: 20, y: 20, width: 12, height: 12, angle: 0 },
        { fileUrl: file.fileUrl, durationSeconds, hotspotColor: preferences.strokeColor },
      );
    } else if (file.kind === 'video') {
      await editor.addElement(
        'video',
        { x: 15, y: 15, width: 50, height: 30, angle: 0 },
        { fileUrl: file.fileUrl, durationSeconds },
      );
    } else {
      await editor.addElement(
        'image',
        { x: 15, y: 15, width: 45, height: 34, angle: 0 },
        { fileUrl: file.fileUrl, altText },
      );
    }
  } catch (err) {
    editor.error = errorMessage(err);
  } finally {
    uploading.value = false;
  }
}

async function onSaveRecording(payload: { dataUrl: string; durationSeconds: number }): Promise<void> {
  const mode = dialog.value;
  dialog.value = 'none';
  await uploadAndInsert(
    payload.dataUrl,
    payload.durationSeconds,
    mode === 'photo' ? 'Foto tomada con la camara' : '',
  );
}

// --- Subida desde el equipo ---

const ACCEPT = {
  image: 'image/png,image/jpeg,image/webp,image/gif',
  audio: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm',
} as const;

/** Debe coincidir con los limites de la API (GET /media/limits). */
const MAX_BYTES = { image: 8 * 1024 * 1024, audio: 20 * 1024 * 1024 } as const;

// --- Reordenar paginas arrastrando en la tira inferior ---

/** Indice de la pagina que se esta arrastrando; null si no hay arrastre en curso. */
const dragIndex = ref<number | null>(null);
/** Indice sobre el que se soltaria ahora mismo, para resaltarlo. */
const dropIndex = ref<number | null>(null);

function onPageDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index;
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  // Firefox no inicia el arrastre si no se escribe algo en dataTransfer.
  event.dataTransfer.setData('text/plain', String(index));
}

function onPageDragOver(index: number): void {
  if (dragIndex.value !== null) dropIndex.value = index;
}

function resetDrag(): void {
  dragIndex.value = null;
  dropIndex.value = null;
}

async function onPageDrop(index: number): Promise<void> {
  const from = dragIndex.value;
  resetDrag();
  if (from === null || from === index || !editor.book) return;

  const ids = editor.book.pages.map((page) => page.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(index, 0, moved);
  await editor.reorderPages(ids);
}

const showPages = ref(false);
const showShare = ref(false);
const showDistribute = ref(false);
const showGrades = ref(false);
const entregaAviso = ref<string | null>(null);

function onDistributed(resultado: DistributeResult): void {
  showDistribute.value = false;
  entregaAviso.value = `Entregado a ${resultado.delivered} alumnos · ${resultado.pages} páginas copiadas`;
  setTimeout(() => (entregaAviso.value = null), 6000);
}
const showTemplates = ref(false);
const showExport = ref(false);

/** Descarga el libro como pagina web autonoma. */
function exportHtml(): void {
  showExport.value = false;
  if (editor.book) downloadBookHtml(editor.book);
}

/**
 * PDF a traves del dialogo de impresion del navegador: sin dependencias ni
 * servicios, y con "Guardar como PDF" disponible en todos los sistemas.
 */
function exportPdf(): void {
  showExport.value = false;
  window.open(router.resolve({ name: 'book-print', params: { id: route.params.id } }).href, '_blank');
}

async function onPickTemplate(template: PageTemplate): Promise<void> {
  showTemplates.value = false;
  await editor.addPageFromTemplate(template);
}

async function onRemovePage(pageId: string): Promise<void> {
  if (!window.confirm('Eliminar esta pagina y todo su contenido?')) return;
  await editor.deletePage(pageId);
}

const fileInput = ref<HTMLInputElement | null>(null);
const fileKind = ref<keyof typeof ACCEPT>('image');

function pickFromComputer(kind: keyof typeof ACCEPT): void {
  fileKind.value = kind;
  fileInput.value?.click();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/** Duracion real del audio para que el hotspot la muestre; 0 si el navegador no la sabe. */
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Se limpia siempre para poder volver a elegir el mismo archivo.
  input.value = '';
  if (!file) return;

  const kind = fileKind.value;
  const limit = MAX_BYTES[kind];
  if (file.size > limit) {
    editor.error = `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el limite es ${limit / 1024 / 1024} MB.`;
    return;
  }
  if (!ACCEPT[kind].split(',').includes(file.type)) {
    editor.error = `Formato no admitido: ${file.type || 'desconocido'}.`;
    return;
  }

  editor.error = null;
  const duration = kind === 'audio' ? await readAudioDuration(file) : 0;
  await uploadAndInsert(await readAsDataUrl(file), duration, kind === 'image' ? file.name : '');
}

type InspectorPatch = { properties?: Record<string, unknown>; isLocked?: boolean; opacity?: number };

/** Memoriza los ajustes tipograficos para que el siguiente texto los herede. */
async function onInspectorPatch(payload: InspectorPatch): Promise<void> {
  if (!editor.selectedElementId) return;

  const props = payload.properties;
  if (props && editor.selectedElement?.type === 'text') {
    if (typeof props.fontFamily === 'string') preferences.fontFamily = props.fontFamily as never;
    if (typeof props.fontSize === 'number') preferences.fontSize = props.fontSize;
    if (typeof props.color === 'string') preferences.textColor = props.color;
    if (typeof props.backgroundColor === 'string') preferences.textBackground = props.backgroundColor;
  }

  await editor.patchElement(editor.selectedElementId, payload);
}

async function onUpdateText(id: string, value: string): Promise<void> {
  const element = editor.sortedElements.find((el) => el.id === id);
  if (!element || element.properties.text === value) return;
  await editor.patchElement(id, { properties: { ...element.properties, text: value } });
}

// --- Autoforma: convierte un trazo a mano alzada en una forma limpia ---

interface Suggestion {
  elementId: string;
  transform: TransformMatrix;
  candidates: Candidate[];
}

const autoShape = ref(true);
const suggestion = ref<Suggestion | null>(null);

async function onStroke(payload: {
  points: Array<{ x: number; y: number }>;
  transform: TransformMatrix;
  properties: Record<string, unknown>;
}): Promise<void> {
  const element = await editor.addElement('drawing', payload.transform, payload.properties);
  editor.select(null);
  if (!autoShape.value || !element) return;

  // Todo el reconocimiento ocurre en el navegador: el trazo no sale del equipo.
  const candidates = recognize(payload.points).filter((c) => c.score >= MIN_SCORE);
  suggestion.value = candidates.length
    ? { elementId: element.id, transform: payload.transform, candidates }
    : null;
}

/** Sustituye el trazo por la forma limpia, conservando su posicion y tamano. */
async function applySuggestedShape(candidate: Candidate): Promise<void> {
  const current = suggestion.value;
  suggestion.value = null;
  if (!current) return;

  await editor.removeElement(current.elementId);
  await editor.addElement('shape', current.transform, {
    shape: candidate.shape,
    fillColor: 'transparent',
    strokeColor: preferences.strokeColor,
    strokeWidth: Math.max(1, Math.round(preferences.strokeWidth / 2)),
  });
}

/** Sustituye el trazo por un icono de la biblioteca. */
async function applySuggestedIcon(name: string): Promise<void> {
  const current = suggestion.value;
  suggestion.value = null;
  if (!current) return;

  const data = (await import('@/assets/icons.json')).default as {
    viewBox: string;
    iconos: Array<{ n: string; p: string[] }>;
  };
  const icon = data.iconos.find((i) => i.n === name);
  if (!icon) return;

  await editor.removeElement(current.elementId);
  // El icono se encaja en un cuadrado para no deformar su trazo.
  const side = Math.max(current.transform.width, current.transform.height);
  await editor.addElement(
    'icon',
    { ...current.transform, width: side, height: heightForRatio(side, 1) },
    {
      source: 'library',
      name,
      paths: icon.p,
      viewBox: data.viewBox,
      color: preferences.strokeColor,
      strokeWidth: 2,
      label: name,
    },
  );
}

/**
 * Bote de pintura: recorre las capas de arriba hacia abajo y rellena la primera forma
 * cuyo area contiene el punto; si no hay ninguna, pinta el fondo de la pagina.
 */
async function onFill(point: { x: number; y: number }): Promise<void> {
  const target = [...editor.sortedElements].reverse().find((el) => {
    if (el.type !== 'shape' || el.isLocked) return false;
    const t = el.transformMatrix;
    return point.x >= t.x && point.x <= t.x + t.width && point.y >= t.y && point.y <= t.y + t.height;
  });

  if (target) {
    await editor.patchElement(target.id, {
      properties: { ...target.properties, fillColor: preferences.strokeColor },
    });
  } else {
    await editor.setPageBackground(preferences.strokeColor);
  }
}

// Se desplaza cada elemento nuevo para que no queden apilados exactamente.
let insertOffset = 0;

async function addElement(type: ElementType, extra: Record<string, unknown> = {}): Promise<void> {
  const offset = (insertOffset % 5) * 4;
  insertOffset += 1;
  await editor.addElement(
    type,
    { ...DEFAULT_TRANSFORM, x: DEFAULT_TRANSFORM.x + offset, y: DEFAULT_TRANSFORM.y + offset },
    { ...DEFAULT_PROPERTIES[type], ...extra },
  );
}

/** Accesos rapidos; el resto del catalogo vive en el dialogo de formas. */
const QUICK_SHAPES: ShapeName[] = ['rectangle', 'ellipse', 'triangle', 'star', 'arrow', 'speech-bubble'];

const PAGE_COLORS = ['#FFFFFF', '#F7F4EC', '#EDF2F0', '#FFF7ED', '#F1F5F9', '#1E293B'] as const;

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if (!editor.selectedElementId || !editor.canEdit) return;

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    // Borra toda la seleccion, no solo el elemento principal.
    void editor.removeSelection();
  } else if (event.key === 'Escape') {
    editor.select(null);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    editor.selectMany(editor.sortedElements.map((element) => element.id));
  } else if (event.key.startsWith('Arrow')) {
    // Flechas: mueven la seleccion; con Shift, a pasos grandes.
    const step = event.shiftKey ? 5 : 1;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    void editor.moveSelection(delta[0], delta[1]);
  }
}

/**
 * Bitacora: se avisa al abrir y luego cada minuto.
 *
 * El servidor alarga la sesion en curso en vez de guardar un evento por aviso, y la
 * corta sola tras unos minutos de silencio. Por eso no hace falta avisar al cerrar:
 * si el navegador se duerme o se cierra la pestana, el tiempo deja de contar solo.
 *
 * Solo se registra en libros de una biblioteca: los personales no llevan bitacora.
 */
const LATIDO_MS = 60_000;
let latido: ReturnType<typeof setInterval> | undefined;

async function avisarActividad(): Promise<void> {
  const libro = editor.book;
  if (!libro?.libraryId) return;
  try {
    await booksApi.touchActivity(libro.id);
  } catch {
    // Un aviso perdido no interrumpe el trabajo: el siguiente lo arregla.
  }
}

onMounted(async () => {
  await editor.load(route.params.id as string);
  titleDraft.value = editor.book?.title ?? '';
  window.addEventListener('keydown', onKeydown);

  if (editor.book?.libraryId) {
    void avisarActividad();
    latido = setInterval(() => void avisarActividad(), LATIDO_MS);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearInterval(latido);
});

async function saveTitle(): Promise<void> {
  if (titleDraft.value.trim() && titleDraft.value !== editor.book?.title) {
    await editor.renameBook(titleDraft.value.trim());
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <p v-if="editor.loading" class="p-8 text-sm text-slate-500">Cargando editor...</p>

    <template v-else-if="editor.book">
      <!-- Barra superior -->
      <header class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <!-- Un libro personal no tiene biblioteca a la que volver. -->
        <RouterLink
          :to="editor.book.libraryId
            ? { name: 'library', params: { id: editor.book.libraryId } }
            : { name: 'dashboard' }"
          class="text-sm text-brand-600 hover:underline"
        >&larr; {{ editor.book.libraryId ? 'Biblioteca' : 'Mis libros' }}</RouterLink>

        <input
          v-model.trim="titleDraft"
          type="text"
          class="input max-w-xs font-semibold"
          :disabled="!editor.canEdit"
          @blur="saveTitle"
          @keyup.enter="saveTitle"
        />

        <span class="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
          {{ editor.book.layoutFormat }}
        </span>

        <button v-if="editor.canEdit" type="button" class="btn-secondary" @click="showTemplates = true">
          Plantillas
        </button>

        <button type="button" class="btn-secondary" @click="showPages = true">Páginas</button>

        <button
          v-if="editor.canEdit"
          type="button"
          class="btn-secondary"
          @click="showShare = true"
        >
          Compartir
          <span
            v-if="editor.book.shareVisibility && editor.book.shareVisibility !== 'private'"
            class="rounded bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-700"
          >{{ editor.book.shareVisibility === 'public' ? 'público' : 'clase' }}</span>
        </button>

        <!-- Valoraciones: el docente las pone, el alumno las lee -->
        <button
          v-if="editor.book.libraryId"
          type="button"
          class="btn-secondary"
          @click="showGrades = true"
        >
          {{ editor.isManager ? 'Valorar' : 'Mis notas' }}
        </button>

        <!-- Entregar: solo tiene sentido con biblioteca y para quien la dirige -->
        <button
          v-if="editor.book.libraryId && editor.isManager"
          type="button"
          class="btn-secondary"
          @click="showDistribute = true"
        >
          Entregar
        </button>

        <RouterLink :to="{ name: 'book-reader', params: { id: editor.book.id } }" class="btn-secondary">
          Leer
        </RouterLink>

        <div class="relative">
          <button type="button" class="btn-secondary" @click="showExport = !showExport">Exportar</button>
          <div
            v-if="showExport"
            class="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              @click="exportHtml"
            >
              Página web (.html)
              <span class="block text-xs text-slate-500">Un solo archivo, se abre sin BookStudio</span>
            </button>
            <button
              type="button"
              class="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
              @click="exportPdf"
            >
              PDF
              <span class="block text-xs text-slate-500">Abre la vista de impresion</span>
            </button>
          </div>
        </div>

        <span v-if="uploading" class="text-xs text-brand-600">Subiendo archivo...</span>
        <span v-else-if="editor.saving" class="text-xs text-slate-400">Guardando...</span>
        <span v-else-if="!editor.canEdit" class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
          Solo lectura
        </span>
      </header>

      <div class="px-4 pt-2">
        <AlertMessage :message="editor.error" />
        <AlertMessage :message="entregaAviso" variant="success" />
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Herramientas -->
        <aside v-if="editor.canEdit" class="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-3">
          <DrawingToolbar v-model:tool="tool" v-model:onion-skin="onionSkin" />

          <label v-if="tool === 'draw'" class="flex items-center gap-2 text-xs text-slate-600">
            <input v-model="autoShape" type="checkbox" class="h-3.5 w-3.5 rounded" />
            Autoforma
          </label>

          <section class="space-y-1.5">
            <h3 class="label">Insertar</h3>
            <button type="button" class="btn-secondary w-full justify-start" @click="addTextElement">
              <span class="text-base">T</span> Texto
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'image'">
              🖼️ Imagen libre
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'gif'">
              🎞️ GIF animado
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'map'">
              🗺️ Mapa
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'embed'">
              ⧉ Incrustar
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'question'">
              ❓ Pregunta
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'chart'">
              📊 Gráfica
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="addMathElement">
              ∑ Formula
            </button>
          </section>

          <details class="space-y-1.5">
            <summary class="section-toggle">Desde mi equipo</summary>
            <button type="button" class="btn-secondary w-full justify-start" @click="pickFromComputer('image')">
              📁 Imagen
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="pickFromComputer('audio')">
              🎵 Audio
            </button>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              :accept="ACCEPT[fileKind]"
              @change="onFileChosen"
            />
            <p class="text-[11px] leading-tight text-slate-400">
              Imagenes hasta 8 MB (PNG, JPG, WEBP, GIF) y audios hasta 20 MB (MP3, M4A, OGG, WAV).
            </p>
          </details>

          <details class="space-y-1.5">
            <summary class="section-toggle">Grabar</summary>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'audio'">
              🎤 Voz
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'sound'">
              🔊 Biblioteca de sonidos
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'photo'">
              📷 Foto
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="dialog = 'video'">
              🎬 Video
            </button>
          </details>

          <section>
            <h3 class="label">Formas</h3>
            <div class="grid grid-cols-3 gap-1.5">
              <button
                v-for="name in QUICK_SHAPES"
                :key="name"
                type="button"
                class="grid aspect-square place-items-center rounded-lg border border-slate-300 bg-white p-1.5 transition hover:border-brand-400 hover:bg-brand-50"
                :title="SHAPES[name].label"
                :aria-label="SHAPES[name].label"
                @click="onPickShape(name)"
              >
                <ShapeRenderer :shape="name" fill-color="#93C5FD" stroke-color="#1D4ED8" :stroke-width="2" />
              </button>
            </div>
            <button type="button" class="btn-secondary mt-1.5 w-full justify-start" @click="openStickers('shapes')">
              ⬡ Más formas
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="openStickers('icons')">
              ✦ Iconos
            </button>
            <button type="button" class="btn-secondary w-full justify-start" @click="openStickers('emojis')">
              😀 Emojis
            </button>
          </section>

          <section>
            <h3 class="label">Tipo de hoja</h3>
            <details>
              <summary class="section-toggle">
                {{ editor.currentPage?.backgroundPattern
                  ? PAPER_CATALOGUE[editor.currentPage.backgroundPattern as keyof typeof PAPER_CATALOGUE]?.label ?? 'Personalizado'
                  : 'Hoja lisa' }}
              </summary>

              <div class="mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-slate-200 px-2 py-2">
                <button
                  type="button"
                  class="mb-2 w-full rounded border border-slate-300 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                  @click="editor.setPagePattern(null)"
                >Sin patron</button>

                <div v-for="group in PAPER_GROUPS" :key="group.label" class="mb-2">
                  <p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{{ group.label }}</p>
                  <div class="grid grid-cols-3 gap-1">
                    <button
                      v-for="name in group.papers"
                      :key="name"
                      type="button"
                      class="h-10 rounded border-2 bg-white transition hover:border-brand-400"
                      :class="editor.currentPage?.backgroundPattern === name ? 'border-brand-600' : 'border-slate-200'"
                      :style="paperStyle(name)"
                      :title="PAPER_CATALOGUE[name].label"
                      :aria-label="PAPER_CATALOGUE[name].label"
                      @click="editor.setPagePattern(name)"
                    />
                  </div>
                </div>
              </div>
            </details>
          </section>

          <section>
            <h3 class="label">Fondo de página</h3>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="color in PAGE_COLORS"
                :key="color"
                type="button"
                class="h-7 w-7 rounded border-2"
                :class="editor.currentPage?.backgroundColor === color ? 'border-brand-600' : 'border-slate-300'"
                :style="{ backgroundColor: color }"
                :title="color"
                @click="editor.setPageBackground(color)"
              />
            </div>
          </section>

        </aside>

        <!-- Lienzo -->
        <div class="flex min-w-0 flex-1 flex-col bg-slate-200">
          <div class="relative min-h-0 flex-1">
            <!-- Autoforma: propuesta tras reconocer el trazo, siempre descartable -->
            <div
              v-if="suggestion"
              class="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4"
            >
              <div
                class="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 shadow-xl backdrop-blur"
              >
                <span class="text-xs font-semibold text-slate-600">Convertir en</span>

                <button
                  v-for="candidate in suggestion.candidates"
                  :key="candidate.shape"
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:bg-brand-50"
                  @click="applySuggestedShape(candidate)"
                >
                  <span class="h-5 w-5">
                    <ShapeRenderer
                      :shape="candidate.shape"
                      fill-color="transparent"
                      stroke-color="#334155"
                      :stroke-width="2"
                    />
                  </span>
                  {{ candidate.label }}
                </button>

                <span class="text-xs text-slate-400">o icono</span>

                <button
                  v-for="name in suggestion.candidates[0].icons.slice(0, 3)"
                  :key="name"
                  type="button"
                  class="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:bg-brand-50"
                  :title="name"
                  @click="applySuggestedIcon(name)"
                >{{ name }}</button>

                <button
                  type="button"
                  class="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  @click="suggestion = null"
                >Dejar mi trazo</button>
              </div>
            </div>

            <FixedCanvas
              v-if="editor.currentPage"
              :page="editor.currentPage"
              :elements="editor.sortedElements"
              :aspect-ratio="editor.aspectRatio"
              :selected-id="editor.selectedElementId"
              :editable="editor.canEdit"
              :tool="tool"
              :onion-elements="onionElements"
              :selected-ids="editor.selectedIds"
              @select="(id, additive) => editor.select(id, additive)"
              @select-many="editor.selectMany($event)"
              @select-only="editor.selectMany([$event])"
              @move-selection="(dx, dy) => editor.moveSelection(dx, dy)"
              @commit="(id, t) => editor.patchElement(id, { transformMatrix: t })"
              @update-text="onUpdateText"
              @stroke="onStroke"
              @fill="onFill"
            />
          </div>

          <!-- Navegacion de páginas: miniatura real y reordenacion arrastrando -->
          <nav
            class="flex items-center gap-2 overflow-x-auto border-t border-slate-300 bg-white px-3 py-2"
            @dragover.prevent
            @drop.prevent="resetDrag"
          >
            <button
              v-for="(page, index) in editor.book.pages"
              :key="page.id"
              type="button"
              class="relative shrink-0 overflow-hidden rounded border-2 bg-white transition"
              :class="[
                index === editor.currentPageIndex ? 'border-brand-600' : 'border-slate-300 hover:border-slate-400',
                dropIndex === index && dragIndex !== index && 'ring-2 ring-brand-400 ring-offset-1',
                dragIndex === index && 'opacity-40',
                editor.canEdit && 'cursor-grab active:cursor-grabbing',
              ]"
              :title="index === 0 ? 'Portada' : `Página ${page.pageNumber}`"
              :draggable="editor.canEdit"
              @click="editor.goToPage(index)"
              @dragstart="onPageDragStart(index, $event)"
              @dragover.prevent="onPageDragOver(index)"
              @dragleave="dropIndex === index && (dropIndex = null)"
              @drop.prevent="onPageDrop(index)"
              @dragend="resetDrag"
            >
              <div class="overflow-hidden" :style="{ width: '58px', aspectRatio: `${editor.aspectRatio}` }">
                <PagePreview
                  :background-color="page.backgroundColor"
                  :background-pattern="page.backgroundPattern"
                  :elements="page.elements"
                  :aspect-ratio="editor.aspectRatio"
                  :width="58"
                />
              </div>
              <span
                class="absolute bottom-0 right-0 rounded-tl bg-slate-900/70 px-1 text-[10px] font-bold text-white"
              >{{ index === 0 ? '★' : page.pageNumber }}</span>
            </button>

            <button
              v-if="editor.canEdit"
              type="button"
              class="grid h-11 w-11 shrink-0 place-items-center rounded border-2 border-dashed border-slate-300 text-xl text-slate-400 hover:border-brand-500 hover:text-brand-600"
              title="Nueva página"
              aria-label="Nueva página"
              @click="editor.addPage()"
            >+</button>

            <span
              v-if="auth.isTrial"
              class="ml-2 shrink-0 rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800"
            >Prueba: hasta 2 páginas</span>
            <span v-else-if="editor.canEdit" class="ml-2 shrink-0 text-[11px] text-slate-400">
              Arrastra las páginas para reordenarlas
            </span>
          </nav>
        </div>

        <!-- Inspector -->
        <ElementInspector
          :element="editor.selectedElement"
          :is-manager="editor.isManager"
          @patch="onInspectorPatch"
          @move="editor.selectedElementId && editor.moveLayer(editor.selectedElementId, $event)"
          @remove="editor.selectedElementId && editor.removeElement(editor.selectedElementId)"
        />
      </div>
    </template>

    <AlertMessage v-else :message="editor.error" />

    <TemplateDialog
      v-if="showTemplates"
      :aspect-ratio="editor.aspectRatio"
      :busy="editor.saving"
      @close="showTemplates = false"
      @pick="onPickTemplate"
    />

    <ShareDialog
      v-if="showShare && editor.book"
      :book-id="editor.book.id"
      :title="editor.book.title"
      :visibility="editor.book.shareVisibility ?? 'private'"
      :token="editor.book.shareToken ?? null"
      :has-library="Boolean(editor.book.libraryId)"
      :collaborative="editor.book.collaborative ?? false"
      @close="showShare = false"
      @changed="editor.applyShareState($event)"
      @collaborative="editor.setCollaborative($event)"
    />

    <BookGradesPanel
      v-if="showGrades && editor.book"
      :book-id="editor.book.id"
      :book-title="editor.book.title"
      :can-grade="editor.isManager"
      @close="showGrades = false"
    />

    <DistributeDialog
      v-if="showDistribute && editor.book?.libraryId"
      :library-id="editor.book.libraryId"
      library-name="esta biblioteca"
      :source-book-id="editor.book.id"
      :source-title="editor.book.title"
      :pages="editor.book.pages"
      :current-page-id="editor.currentPage?.id"
      @close="showDistribute = false"
      @done="onDistributed"
    />

    <PagesPanel
      v-if="showPages && editor.book"
      :pages="editor.book.pages"
      :current-index="editor.currentPageIndex"
      :aspect-ratio="editor.aspectRatio"
      :editable="editor.canEdit"
      :busy="editor.saving"
      @close="showPages = false"
      @go-to="editor.goToPage($event); showPages = false"
      @add="editor.addPage()"
      @remove="onRemovePage"
      @duplicate="editor.duplicatePage($event)"
      @reorder="editor.reorderPages($event)"
    />

    <StickerDialog
      v-if="dialog === 'sticker'"
      :tab="stickerTab"
      @close="dialog = 'none'"
      @pick-shape="onPickShape"
      @pick-icon="onPickIcon"
      @pick-emoji="onPickEmoji"
    />

    <SoundLibraryDialog v-if="dialog === 'sound'" @close="dialog = 'none'" @pick="onPickSound" />

    <ChartTypeDialog v-if="dialog === 'chart'" @close="dialog = 'none'" @pick="onPickChart" />

    <QuestionBlockDialog v-if="dialog === 'question'" @close="dialog = 'none'" @pick="onPickQuestion" />

    <EmbedDialog v-if="dialog === 'embed'" @close="dialog = 'none'" @pick="onPickEmbed" />

    <MediaSearchDialog
      v-if="dialog === 'image' || dialog === 'gif'"
      :animated="dialog === 'gif'"
      @close="dialog = 'none'"
      @pick="onPickImage"
    />
    <MapSearchDialog v-else-if="dialog === 'map'" @close="dialog = 'none'" @pick="onPickMap" />
    <RecorderDialog
      v-else-if="dialog === 'audio' || dialog === 'video' || dialog === 'photo'"
      :mode="dialog"
      @close="dialog = 'none'"
      @save="onSaveRecording"
    />
  </div>
</template>
