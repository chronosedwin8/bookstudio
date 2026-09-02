<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { quizzesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { Quiz } from '@/types/api';

/**
 * Cuestionarios de una biblioteca.
 *
 * El profesorado ve todos, con cuantos los tienen y cuantos han entregado; el
 * alumnado solo los que le han enviado, con el estado de su propia entrega.
 */
const props = defineProps<{ libraryId: string; isManager: boolean }>();

const router = useRouter();
const quizzes = ref<Quiz[]>([]);
const cargando = ref(true);
const error = ref<string | null>(null);
const creando = ref(false);
const titulo = ref('');

const ESTADOS: Record<Quiz['status'], { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  enviado: { texto: 'Enviado', clase: 'bg-emerald-100 text-emerald-700' },
  cerrado: { texto: 'Cerrado', clase: 'bg-amber-100 text-amber-700' },
};

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    quizzes.value = await quizzesApi.list(props.libraryId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

async function crear(): Promise<void> {
  const nombre = titulo.value.trim();
  if (!nombre || creando.value) return;
  creando.value = true;
  error.value = null;
  try {
    const quiz = await quizzesApi.create({ libraryId: props.libraryId, title: nombre });
    titulo.value = '';
    await router.push({ name: 'quiz', params: { id: quiz.id } });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    creando.value = false;
  }
}

const fecha = (valor: string) =>
  new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

/** Un examen entregado que aun tiene abiertas sin corregir no muestra nota final. */
const notaAlumno = (quiz: Quiz) =>
  quiz.myScore === null || quiz.myScore === undefined
    ? 'Sin corregir'
    : `${quiz.myScore} / ${quiz.totalPoints ?? 0} puntos`;

const vacio = computed(() => !cargando.value && quizzes.value.length === 0);
</script>

<template>
  <section class="space-y-4">
    <AlertMessage :message="error" />

    <form v-if="isManager" class="flex flex-wrap items-end gap-2" @submit.prevent="crear">
      <div class="min-w-[16rem] flex-1">
        <label class="label" for="quiz-title">Nuevo cuestionario</label>
        <input
          id="quiz-title"
          v-model="titulo"
          type="text"
          class="input"
          maxlength="160"
          placeholder="Ej: Examen de ciencias, primer periodo"
        />
      </div>
      <button type="submit" class="btn-primary" :disabled="!titulo.trim() || creando">
        {{ creando ? 'Creando...' : 'Crear' }}
      </button>
    </form>

    <p v-if="cargando" class="text-sm text-slate-500">Cargando cuestionarios...</p>

    <p v-else-if="vacio" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      {{
        isManager
          ? 'Todavía no hay cuestionarios. Crea uno, escribe las preguntas y envíalo a la clase.'
          : 'Aún no te han enviado ningún cuestionario.'
      }}
    </p>

    <ul v-else class="grid gap-3 md:grid-cols-2">
      <li v-for="quiz in quizzes" :key="quiz.id">
        <RouterLink
          :to="{ name: 'quiz', params: { id: quiz.id } }"
          class="block h-full rounded-lg border border-slate-200 p-4 transition hover:border-brand-400 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-semibold leading-tight text-slate-900">{{ quiz.title }}</h3>
            <span class="shrink-0 rounded px-2 py-0.5 text-[11px] font-bold" :class="ESTADOS[quiz.status].clase">
              {{ ESTADOS[quiz.status].texto }}
            </span>
          </div>

          <p v-if="quiz.description" class="mt-1 line-clamp-2 text-sm text-slate-500">{{ quiz.description }}</p>

          <p class="mt-2 text-xs text-slate-500">
            {{ quiz.questionCount ?? 0 }} preguntas · {{ quiz.totalPoints ?? 0 }} puntos ·
            {{ fecha(quiz.createdAt) }}
          </p>

          <p v-if="isManager" class="mt-1 text-xs font-semibold text-slate-600">
            {{ quiz.submittedCount ?? 0 }} de {{ quiz.assignedCount ?? 0 }} entregados
          </p>

          <p v-else class="mt-1 text-xs font-semibold" :class="quiz.submittedAt ? 'text-emerald-700' : 'text-brand-700'">
            {{ quiz.submittedAt ? `Entregado · ${notaAlumno(quiz)}` : 'Pendiente de responder' }}
          </p>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
