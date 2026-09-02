<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QuestionKind, QuestionOption } from '@/types/api';

/**
 * Bloque de pregunta.
 *
 * En modo lectura corrige contra el servidor: las opciones que llegan al navegador
 * no traen la marca de correcta, asi que no se puede hacer trampa con F12.
 */
const props = defineProps<{
  kind: QuestionKind;
  prompt: string;
  promptImageUrl?: string;
  options: QuestionOption[];
  feedbackCorrect: string;
  feedbackWrong: string;
  accentColor: string;
  allowRetry: boolean;
  /** Abiertas: guia de lo que se espera y alto del cuadro de texto. */
  expectedAnswer?: string;
  answerLines?: number;
  /** Abiertas: lo que el alumno ya habia dejado escrito en su ejemplar. */
  studentAnswer?: string;
  /** Miniatura o edicion: se muestra sin poder responder. */
  preview?: boolean;
  /** Corrige la respuesta; la resuelve quien monta el componente. */
  check?: (
    answer: string[],
  ) => Promise<{ correct: boolean; solution: string[]; feedback: string; pendingReview?: boolean }>;
}>();

const selected = ref<string[]>([]);
/** Orden propuesto en las preguntas de ordenar. */
const arrangement = ref<QuestionOption[]>([]);
const result = ref<{ correct: boolean; solution: string[]; feedback: string; pendingReview?: boolean } | null>(null);
/** Texto que el alumno escribe en las preguntas abiertas. */
const texto = ref('');
const checking = ref(false);
const error = ref<string | null>(null);
const celebrating = ref(false);

const isOrder = computed(() => props.kind === 'order');
const isOpen = computed(() => props.kind === 'open');
const answered = computed(() => result.value !== null);
// La abierta nunca se bloquea: el alumno puede seguir puliendo su texto hasta
// que el docente la lea, y cada envio reemplaza al anterior.
const locked = computed(
  () => !isOpen.value && answered.value && (result.value!.correct || !props.allowRetry),
);

watch(
  () => props.studentAnswer,
  (guardado) => {
    texto.value = guardado ?? '';
  },
  { immediate: true },
);

watch(
  () => props.options,
  (options) => {
    arrangement.value = [...options];
    selected.value = [];
    result.value = null;
  },
  { immediate: true, deep: true },
);

function toggle(id: string): void {
  if (props.preview || locked.value) return;
  result.value = null;
  if (props.kind === 'single') {
    selected.value = [id];
    return;
  }
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}

/** Sube o baja una opcion en las preguntas de ordenar. */
function move(index: number, step: number): void {
  const target = index + step;
  if (props.preview || locked.value || target < 0 || target >= arrangement.value.length) return;
  result.value = null;
  const copy = [...arrangement.value];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  arrangement.value = copy;
}

const answer = computed(() => {
  if (isOpen.value) return [texto.value];
  return isOrder.value ? arrangement.value.map((option) => option.id) : selected.value;
});

const canSubmit = computed(() => {
  if (props.preview || locked.value) return false;
  if (isOpen.value) return texto.value.trim().length > 0;
  return isOrder.value || selected.value.length > 0;
});

async function submit(): Promise<void> {
  if (!canSubmit.value || !props.check) return;
  checking.value = true;
  error.value = null;
  try {
    const outcome = await props.check(answer.value);
    result.value = outcome;
    if (outcome.correct && !outcome.pendingReview) {
      celebrating.value = true;
      setTimeout(() => (celebrating.value = false), 2600);
    }
  } catch {
    error.value = 'No se pudo comprobar la respuesta.';
  } finally {
    checking.value = false;
  }
}

function retry(): void {
  result.value = null;
  selected.value = [];
}

/** Confeti: posiciones y retardos fijos para que no cambien en cada repintado. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  duration: 1.5 + ((i * 13) % 9) / 10,
  color: ['#F59E0B', '#EC4899', '#22C55E', '#3B82F6', '#A855F7', '#EF4444'][i % 6],
  size: 6 + (i % 4) * 2,
}));

const KIND_HINTS: Record<QuestionKind, string> = {
  single: 'Elige una respuesta',
  multiple: 'Elige todas las que correspondan',
  order: 'Ordena las opciones',
  open: 'Responde con tus palabras',
};

/** Estado visual de cada opcion una vez respondida. */
function optionState(id: string): 'correct' | 'wrong' | 'idle' {
  if (!result.value) return 'idle';
  const isSolution = result.value.solution.includes(id);
  if (isOrder.value) return 'idle';
  if (isSolution) return 'correct';
  return selected.value.includes(id) ? 'wrong' : 'idle';
}
</script>

<template>
  <!--
    question-box declara un contexto de consulta y todo el interior se mide en
    cqmin: así el bloque se lee igual de bien ocupando media página que la página
    entera. Con tamaños fijos en px se veia diminuto dentro del lienzo de 1000px.
  -->
  <div
    class="question-box relative flex h-full w-full flex-col overflow-hidden border-2 bg-white"
    :style="{ borderColor: accentColor }"
  >
    <!-- Enunciado -->
    <header class="q-header shrink-0" :style="{ backgroundColor: accentColor }">
      <p class="q-hint font-bold uppercase tracking-wide text-white/80">{{ KIND_HINTS[kind] }}</p>
      <p class="q-prompt font-bold leading-tight text-white">{{ prompt || 'Escribe la pregunta...' }}</p>
    </header>

    <img
      v-if="promptImageUrl"
      :src="promptImageUrl"
      alt=""
      class="max-h-[38%] w-full shrink-0 object-contain"
    />

    <!-- Opciones -->
    <div class="q-list min-h-0 flex-1 overflow-y-auto">
      <!-- Abierta: un cuadro de redaccion en lugar de opciones -->
      <template v-if="isOpen">
        <p v-if="expectedAnswer" class="q-hint mb-1 italic text-slate-500">{{ expectedAnswer }}</p>
        <textarea
          v-model="texto"
          class="q-answer w-full resize-none rounded border-2 border-slate-200 bg-white text-slate-700 outline-none focus:border-brand-400"
          :rows="answerLines ?? 4"
          :readonly="preview"
          placeholder="Escribe aqui tu respuesta..."
          @pointerdown.stop
          @click.stop
          @keydown.stop
        />
      </template>

      <template v-else-if="isOrder">
        <div
          v-for="(option, index) in arrangement"
          :key="option.id"
          class="q-option flex items-center border-2 border-slate-200 bg-slate-50"
        >
          <span
            class="q-badge grid shrink-0 place-items-center rounded-full font-black text-white"
            :style="{ backgroundColor: accentColor }"
          >{{ index + 1 }}</span>

          <img v-if="option.imageUrl" :src="option.imageUrl" alt="" class="q-thumb shrink-0 rounded object-cover" />
          <span class="q-text min-w-0 flex-1 truncate text-slate-700">{{ option.text }}</span>

          <span v-if="!preview" class="flex shrink-0 flex-col">
            <button
              type="button"
              class="px-1 text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="index === 0 || locked"
              aria-label="Subir"
              @click.stop="move(index, -1)"
            >▲</button>
            <button
              type="button"
              class="px-1 text-xs leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="index === arrangement.length - 1 || locked"
              aria-label="Bajar"
              @click.stop="move(index, 1)"
            >▼</button>
          </span>
        </div>
      </template>

      <template v-else>
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="q-option flex w-full items-center border-2 text-left transition"
          :class="{
            'border-emerald-500 bg-emerald-50': optionState(option.id) === 'correct',
            'border-red-400 bg-red-50': optionState(option.id) === 'wrong',
            'border-slate-200 bg-white hover:border-slate-300':
              optionState(option.id) === 'idle' && !selected.includes(option.id),
            'border-brand-500 bg-brand-50': optionState(option.id) === 'idle' && selected.includes(option.id),
          }"
          :disabled="preview || locked"
          @click.stop="toggle(option.id)"
        >
          <span
            class="q-mark grid shrink-0 place-items-center border-2 font-black text-white"
            :class="kind === 'multiple' ? 'rounded' : 'rounded-full'"
            :style="{
              borderColor: accentColor,
              backgroundColor: selected.includes(option.id) ? accentColor : 'transparent',
            }"
          >{{ selected.includes(option.id) ? '✓' : '' }}</span>

          <img v-if="option.imageUrl" :src="option.imageUrl" alt="" class="q-thumb shrink-0 rounded object-cover" />
          <span class="q-text min-w-0 flex-1 text-slate-700">{{ option.text }}</span>
        </button>
      </template>
    </div>

    <!-- Accion y resultado -->
    <footer class="q-footer shrink-0 border-t border-slate-100">
      <p v-if="error" class="mb-1 text-xs text-red-600">{{ error }}</p>

      <p
        v-if="result"
        class="q-feedback font-bold"
        :class="
          result.pendingReview
            ? 'text-teal-700'
            : result.correct
              ? 'text-emerald-600'
              : 'text-red-600'
        "
      >
        {{ result.pendingReview ? '✓ ' : result.correct ? '🎉 ' : '' }}{{ result.feedback }}
      </p>

      <button
        v-if="!locked"
        type="button"
        class="q-button w-full font-bold text-white transition disabled:opacity-40"
        :style="{ backgroundColor: accentColor }"
        :disabled="!canSubmit || checking"
        @click.stop="submit"
      >{{ checking ? 'Guardando...' : isOpen ? 'Enviar respuesta' : 'Comprobar' }}</button>

      <button
        v-else-if="!result?.correct && allowRetry"
        type="button"
        class="q-button w-full border border-slate-300 font-semibold text-slate-600"
        @click.stop="retry"
      >Intentar de nuevo</button>

      <p v-else-if="result?.correct" class="q-text text-center font-bold text-emerald-600">Respuesta correcta</p>
    </footer>

    <!-- Felicitacion -->
    <div v-if="celebrating" class="pointer-events-none absolute inset-0 overflow-hidden">
      <span
        v-for="(piece, index) in CONFETTI"
        :key="index"
        class="confetti"
        :style="{
          left: `${piece.left}%`,
          width: `${piece.size}px`,
          height: `${piece.size * 1.6}px`,
          backgroundColor: piece.color,
          animationDelay: `${piece.delay}s`,
          animationDuration: `${piece.duration}s`,
        }"
      />
      <div class="grid h-full w-full place-items-center">
        <span class="cheer drop-shadow-lg">🎉</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * Todo el bloque se mide contra su propio tamano (cqmin = el lado menor del
 * contenedor), asi que crece y encoge con el elemento del lienzo sin quedar
 * ilegible. Se acotan los extremos con clamp para que siga siendo usable.
 */
.question-box {
  container-type: size;
  border-radius: clamp(6px, 2.5cqmin, 22px);
}

.q-header {
  padding: clamp(4px, 2.2cqmin, 22px) clamp(6px, 3cqmin, 28px);
}

.q-hint {
  font-size: clamp(7px, 2.4cqmin, 20px);
}

.q-prompt {
  font-size: clamp(10px, 4.6cqmin, 44px);
}

.q-answer {
  padding: clamp(4px, 2cqmin, 16px);
  font-size: clamp(9px, 3.4cqmin, 30px);
  line-height: 1.45;
}

.q-list {
  padding: clamp(4px, 2cqmin, 20px);
  display: flex;
  flex-direction: column;
  gap: clamp(3px, 1.4cqmin, 14px);
}

.q-option {
  gap: clamp(4px, 1.8cqmin, 18px);
  padding: clamp(3px, 1.6cqmin, 16px);
  border-radius: clamp(4px, 1.8cqmin, 16px);
}

.q-text {
  font-size: clamp(9px, 3.4cqmin, 32px);
}

.q-badge,
.q-mark {
  width: clamp(12px, 5cqmin, 46px);
  height: clamp(12px, 5cqmin, 46px);
  font-size: clamp(7px, 2.6cqmin, 24px);
}

.q-thumb {
  width: clamp(18px, 7cqmin, 70px);
  height: clamp(18px, 7cqmin, 70px);
}

.q-footer {
  padding: clamp(4px, 2cqmin, 20px);
}

.q-feedback {
  font-size: clamp(9px, 3.4cqmin, 32px);
  margin-bottom: clamp(2px, 1cqmin, 10px);
}

.q-button {
  padding: clamp(3px, 1.6cqmin, 16px) clamp(6px, 3cqmin, 28px);
  border-radius: clamp(4px, 1.8cqmin, 16px);
  font-size: clamp(9px, 3.4cqmin, 32px);
}

.cheer {
  font-size: clamp(24px, 18cqmin, 160px);
}

.confetti {
  position: absolute;
  top: -12%;
  border-radius: 2px;
  animation-name: fall;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(115%) rotate(540deg);
    opacity: 0;
  }
}

.cheer {
  animation: pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes pop {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }
  60% {
    transform: scale(1.25);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Quien pide menos movimiento ve el aviso, no la lluvia de confeti. */
@media (prefers-reduced-motion: reduce) {
  .confetti {
    display: none;
  }
  .cheer {
    animation: none;
  }
}
</style>
