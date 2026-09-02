<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { quizzesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { QuizResultRow, QuizResults } from '@/types/api';

/**
 * Resultados del examen.
 *
 * La cuadricula da el golpe de vista: quien entrego, cuanto lleva y que preguntas
 * costaron mas. Al pulsar una celda se abre la respuesta completa, que es donde se
 * puntuan a mano las abiertas: son las unicas que el servidor no corrige solo.
 */
const props = defineProps<{ quizId: string }>();

const datos = ref<QuizResults | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

/** Celda abierta: alumno + pregunta. */
const detalle = ref<{ row: QuizResultRow; questionId: string } | null>(null);
const notaManual = ref(0);
const comentario = ref('');
const revisando = ref(false);

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    datos.value = await quizzesApi.results(props.quizId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

const preguntas = computed(() => datos.value?.questions ?? []);
const filas = computed(() => datos.value?.rows ?? []);
const entregados = computed(() => filas.value.filter((f) => f.submittedAt).length);
const porRevisar = computed(() => filas.value.reduce((suma, f) => suma + f.pendingReview, 0));

const media = computed(() => {
  const conEntrega = filas.value.filter((f) => f.submittedAt);
  if (!conEntrega.length) return null;
  return Math.round((conEntrega.reduce((suma, f) => suma + f.score, 0) / conEntrega.length) * 10) / 10;
});

function respuestaDe(fila: QuizResultRow, questionId: string) {
  return fila.answers.find((a) => a.questionId === questionId) ?? null;
}

/** Color de la celda: verde acierto, rojo fallo, ambar sin corregir. */
function claseCelda(fila: QuizResultRow, questionId: string): string {
  const respuesta = respuestaDe(fila, questionId);
  if (!respuesta) return 'bg-slate-50 text-slate-300';
  if (respuesta.score === null) return 'bg-amber-100 text-amber-800';
  return respuesta.correct ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700';
}

function textoCelda(fila: QuizResultRow, questionId: string): string {
  const respuesta = respuestaDe(fila, questionId);
  if (!respuesta) return '–';
  return respuesta.score === null ? '?' : String(respuesta.score);
}

/** Traduce ids de opcion al texto que leyo el alumno. */
function comoTexto(questionId: string, answer: string[]): string {
  const pregunta = preguntas.value.find((p) => p.id === questionId);
  if (!pregunta) return answer.join(', ');
  if (pregunta.kind === 'open') return answer[0] ?? '';
  return answer.map((id) => pregunta.options.find((o) => o.id === id)?.text ?? id).join(' · ');
}

function abrir(fila: QuizResultRow, questionId: string): void {
  const respuesta = respuestaDe(fila, questionId);
  if (!respuesta) return;
  detalle.value = { row: fila, questionId };
  const pregunta = preguntas.value.find((p) => p.id === questionId);
  notaManual.value = respuesta.score ?? 0;
  comentario.value = respuesta.teacherNote;
  // Sin corregir aun, se propone el maximo: lo habitual es descontar desde ahi.
  if (respuesta.score === null && pregunta) notaManual.value = pregunta.points;
}

const preguntaAbierta = computed(() =>
  detalle.value ? (preguntas.value.find((p) => p.id === detalle.value!.questionId) ?? null) : null,
);
const respuestaAbierta = computed(() =>
  detalle.value ? respuestaDe(detalle.value.row, detalle.value.questionId) : null,
);

async function puntuar(): Promise<void> {
  if (!detalle.value || revisando.value) return;
  revisando.value = true;
  error.value = null;
  try {
    await quizzesApi.review(props.quizId, detalle.value.questionId, detalle.value.row.studentId, {
      score: notaManual.value,
      teacherNote: comentario.value,
    });
    aviso.value = 'Respuesta puntuada.';
    detalle.value = null;
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    revisando.value = false;
  }
}

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div class="space-y-4">
    <AlertMessage :message="error" />
    <AlertMessage :message="aviso" variant="success" />

    <p v-if="cargando" class="text-sm text-slate-500">Cargando resultados...</p>

    <template v-else-if="datos">
      <div class="grid gap-3 sm:grid-cols-4">
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs uppercase tracking-wide text-slate-500">Entregados</p>
          <p class="text-2xl font-black text-slate-900">{{ entregados }} / {{ filas.length }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs uppercase tracking-wide text-slate-500">Media</p>
          <p class="text-2xl font-black text-slate-900">
            {{ media === null ? '–' : media }}<span class="text-sm font-semibold text-slate-400"> / {{ datos.totalPoints }}</span>
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs uppercase tracking-wide text-slate-500">Por revisar</p>
          <p class="text-2xl font-black" :class="porRevisar ? 'text-amber-600' : 'text-slate-900'">{{ porRevisar }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs uppercase tracking-wide text-slate-500">Preguntas</p>
          <p class="text-2xl font-black text-slate-900">{{ preguntas.length }}</p>
        </div>
      </div>

      <p v-if="!filas.length" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        Todavía no se ha enviado a nadie.
      </p>

      <!-- La cuadricula puede ser ancha: se desplaza sola sin arrastrar la pagina -->
      <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr class="bg-slate-50 text-left">
              <th class="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold text-slate-600">Alumno</th>
              <th
                v-for="(pregunta, i) in preguntas"
                :key="pregunta.id"
                class="px-2 py-2 text-center font-semibold text-slate-600"
                :title="pregunta.prompt"
              >
                {{ i + 1 }}
              </th>
              <th class="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in filas" :key="fila.studentId" class="border-t border-slate-100">
              <td class="sticky left-0 z-10 bg-white px-3 py-2">
                <p class="font-medium text-slate-800">{{ fila.studentName }}</p>
                <p class="text-[11px] text-slate-500">
                  <span v-if="fila.course">{{ fila.course }} · </span>
                  {{ fila.submittedAt ? fechaHora(fila.submittedAt) : 'sin entregar' }}
                </p>
              </td>
              <td v-for="pregunta in preguntas" :key="pregunta.id" class="px-1 py-1 text-center">
                <button
                  type="button"
                  class="w-full rounded px-2 py-1 text-xs font-bold transition hover:ring-2 hover:ring-brand-300"
                  :class="claseCelda(fila, pregunta.id)"
                  @click="abrir(fila, pregunta.id)"
                >{{ textoCelda(fila, pregunta.id) }}</button>
              </td>
              <td class="px-3 py-2 text-right font-bold text-slate-900">
                {{ fila.score }}<span class="text-xs font-normal text-slate-400">/{{ datos.totalPoints }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Que pregunta costo mas -->
      <section v-if="filas.length" class="rounded-lg border border-slate-200 p-4">
        <h3 class="mb-2 font-semibold text-slate-800">Acierto por pregunta</h3>
        <ul class="space-y-1.5">
          <li v-for="(pregunta, i) in preguntas" :key="pregunta.id" class="flex items-center gap-2 text-sm">
            <span class="w-6 shrink-0 text-right font-bold text-slate-400">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-slate-600">{{ pregunta.prompt || 'Sin enunciado' }}</span>
            <span class="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-200">
              <span
                class="block h-full rounded-full bg-emerald-500"
                :style="{
                  width: `${
                    (datos.perQuestion.find((p) => p.questionId === pregunta.id)?.answered ?? 0) === 0
                      ? 0
                      : ((datos.perQuestion.find((p) => p.questionId === pregunta.id)!.correct /
                          datos.perQuestion.find((p) => p.questionId === pregunta.id)!.answered) *
                        100)
                  }%`,
                }"
              />
            </span>
            <span class="w-16 shrink-0 text-right text-xs text-slate-500">
              {{ datos.perQuestion.find((p) => p.questionId === pregunta.id)?.correct ?? 0 }} /
              {{ datos.perQuestion.find((p) => p.questionId === pregunta.id)?.answered ?? 0 }}
            </span>
          </li>
        </ul>
      </section>
    </template>

    <!-- Detalle de una respuesta -->
    <div
      v-if="detalle && preguntaAbierta && respuestaAbierta"
      class="fixed inset-0 z-[9000] grid place-items-center bg-slate-900/60 p-4"
      @click.self="detalle = null"
    >
      <div class="card w-full max-w-xl overflow-hidden">
        <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div class="min-w-0">
            <h2 class="truncate font-bold text-slate-900">{{ detalle.row.studentName }}</h2>
            <p class="truncate text-xs text-slate-500">{{ preguntaAbierta.prompt }}</p>
          </div>
          <button type="button" class="btn-secondary" @click="detalle = null">Cerrar</button>
        </header>

        <div class="space-y-3 p-5">
          <div>
            <p class="label">Respondió</p>
            <p class="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {{ comoTexto(detalle.questionId, respuestaAbierta.answer) || '(vacío)' }}
            </p>
          </div>

          <p
            v-if="preguntaAbierta.expectedAnswer"
            class="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800"
          >
            <span class="font-semibold">Se esperaba:</span> {{ preguntaAbierta.expectedAnswer }}
          </p>

          <div class="flex flex-wrap items-end gap-3">
            <label class="text-sm text-slate-700">
              Puntos (máximo {{ preguntaAbierta.points }})
              <input
                v-model.number="notaManual"
                type="number"
                class="input mt-1 w-28"
                min="0"
                :max="preguntaAbierta.points"
                step="0.25"
              />
            </label>
          </div>

          <div>
            <label class="label" for="quiz-note">Comentario para el alumno</label>
            <textarea id="quiz-note" v-model="comentario" class="input min-h-[4rem] resize-y" maxlength="1000" />
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="detalle = null">Cancelar</button>
            <button type="button" class="btn-primary" :disabled="revisando" @click="puntuar">
              {{ revisando ? 'Guardando...' : 'Guardar puntuación' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
