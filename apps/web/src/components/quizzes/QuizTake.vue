<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { quizzesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { QuizDetail } from '@/types/api';

/**
 * Responder un cuestionario.
 *
 * Se guarda el avance sin entregar para que cerrar la tapa del portatil no cueste
 * el examen. La entrega es aparte y pide confirmacion: salvo que el docente
 * permita repetir, no hay vuelta atras.
 */
const props = defineProps<{ quiz: QuizDetail }>();
const emit = defineEmits<{ recargar: [] }>();

/** Respuesta por pregunta: ids elegidos, o el texto en las abiertas. */
const respuestas = ref<Record<string, string[]>>({});
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);
const guardando = ref(false);
const entregando = ref(false);
const confirmando = ref(false);

watch(
  () => props.quiz,
  (quiz) => {
    const previas: Record<string, string[]> = {};
    for (const respuesta of quiz.myAnswers ?? []) previas[respuesta.questionId] = [...respuesta.answer];
    // Las de ordenar arrancan con el orden en que llegaron, ya barajado.
    for (const pregunta of quiz.questions) {
      if (!previas[pregunta.id]) {
        previas[pregunta.id] = pregunta.kind === 'order' ? pregunta.options.map((o) => o.id) : [];
      }
    }
    respuestas.value = previas;
  },
  { immediate: true },
);

const entregado = computed(() => Boolean(props.quiz.mySubmittedAt));
const cerrado = computed(() => props.quiz.status === 'cerrado');
const bloqueado = computed(() => cerrado.value || (entregado.value && !props.quiz.allowRetry));

const sinResponder = computed(
  () => props.quiz.questions.filter((p) => !(respuestas.value[p.id] ?? []).some((v) => v.trim())).length,
);

function elegir(questionId: string, optionId: string, unica: boolean): void {
  if (bloqueado.value) return;
  const actuales = respuestas.value[questionId] ?? [];
  if (unica) {
    respuestas.value[questionId] = [optionId];
    return;
  }
  respuestas.value[questionId] = actuales.includes(optionId)
    ? actuales.filter((id) => id !== optionId)
    : [...actuales, optionId];
}

function moverOpcion(questionId: string, indice: number, paso: number): void {
  if (bloqueado.value) return;
  const orden = [...(respuestas.value[questionId] ?? [])];
  const destino = indice + paso;
  if (destino < 0 || destino >= orden.length) return;
  [orden[indice], orden[destino]] = [orden[destino], orden[indice]];
  respuestas.value[questionId] = orden;
}

/** Texto de una opcion dentro de una pregunta, para las de ordenar. */
function textoOpcion(questionId: string, optionId: string): string {
  const pregunta = props.quiz.questions.find((p) => p.id === questionId);
  return pregunta?.options.find((o) => o.id === optionId)?.text ?? optionId;
}

function resultadoDe(questionId: string) {
  return (props.quiz.myAnswers ?? []).find((a) => a.questionId === questionId) ?? null;
}

async function enviar(entregar: boolean): Promise<void> {
  if (bloqueado.value) return;
  const bandera = entregar ? entregando : guardando;
  bandera.value = true;
  error.value = null;
  aviso.value = null;
  try {
    const payload = props.quiz.questions.map((pregunta) => ({
      questionId: pregunta.id,
      answer: (respuestas.value[pregunta.id] ?? []).filter((v) => v.trim()),
    }));
    const resultado = await quizzesApi.answer(props.quiz.id, payload, entregar);
    confirmando.value = false;
    aviso.value = entregar
      ? `Entregado. Llevas ${resultado.autoScore} de ${resultado.totalPoints} puntos` +
        (resultado.pendingReview ? `, con ${resultado.pendingReview} pregunta(s) por revisar.` : '.')
      : 'Avance guardado. Puedes seguir más tarde.';
    emit('recargar');
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    bandera.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <AlertMessage :message="error" />
    <AlertMessage :message="aviso" variant="success" />

    <div
      v-if="entregado"
      class="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"
    >
      Ya entregaste este cuestionario.
      <span v-if="quiz.allowRetry"> Tu profesor permite repetirlo, así que aún puedes cambiar tus respuestas.</span>
    </div>

    <div v-else-if="cerrado" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      Este cuestionario está cerrado y ya no admite respuestas.
    </div>

    <ol class="space-y-4">
      <li
        v-for="(pregunta, indice) in quiz.questions"
        :key="pregunta.id"
        class="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div class="flex items-start gap-3">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-black text-brand-700">
            {{ indice + 1 }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold leading-snug text-slate-900">{{ pregunta.prompt }}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ pregunta.points }} punto(s) ·
              {{
                pregunta.kind === 'single'
                  ? 'elige una'
                  : pregunta.kind === 'multiple'
                    ? 'elige todas las que correspondan'
                    : pregunta.kind === 'order'
                      ? 'ordena la lista'
                      : 'responde con tus palabras'
              }}
            </p>
          </div>

          <!-- Corregida: verde, rojo o a la espera -->
          <span
            v-if="resultadoDe(pregunta.id)?.score !== null && resultadoDe(pregunta.id)"
            class="shrink-0 rounded px-2 py-0.5 text-xs font-bold"
            :class="resultadoDe(pregunta.id)!.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
          >{{ resultadoDe(pregunta.id)!.score }} pt</span>
          <span
            v-else-if="entregado && pregunta.kind === 'open'"
            class="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700"
          >Por revisar</span>
        </div>

        <img v-if="pregunta.promptImageUrl" :src="pregunta.promptImageUrl" alt="" class="mt-3 max-h-64 rounded" />

        <!-- Abierta -->
        <textarea
          v-if="pregunta.kind === 'open'"
          v-model="respuestas[pregunta.id][0]"
          class="input mt-3 min-h-[6rem] resize-y"
          maxlength="4000"
          placeholder="Escribe aquí tu respuesta..."
          :disabled="bloqueado"
        />

        <!-- Ordenar -->
        <ul v-else-if="pregunta.kind === 'order'" class="mt-3 space-y-1.5">
          <li
            v-for="(optionId, i) in respuestas[pregunta.id]"
            :key="optionId"
            class="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-black text-white">
              {{ i + 1 }}
            </span>
            <span class="min-w-0 flex-1 text-sm text-slate-700">{{ textoOpcion(pregunta.id, optionId) }}</span>
            <button
              type="button"
              class="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="i === 0 || bloqueado"
              aria-label="Subir"
              @click="moverOpcion(pregunta.id, i, -1)"
            >▲</button>
            <button
              type="button"
              class="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
              :disabled="i === respuestas[pregunta.id].length - 1 || bloqueado"
              aria-label="Bajar"
              @click="moverOpcion(pregunta.id, i, 1)"
            >▼</button>
          </li>
        </ul>

        <!-- Opciones -->
        <div v-else class="mt-3 space-y-1.5">
          <button
            v-for="opcion in pregunta.options"
            :key="opcion.id"
            type="button"
            class="flex w-full items-center gap-3 rounded border-2 px-3 py-2 text-left transition"
            :class="
              (respuestas[pregunta.id] ?? []).includes(opcion.id)
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            "
            :disabled="bloqueado"
            @click="elegir(pregunta.id, opcion.id, pregunta.kind === 'single')"
          >
            <span
              class="grid h-5 w-5 shrink-0 place-items-center border-2 border-brand-500 text-xs font-black text-white"
              :class="[
                pregunta.kind === 'multiple' ? 'rounded' : 'rounded-full',
                (respuestas[pregunta.id] ?? []).includes(opcion.id) ? 'bg-brand-500' : 'bg-transparent',
              ]"
            >{{ (respuestas[pregunta.id] ?? []).includes(opcion.id) ? '✓' : '' }}</span>
            <img v-if="opcion.imageUrl" :src="opcion.imageUrl" alt="" class="h-10 w-10 shrink-0 rounded object-cover" />
            <span class="min-w-0 flex-1 text-sm text-slate-700">{{ opcion.text }}</span>
          </button>
        </div>
      </li>
    </ol>

    <footer v-if="!bloqueado" class="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
      <p class="text-sm text-slate-600">
        {{ quiz.questions.length - sinResponder }} de {{ quiz.questions.length }} respondidas
      </p>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-secondary" :disabled="guardando" @click="enviar(false)">
          {{ guardando ? 'Guardando...' : 'Guardar avance' }}
        </button>
        <button type="button" class="btn-primary" :disabled="entregando" @click="confirmando = true">Entregar</button>
      </div>
    </footer>

    <!-- Confirmacion: entregar no tiene vuelta atras salvo que se permita repetir -->
    <div v-if="confirmando" class="fixed inset-0 z-[9000] grid place-items-center bg-slate-900/60 p-4" @click.self="confirmando = false">
      <div class="card w-full max-w-md p-5">
        <h2 class="font-bold text-slate-900">¿Entregar el cuestionario?</h2>
        <p class="mt-2 text-sm text-slate-600">
          <span v-if="sinResponder">Te quedan {{ sinResponder }} pregunta(s) sin responder. </span>
          <span v-if="!quiz.allowRetry">Una vez entregado no podrás cambiar tus respuestas.</span>
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="confirmando = false">Seguir respondiendo</button>
          <button type="button" class="btn-primary" :disabled="entregando" @click="enviar(true)">
            {{ entregando ? 'Entregando...' : 'Entregar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
