<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { quizzesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { QUESTION_KIND_LABELS, nextOptionId } from '@/utils/questions';
import type { QuestionKind, QuizDetail, QuizQuestionInput } from '@/types/api';

/**
 * Redaccion del examen.
 *
 * Las preguntas se editan en bloque y se guardan de una vez porque asi se piensa
 * un examen: entero, no pregunta a pregunta. El servidor lo reescribe completo y
 * lo bloquea en cuanto hay entregas, para que nadie cambie el examen bajo unas
 * respuestas ya dadas.
 */
const props = defineProps<{ quiz: QuizDetail }>();
const emit = defineEmits<{ recargar: []; aviso: [texto: string] }>();

const preguntas = ref<QuizQuestionInput[]>([]);
const error = ref<string | null>(null);
const guardando = ref(false);
const enviando = ref(false);
/** Hay cambios sin guardar; evita enviar un examen que no es el que se ve. */
const sucio = ref(false);

watch(
  () => props.quiz,
  (quiz) => {
    preguntas.value = quiz.questions.map((p) => ({
      kind: p.kind,
      prompt: p.prompt,
      promptImageUrl: p.promptImageUrl,
      options: p.options.map((o) => ({ ...o })),
      expectedAnswer: p.expectedAnswer ?? '',
      points: p.points,
    }));
    sucio.value = false;
  },
  { immediate: true, deep: false },
);

const bloqueado = computed(() => (props.quiz.submittedCount ?? 0) > 0);
const totalPuntos = computed(() => preguntas.value.reduce((suma, p) => suma + (Number(p.points) || 0), 0));

function marcarSucio(): void {
  sucio.value = true;
}

function nueva(kind: QuestionKind): void {
  preguntas.value.push({
    kind,
    prompt: '',
    options:
      kind === 'open'
        ? []
        : [
            { id: 'a', text: 'Primera opcion', correct: kind !== 'order' },
            { id: 'b', text: 'Segunda opcion', correct: false },
          ],
    expectedAnswer: '',
    points: kind === 'open' ? 3 : 1,
  });
  marcarSucio();
}

function eliminar(indice: number): void {
  preguntas.value.splice(indice, 1);
  marcarSucio();
}

function mover(indice: number, paso: number): void {
  const destino = indice + paso;
  if (destino < 0 || destino >= preguntas.value.length) return;
  const copia = preguntas.value;
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  marcarSucio();
}

/** Cambiar de tipo puede dejar la pregunta sin solucion valida; se corrige aqui. */
function cambiarTipo(pregunta: QuizQuestionInput, kind: QuestionKind): void {
  pregunta.kind = kind;
  if (kind === 'open') {
    pregunta.options = [];
  } else {
    if (pregunta.options.length < 2) {
      pregunta.options = [
        { id: 'a', text: 'Primera opcion', correct: false },
        { id: 'b', text: 'Segunda opcion', correct: false },
      ];
    }
    if (kind === 'single') {
      const primera = pregunta.options.findIndex((o) => o.correct);
      pregunta.options = pregunta.options.map((o, i) => ({ ...o, correct: i === (primera >= 0 ? primera : 0) }));
    } else if (kind === 'multiple' && !pregunta.options.some((o) => o.correct)) {
      pregunta.options[0].correct = true;
    }
  }
  marcarSucio();
}

function marcarCorrecta(pregunta: QuizQuestionInput, indice: number, valor: boolean): void {
  if (pregunta.kind === 'single') {
    pregunta.options = pregunta.options.map((o, i) => ({ ...o, correct: i === indice }));
  } else {
    pregunta.options[indice].correct = valor;
  }
  marcarSucio();
}

function anadirOpcion(pregunta: QuizQuestionInput): void {
  if (pregunta.options.length >= 8) return;
  pregunta.options.push({ id: nextOptionId(pregunta.options.map((o) => o.id)), text: 'Opcion nueva', correct: false });
  marcarSucio();
}

function quitarOpcion(pregunta: QuizQuestionInput, indice: number): void {
  if (pregunta.options.length <= 2) return;
  pregunta.options.splice(indice, 1);
  if (pregunta.kind === 'single' && !pregunta.options.some((o) => o.correct)) {
    pregunta.options[0].correct = true;
  }
  marcarSucio();
}

function moverOpcion(pregunta: QuizQuestionInput, indice: number, paso: number): void {
  const destino = indice + paso;
  if (destino < 0 || destino >= pregunta.options.length) return;
  const copia = pregunta.options;
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  marcarSucio();
}

async function guardar(): Promise<boolean> {
  guardando.value = true;
  error.value = null;
  try {
    await quizzesApi.saveQuestions(props.quiz.id, preguntas.value);
    sucio.value = false;
    emit('aviso', 'Preguntas guardadas.');
    emit('recargar');
    return true;
  } catch (err) {
    error.value = errorMessage(err);
    return false;
  } finally {
    guardando.value = false;
  }
}

async function enviar(): Promise<void> {
  enviando.value = true;
  error.value = null;
  try {
    // Guardar primero: enviar lo que hay en pantalla, no una version anterior.
    if (sucio.value && !(await guardar())) return;
    const resultado = await quizzesApi.assign(props.quiz.id);
    emit('aviso', `Enviado a ${resultado.assigned} alumno(s).`);
    emit('recargar');
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    enviando.value = false;
  }
}

const TIPOS = Object.entries(QUESTION_KIND_LABELS) as Array<[QuestionKind, string]>;
</script>

<template>
  <div class="space-y-4">
    <AlertMessage :message="error" />

    <div
      v-if="bloqueado"
      class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
    >
      Este cuestionario ya tiene entregas, así que las preguntas no se pueden cambiar. Si necesitas
      otra versión, crea un cuestionario nuevo.
    </div>

    <ul class="space-y-3">
      <li
        v-for="(pregunta, indice) in preguntas"
        :key="indice"
        class="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-black text-brand-700">
            {{ indice + 1 }}
          </span>

          <select
            class="input w-auto py-1 text-sm"
            :value="pregunta.kind"
            :disabled="bloqueado"
            @change="cambiarTipo(pregunta, ($event.target as HTMLSelectElement).value as QuestionKind)"
          >
            <option v-for="[valor, etiqueta] in TIPOS" :key="valor" :value="valor">{{ etiqueta }}</option>
          </select>

          <label class="flex items-center gap-1 text-xs text-slate-600">
            Puntos
            <input
              v-model.number="pregunta.points"
              type="number"
              class="input w-20 py-1 text-sm"
              min="0.25"
              max="100"
              step="0.25"
              :disabled="bloqueado"
              @change="marcarSucio"
            />
          </label>

          <span class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="indice === 0 || bloqueado"
              aria-label="Subir pregunta"
              @click="mover(indice, -1)"
            >▲</button>
            <button
              type="button"
              class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="indice === preguntas.length - 1 || bloqueado"
              aria-label="Bajar pregunta"
              @click="mover(indice, 1)"
            >▼</button>
            <button
              type="button"
              class="px-1.5 text-red-500 hover:text-red-700 disabled:opacity-30"
              :disabled="bloqueado"
              aria-label="Eliminar pregunta"
              @click="eliminar(indice)"
            >×</button>
          </span>
        </div>

        <textarea
          v-model="pregunta.prompt"
          class="input mt-2 min-h-[3.5rem] resize-y"
          maxlength="2000"
          placeholder="Escribe aquí el enunciado"
          :disabled="bloqueado"
          @input="marcarSucio"
        />

        <!-- Abierta: lo que se espera leer, solo para el docente -->
        <input
          v-if="pregunta.kind === 'open'"
          v-model="pregunta.expectedAnswer"
          type="text"
          class="input mt-2 text-sm"
          maxlength="2000"
          placeholder="Qué esperas leer (no se le muestra al alumno)"
          :disabled="bloqueado"
          @input="marcarSucio"
        />

        <div v-else class="mt-2 space-y-1.5">
          <p class="text-[11px] leading-tight text-slate-500">
            {{
              pregunta.kind === 'order'
                ? 'El orden de esta lista es la solución; al alumno le llegan barajadas.'
                : 'Marca la opción correcta.'
            }}
          </p>

          <div v-for="(opcion, i) in pregunta.options" :key="opcion.id" class="flex items-center gap-2">
            <input
              v-if="pregunta.kind !== 'order'"
              type="checkbox"
              class="h-4 w-4 shrink-0"
              :class="pregunta.kind === 'single' ? 'rounded-full' : 'rounded'"
              :checked="opcion.correct === true"
              :disabled="bloqueado"
              @change="marcarCorrecta(pregunta, i, ($event.target as HTMLInputElement).checked)"
            />
            <span
              v-else
              class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600"
            >{{ i + 1 }}</span>

            <input
              v-model="opcion.text"
              type="text"
              class="input py-1 text-sm"
              maxlength="300"
              :disabled="bloqueado"
              @input="marcarSucio"
            />

            <button
              type="button"
              class="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="i === 0 || bloqueado"
              aria-label="Subir opción"
              @click="moverOpcion(pregunta, i, -1)"
            >▲</button>
            <button
              type="button"
              class="px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="i === pregunta.options.length - 1 || bloqueado"
              aria-label="Bajar opción"
              @click="moverOpcion(pregunta, i, 1)"
            >▼</button>
            <button
              type="button"
              class="px-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30"
              :disabled="pregunta.options.length <= 2 || bloqueado"
              aria-label="Quitar opción"
              @click="quitarOpcion(pregunta, i)"
            >×</button>
          </div>

          <button
            type="button"
            class="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40"
            :disabled="pregunta.options.length >= 8 || bloqueado"
            @click="anadirOpcion(pregunta)"
          >+ Añadir opción</button>
        </div>
      </li>
    </ul>

    <div v-if="!bloqueado" class="flex flex-wrap gap-2">
      <button
        v-for="[valor, etiqueta] in TIPOS"
        :key="valor"
        type="button"
        class="btn-secondary text-sm"
        @click="nueva(valor)"
      >+ {{ etiqueta }}</button>
    </div>

    <footer class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
      <p class="text-sm text-slate-600">
        {{ preguntas.length }} preguntas · {{ totalPuntos }} puntos
        <span v-if="sucio" class="font-semibold text-amber-700"> · sin guardar</span>
      </p>

      <div class="ml-auto flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-secondary"
          :disabled="guardando || bloqueado || !preguntas.length"
          @click="guardar"
        >{{ guardando ? 'Guardando...' : 'Guardar preguntas' }}</button>

        <button
          type="button"
          class="btn-primary"
          :disabled="enviando || !preguntas.length || quiz.status === 'cerrado'"
          @click="enviar"
        >
          {{ enviando ? 'Enviando...' : quiz.status === 'borrador' ? 'Enviar a la clase' : 'Reenviar a la clase' }}
        </button>
      </div>
    </footer>
  </div>
</template>
