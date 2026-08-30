<script setup lang="ts">
import { computed, ref } from 'vue';
import { mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { QUESTION_KIND_LABELS, nextOptionId } from '@/utils/questions';
import type { QuestionKind, QuestionOption, QuestionProperties } from '@/types/api';

const props = defineProps<{ question: QuestionProperties }>();

const emit = defineEmits<{ patch: [properties: Record<string, unknown>] }>();

const uploading = ref(false);
const error = ref<string | null>(null);
/** Indice de la opcion cuya imagen se esta eligiendo; -1 es la del enunciado. */
const imageTarget = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const options = computed(() => props.question.options ?? []);

function update(changes: Partial<QuestionProperties>): void {
  emit('patch', { ...props.question, ...changes });
}

function updateOption(index: number, changes: Partial<QuestionOption>): void {
  const next = options.value.map((option, i) => (i === index ? { ...option, ...changes } : option));
  update({ options: next });
}

/** En las de respuesta unica marcar una desmarca el resto. */
function setCorrect(index: number, value: boolean): void {
  if (props.question.kind !== 'single') {
    updateOption(index, { correct: value });
    return;
  }
  update({ options: options.value.map((option, i) => ({ ...option, correct: i === index })) });
}

function addOption(): void {
  if (options.value.length >= 8) return;
  const id = nextOptionId(options.value.map((option) => option.id));
  update({ options: [...options.value, { id, text: 'Opcion nueva', correct: false }] });
}

function removeOption(index: number): void {
  if (options.value.length <= 2) return;
  const next = options.value.filter((_, i) => i !== index);
  // Una pregunta de respuesta unica no puede quedarse sin solucion.
  if (props.question.kind === 'single' && !next.some((option) => option.correct)) {
    next[0] = { ...next[0], correct: true };
  }
  update({ options: next });
}

function moveOption(index: number, step: number): void {
  const target = index + step;
  if (target < 0 || target >= options.value.length) return;
  const next = [...options.value];
  [next[index], next[target]] = [next[target], next[index]];
  update({ options: next });
}

/** Cambiar de tipo puede dejar la pregunta sin una solucion valida; se corrige aqui. */
function setKind(kind: QuestionKind): void {
  let next = options.value;
  if (kind === 'single') {
    const first = next.findIndex((option) => option.correct);
    next = next.map((option, i) => ({ ...option, correct: i === (first >= 0 ? first : 0) }));
  } else if (kind === 'multiple' && !next.some((option) => option.correct)) {
    next = next.map((option, i) => ({ ...option, correct: i === 0 }));
  }
  update({ kind, options: next });
}

function pickImage(target: number): void {
  imageTarget.value = target;
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

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const target = imageTarget.value;
  imageTarget.value = null;
  if (!file || target === null) return;

  if (file.size > MAX_IMAGE_BYTES) {
    error.value = `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el limite es 8 MB.`;
    return;
  }

  uploading.value = true;
  error.value = null;
  try {
    const stored = await mediaApi.upload(await readAsDataUrl(file));
    if (target < 0) update({ promptImageUrl: stored.fileUrl });
    else updateOption(target, { imageUrl: stored.fileUrl });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    uploading.value = false;
  }
}

const ACCENTS = ['#7C3AED', '#0EA5E9', '#16A34A', '#EA580C', '#DB2777', '#334155'] as const;
</script>

<template>
  <div class="space-y-3">
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <p v-if="uploading" class="text-xs text-brand-600">Subiendo imagen...</p>

    <div>
      <label class="label">Tipo de pregunta</label>
      <select
        class="input"
        :value="question.kind"
        @change="setKind(($event.target as HTMLSelectElement).value as QuestionKind)"
      >
        <option v-for="(label, kind) in QUESTION_KIND_LABELS" :key="kind" :value="kind">{{ label }}</option>
      </select>
      <p v-if="question.kind === 'order'" class="mt-1 text-[11px] leading-tight text-slate-500">
        El orden de esta lista es la solucion. Al alumno le llegan barajadas.
      </p>
    </div>

    <div>
      <label class="label" for="question-prompt">Enunciado</label>
      <textarea
        id="question-prompt"
        class="input min-h-[4rem] resize-y"
        :value="question.prompt"
        @change="update({ prompt: ($event.target as HTMLTextAreaElement).value })"
      />
      <div class="mt-1 flex items-center gap-2">
        <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pickImage(-1)">
          {{ question.promptImageUrl ? 'Cambiar imagen' : 'Añadir imagen' }}
        </button>
        <button
          v-if="question.promptImageUrl"
          type="button"
          class="text-xs text-red-600 hover:underline"
          @click="update({ promptImageUrl: undefined })"
        >Quitar</button>
      </div>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <label class="label mb-0">Opciones ({{ options.length }}/8)</label>
        <button
          type="button"
          class="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40"
          :disabled="options.length >= 8"
          @click="addOption"
        >+ Añadir</button>
      </div>

      <ul class="space-y-2">
        <li v-for="(option, index) in options" :key="option.id" class="rounded-lg border border-slate-200 p-2">
          <div class="flex items-start gap-2">
            <!-- En las de ordenar no hay opcion correcta: lo es la posicion -->
            <input
              v-if="question.kind !== 'order'"
              type="checkbox"
              class="mt-1.5 h-4 w-4 shrink-0"
              :class="question.kind === 'single' ? 'rounded-full' : 'rounded'"
              :checked="option.correct === true"
              :title="option.correct ? 'Respuesta correcta' : 'Marcar como correcta'"
              @change="setCorrect(index, ($event.target as HTMLInputElement).checked)"
            />
            <span
              v-else
              class="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600"
            >{{ index + 1 }}</span>

            <input
              type="text"
              class="input py-1 text-sm"
              :value="option.text"
              @change="updateOption(index, { text: ($event.target as HTMLInputElement).value })"
            />
          </div>

          <div class="mt-1.5 flex items-center gap-2 pl-6">
            <img v-if="option.imageUrl" :src="option.imageUrl" alt="" class="h-8 w-8 rounded object-cover" />
            <button type="button" class="text-[11px] text-slate-500 hover:underline" @click="pickImage(index)">
              {{ option.imageUrl ? 'Cambiar' : 'Imagen' }}
            </button>
            <button
              v-if="option.imageUrl"
              type="button"
              class="text-[11px] text-red-600 hover:underline"
              @click="updateOption(index, { imageUrl: undefined })"
            >Quitar</button>

            <span class="ml-auto flex items-center gap-1">
              <button
                type="button"
                class="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                :disabled="index === 0"
                aria-label="Subir"
                @click="moveOption(index, -1)"
              >▲</button>
              <button
                type="button"
                class="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                :disabled="index === options.length - 1"
                aria-label="Bajar"
                @click="moveOption(index, 1)"
              >▼</button>
              <button
                type="button"
                class="px-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30"
                :disabled="options.length <= 2"
                aria-label="Eliminar opcion"
                @click="removeOption(index)"
              >×</button>
            </span>
          </div>
        </li>
      </ul>
    </div>

    <div>
      <label class="label" for="feedback-ok">Mensaje al acertar</label>
      <input
        id="feedback-ok"
        type="text"
        class="input"
        :value="question.feedbackCorrect"
        @change="update({ feedbackCorrect: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <div>
      <label class="label" for="feedback-ko">Mensaje al fallar</label>
      <input
        id="feedback-ko"
        type="text"
        class="input"
        :value="question.feedbackWrong"
        @change="update({ feedbackWrong: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <div>
      <label class="label">Color</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="color in ACCENTS"
          :key="color"
          type="button"
          class="h-7 w-7 rounded border-2"
          :class="question.accentColor === color ? 'border-slate-800' : 'border-slate-300'"
          :style="{ backgroundColor: color }"
          :title="color"
          @click="update({ accentColor: color })"
        />
      </div>
    </div>

    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        class="h-4 w-4 rounded"
        :checked="question.allowRetry"
        @change="update({ allowRetry: ($event.target as HTMLInputElement).checked })"
      />
      Permitir volver a intentarlo
    </label>

    <input ref="fileInput" type="file" class="hidden" :accept="ACCEPT" @change="onFileChosen" />
  </div>
</template>
