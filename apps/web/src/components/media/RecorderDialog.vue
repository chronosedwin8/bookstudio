<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';

const props = defineProps<{ mode: 'audio' | 'video' | 'photo' }>();

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

let stream: MediaStream | undefined;
let recorder: MediaRecorder | undefined;
let chunks: Blob[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let durationSeconds = 0;

const TITLES = { audio: 'Grabar voz', video: 'Grabar video', photo: 'Tomar una foto' } as const;

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
    stream = await navigator.mediaDevices.getUserMedia(
      props.mode === 'audio' ? { audio: true } : { video: { width: 1280, height: 720 }, audio: props.mode === 'video' },
    );
    streaming.value = true;
    if (preview.value && props.mode !== 'audio') {
      preview.value.srcObject = stream;
      await preview.value.play();
    }
  } catch (err) {
    error.value =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Permiso denegado. Habilita el microfono o la camara en el navegador.'
        : 'No se pudo acceder al dispositivo de captura.';
  }
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
  if (!video) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  resultDataUrl.value = canvas.toDataURL('image/png');
  resultUrl.value = resultDataUrl.value;
}

function reset(): void {
  if (resultUrl.value?.startsWith('blob:')) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = null;
  resultDataUrl.value = null;
  elapsed.value = 0;
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

        <div v-if="mode !== 'audio'" class="overflow-hidden rounded-lg bg-slate-900">
          <!-- La camara en vivo se oculta (no se desmonta) para conservar el srcObject al repetir. -->
          <video
            v-show="!resultUrl"
            ref="preview"
            class="aspect-video w-full object-cover"
            muted
            playsinline
          />
          <video
            v-if="resultUrl && mode === 'video'"
            :src="resultUrl"
            class="aspect-video w-full"
            controls
            playsinline
          />
          <img v-if="resultUrl && mode === 'photo'" :src="resultUrl" alt="Foto capturada" class="w-full" />
        </div>

        <div v-else class="grid h-28 place-items-center rounded-lg bg-slate-100">
          <p class="text-3xl font-black tabular-nums" :class="recording ? 'text-red-600' : 'text-slate-400'">
            {{ formatTime(elapsed) }}
          </p>
        </div>

        <audio v-if="resultUrl && mode === 'audio'" :src="resultUrl" controls class="w-full" />

        <div class="flex flex-wrap justify-center gap-2">
          <button v-if="!streaming" type="button" class="btn-primary" @click="startStream">
            Activar {{ mode === 'audio' ? 'microfono' : 'camara' }}
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
            <button type="button" class="btn-secondary" @click="reset">Repetir</button>
            <button type="button" class="btn-primary" @click="save">Insertar en la pagina</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
