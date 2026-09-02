<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';

const props = defineProps<{ mode: 'audio' | 'video' | 'photo' | 'screen' | 'clip' }>();

const emit = defineEmits<{
  close: [];
  save: [payload: { dataUrl: string; durationSeconds: number }];
}>();

const preview = ref<HTMLVideoElement | null>(null);
const error = ref<string | null>(null);
const recording = ref(false);
const elapsed = ref(0);
const resultUrl = ref<string | null>(null);
const resultDataUrl = ref<string | null>(null);
const streaming = ref(false);
/** Recorte de pantalla: seleccion en fracciones (0-1) de la imagen capturada. */
const seleccion = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const imagen = ref<HTMLImageElement | null>(null);
let arrastreDesde: { x: number; y: number } | null = null;

let stream: MediaStream | undefined;
let recorder: MediaRecorder | undefined;
let chunks: Blob[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let durationSeconds = 0;

const TITLES = {
  audio: 'Grabar voz',
  video: 'Grabar video',
  photo: 'Tomar una foto',
  screen: 'Grabar la pantalla',
  clip: 'Recortar la pantalla',
} as const;

/** Los dos modos que capturan pantalla en vez de camara o microfono. */
const esPantalla = computed(() => props.mode === 'screen' || props.mode === 'clip');
/** Modos que muestran imagen, en vivo o ya capturada. */
const conImagen = computed(() => props.mode !== 'audio');

/** El primer mime soportado por el navegador; Safari y Firefox difieren de Chrome. */
function pickMimeType(kind: 'audio' | 'video'): string {
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer la grabacion'));
    reader.readAsDataURL(blob);
  });
}

async function startStream(): Promise<void> {
  error.value = null;
  try {
    if (esPantalla.value) {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        error.value = 'Este navegador no permite capturar la pantalla.';
        return;
      }
      // El audio se pide, pero no todos los navegadores lo ofrecen; si falta, la
      // grabacion sigue siendo valida y solo queda sin sonido.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: props.mode === 'screen',
      });
      // Quien comparte puede cortar desde el aviso del propio navegador: si eso
      // ocurre a mitad de grabacion hay que cerrarla o el video queda a medias.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recording.value) stopRecording();
        streaming.value = false;
      });
    } else {
      stream = await navigator.mediaDevices.getUserMedia(
        props.mode === 'audio'
          ? { audio: true }
          : { video: { width: 1280, height: 720 }, audio: props.mode === 'video' },
      );
    }

    streaming.value = true;
    if (preview.value && conImagen.value) {
      preview.value.srcObject = stream;
      await preview.value.play();
    }

    /*
     * En el recorte se toma el fotograma nada mas empezar y se corta la captura.
     * Si se dejara la vista en vivo, quien comparte la propia pestana veria el
     * tunel de espejos y nunca acertaria el momento de capturar.
     */
    if (props.mode === 'clip') {
      await esperarFotograma();
      capturePhoto();
      stream.getTracks().forEach((track) => track.stop());
      streaming.value = false;
    }
  } catch (err) {
    error.value =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? esPantalla.value
          ? 'No se compartio ninguna pantalla.'
          : 'Permiso denegado. Habilita el microfono o la camara en el navegador.'
        : 'No se pudo acceder al dispositivo de captura.';
  }
}

/** Espera a que el video tenga pixeles; sin esto la captura sale en negro. */
function esperarFotograma(): Promise<void> {
  const video = preview.value;
  if (!video) return Promise.resolve();
  if (video.readyState >= 2 && video.videoWidth) {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => {
    const listo = () => requestAnimationFrame(() => resolve());
    video.addEventListener('loadeddata', listo, { once: true });
    setTimeout(listo, 1500);
  });
}

function startRecording(): void {
  if (!stream) return;
  const mimeType = pickMimeType(props.mode === 'audio' ? 'audio' : 'video');
  if (!mimeType) {
    error.value = 'Este navegador no soporta la grabacion en formatos abiertos.';
    return;
  }

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) {
      error.value = 'La grabacion quedo vacia. Intenta grabar durante al menos un segundo.';
      recording.value = false;
      return;
    }
    resultUrl.value = URL.createObjectURL(blob);
    resultDataUrl.value = await blobToDataUrl(blob);
  };

  // El timeslice fuerza chunks periodicos; sin el, grabaciones cortas pueden quedar vacias.
  recorder.start(250);
  recording.value = true;
  elapsed.value = 0;
  startedAt = Date.now();
  durationSeconds = 0;
  timer = setInterval(() => (elapsed.value += 1), 1000);
}

function stopRecording(): void {
  // La duracion real evita redondear a 0 s las grabaciones de menos de un segundo.
  durationSeconds = Math.round(((Date.now() - startedAt) / 1000) * 10) / 10;
  recorder?.stop();
  recording.value = false;
  clearInterval(timer);
}

function capturePhoto(): void {
  const video = preview.value;
  if (!video || !video.videoWidth) {
    error.value = 'No se pudo tomar la imagen. Intentalo de nuevo.';
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  origen = canvas;
  seleccion.value = null;
  resultDataUrl.value = canvas.toDataURL('image/png');
  resultUrl.value = resultDataUrl.value;
}

// --- Recorte de la captura ---

/** Fotograma completo; el recorte se calcula contra este, no contra la vista. */
let origen: HTMLCanvasElement | null = null;

/** Posicion del puntero dentro de la imagen, en fracciones de 0 a 1. */
function puntoEn(event: PointerEvent): { x: number; y: number } | null {
  const caja = imagen.value?.getBoundingClientRect();
  if (!caja || !caja.width || !caja.height) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - caja.left) / caja.width)),
    y: Math.min(1, Math.max(0, (event.clientY - caja.top) / caja.height)),
  };
}

function empezarSeleccion(event: PointerEvent): void {
  if (props.mode !== 'clip') return;
  const punto = puntoEn(event);
  if (!punto) return;
  arrastreDesde = punto;
  seleccion.value = { x: punto.x, y: punto.y, w: 0, h: 0 };
  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
}

function moverSeleccion(event: PointerEvent): void {
  if (!arrastreDesde) return;
  const punto = puntoEn(event);
  if (!punto) return;
  seleccion.value = {
    x: Math.min(arrastreDesde.x, punto.x),
    y: Math.min(arrastreDesde.y, punto.y),
    w: Math.abs(punto.x - arrastreDesde.x),
    h: Math.abs(punto.y - arrastreDesde.y),
  };
}

function terminarSeleccion(): void {
  arrastreDesde = null;
  // Un clic suelto no es un recorte: se descarta para no quedarse con una
  // seleccion de un pixel que produciria una imagen vacia.
  const sel = seleccion.value;
  if (sel && (sel.w < 0.02 || sel.h < 0.02)) seleccion.value = null;
}

/** Aplica la seleccion al fotograma original y deja el resultado listo. */
function aplicarRecorte(): void {
  const sel = seleccion.value;
  if (!origen || !sel) return;
  const x = Math.round(sel.x * origen.width);
  const y = Math.round(sel.y * origen.height);
  const ancho = Math.max(1, Math.round(sel.w * origen.width));
  const alto = Math.max(1, Math.round(sel.h * origen.height));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext('2d')?.drawImage(origen, x, y, ancho, alto, 0, 0, ancho, alto);
  origen = canvas;
  seleccion.value = null;
  resultDataUrl.value = canvas.toDataURL('image/png');
  resultUrl.value = resultDataUrl.value;
}

async function reset(): Promise<void> {
  if (resultUrl.value?.startsWith('blob:')) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = null;
  resultDataUrl.value = null;
  seleccion.value = null;
  origen = null;
  elapsed.value = 0;
  // La captura de pantalla se cierra tras cada toma, asi que repetir exige
  // volver a pedirla; sin esto el boton dejaria la ventana en blanco.
  if (esPantalla.value) {
    stream?.getTracks().forEach((track) => track.stop());
    streaming.value = false;
    await nextTick();
    if (props.mode === 'clip') await startStream();
  }
}

function save(): void {
  if (!resultDataUrl.value) return;
  emit('save', { dataUrl: resultDataUrl.value, durationSeconds: durationSeconds || elapsed.value });
}

function cleanup(): void {
  clearInterval(timer);
  recorder?.state === 'recording' && recorder.stop();
  stream?.getTracks().forEach((track) => track.stop());
  if (resultUrl.value?.startsWith('blob:')) URL.revokeObjectURL(resultUrl.value);
}

onBeforeUnmount(cleanup);

function close(): void {
  cleanup();
  emit('close');
}

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="close">
    <div class="card w-full max-w-lg overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 class="font-bold text-slate-900">{{ TITLES[mode] }}</h2>
        <button type="button" class="btn-secondary" @click="close">Cerrar</button>
      </header>

      <div class="space-y-4 p-5">
        <AlertMessage :message="error" />

        <div v-if="conImagen" class="relative overflow-hidden rounded-lg bg-slate-900">
          <!-- La camara en vivo se oculta (no se desmonta) para conservar el srcObject al repetir. -->
          <video
            v-show="!resultUrl"
            ref="preview"
            class="aspect-video w-full object-cover"
            muted
            playsinline
          />
          <video
            v-if="resultUrl && (mode === 'video' || mode === 'screen')"
            :src="resultUrl"
            class="aspect-video w-full"
            controls
            playsinline
          />

          <!-- Foto y recorte: sobre el recorte se arrastra para elegir la zona -->
          <div v-if="resultUrl && (mode === 'photo' || mode === 'clip')" class="relative select-none">
            <img
              ref="imagen"
              :src="resultUrl"
              alt="Imagen capturada"
              class="w-full"
              :class="mode === 'clip' ? 'cursor-crosshair' : ''"
              draggable="false"
              @pointerdown.prevent="empezarSeleccion"
              @pointermove="moverSeleccion"
              @pointerup="terminarSeleccion"
              @pointercancel="terminarSeleccion"
            />
            <div
              v-if="seleccion"
              class="pointer-events-none absolute border-2 border-brand-400 bg-brand-400/20"
              :style="{
                left: `${seleccion.x * 100}%`,
                top: `${seleccion.y * 100}%`,
                width: `${seleccion.w * 100}%`,
                height: `${seleccion.h * 100}%`,
              }"
            />
          </div>
        </div>

        <div v-else class="grid h-28 place-items-center rounded-lg bg-slate-100">
          <p class="text-3xl font-black tabular-nums" :class="recording ? 'text-red-600' : 'text-slate-400'">
            {{ formatTime(elapsed) }}
          </p>
        </div>

        <audio v-if="resultUrl && mode === 'audio'" :src="resultUrl" controls class="w-full" />

        <p v-if="mode === 'screen' && !resultUrl" class="text-center text-xs text-slate-500">
          Se guardan grabaciones de hasta 60 MB, unos cinco minutos. Elige compartir una
          ventana concreta si no quieres que se vea el resto del escritorio.
        </p>

        <p v-if="mode === 'clip' && resultUrl" class="text-center text-xs text-slate-500">
          Arrastra sobre la imagen para elegir la zona y pulsa «Recortar». Sin selección se
          inserta la pantalla completa.
        </p>

        <div class="flex flex-wrap justify-center gap-2">
          <button v-if="!streaming && !resultDataUrl" type="button" class="btn-primary" @click="startStream">
            {{
              mode === 'audio'
                ? 'Activar microfono'
                : esPantalla
                  ? 'Elegir qué pantalla compartir'
                  : 'Activar camara'
            }}
          </button>

          <template v-else-if="!resultDataUrl">
            <button v-if="mode === 'photo'" type="button" class="btn-primary" @click="capturePhoto">
              Tomar foto
            </button>
            <button v-else-if="!recording" type="button" class="btn-primary" @click="startRecording">
              Empezar a grabar
            </button>
            <button v-else type="button" class="btn-danger" @click="stopRecording">
              Detener ({{ formatTime(elapsed) }})
            </button>
          </template>

          <template v-else>
            <button
              v-if="mode === 'clip' && seleccion"
              type="button"
              class="btn-secondary"
              @click="aplicarRecorte"
            >Recortar</button>
            <button type="button" class="btn-secondary" @click="reset">Repetir</button>
            <button type="button" class="btn-primary" @click="save">Insertar en la página</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
