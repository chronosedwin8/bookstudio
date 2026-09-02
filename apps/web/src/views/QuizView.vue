<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import QuizBuilder from '@/components/quizzes/QuizBuilder.vue';
import QuizResultsPanel from '@/components/quizzes/QuizResultsPanel.vue';
import QuizTake from '@/components/quizzes/QuizTake.vue';
import { quizzesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { QuizDetail } from '@/types/api';

/**
 * Un cuestionario. La misma direccion sirve para las dos caras: quien lo gestiona
 * ve las preguntas y los resultados, y el alumnado ve el examen para responder.
 * Es el servidor quien decide cual, en `canManage`.
 */
const route = useRoute();

const quiz = ref<QuizDetail | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);
const pestana = ref<'preguntas' | 'resultados' | 'ajustes'>('preguntas');
const guardandoAjustes = ref(false);

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    quiz.value = await quizzesApi.get(String(route.params.id));
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
watch(() => route.params.id, cargar);

const esDocente = computed(() => quiz.value?.canManage === true);

async function cambiarAjuste(cambios: Parameters<typeof quizzesApi.update>[1]): Promise<void> {
  if (!quiz.value) return;
  guardandoAjustes.value = true;
  error.value = null;
  try {
    await quizzesApi.update(quiz.value.id, cambios);
    await cargar();
    aviso.value = 'Ajustes guardados.';
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardandoAjustes.value = false;
  }
}

function anotar(texto: string): void {
  aviso.value = texto;
}

const ESTADOS = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  enviado: { texto: 'Enviado', clase: 'bg-emerald-100 text-emerald-700' },
  cerrado: { texto: 'Cerrado', clase: 'bg-amber-100 text-amber-700' },
} as const;
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <p v-if="cargando" class="text-sm text-slate-500">Cargando cuestionario...</p>

    <AlertMessage v-else-if="!quiz" :message="error ?? 'Cuestionario no encontrado'" />

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <RouterLink
            :to="{ name: 'library', params: { id: quiz.libraryId }, query: { t: 'examenes' } }"
            class="text-sm text-brand-600 hover:underline"
          >← Volver a la biblioteca</RouterLink>
          <h1 class="mt-1 text-2xl font-black text-slate-900">{{ quiz.title }}</h1>
          <p v-if="quiz.description" class="mt-1 text-sm text-slate-600">{{ quiz.description }}</p>
        </div>
        <span class="rounded px-2.5 py-1 text-xs font-bold" :class="ESTADOS[quiz.status].clase">
          {{ ESTADOS[quiz.status].texto }}
        </span>
      </header>

      <div class="mt-3 space-y-2">
        <AlertMessage :message="error" />
        <AlertMessage :message="aviso" variant="success" />
      </div>

      <!-- Docente -->
      <template v-if="esDocente">
        <nav class="mt-4 border-b border-slate-200" aria-label="Secciones del cuestionario">
          <ul class="flex gap-1">
            <li v-for="opcion in (['preguntas', 'resultados', 'ajustes'] as const)" :key="opcion">
              <button
                type="button"
                class="border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition"
                :class="pestana === opcion
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'"
                @click="pestana = opcion"
              >{{ opcion }}</button>
            </li>
          </ul>
        </nav>

        <div class="mt-4">
          <QuizBuilder v-if="pestana === 'preguntas'" :quiz="quiz" @recargar="cargar" @aviso="anotar" />

          <QuizResultsPanel v-else-if="pestana === 'resultados'" :quiz-id="quiz.id" />

          <div v-else class="max-w-lg space-y-4">
            <label class="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded"
                :checked="quiz.showSolutions"
                :disabled="guardandoAjustes"
                @change="cambiarAjuste({ showSolutions: ($event.target as HTMLInputElement).checked })"
              />
              <span>
                Mostrar la corrección al entregar
                <span class="block text-xs text-slate-500">
                  Con esto apagado, el alumnado entrega y no sabe qué acertó hasta que tú lo digas.
                </span>
              </span>
            </label>

            <label class="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded"
                :checked="quiz.allowRetry"
                :disabled="guardandoAjustes"
                @change="cambiarAjuste({ allowRetry: ($event.target as HTMLInputElement).checked })"
              />
              <span>
                Permitir repetirlo
                <span class="block text-xs text-slate-500">Se puede volver a entregar y la nota se recalcula.</span>
              </span>
            </label>

            <div>
              <label class="label" for="quiz-desc">Descripción</label>
              <textarea
                id="quiz-desc"
                class="input min-h-[4rem] resize-y"
                maxlength="2000"
                :value="quiz.description"
                :disabled="guardandoAjustes"
                @change="cambiarAjuste({ description: ($event.target as HTMLTextAreaElement).value })"
              />
            </div>

            <div class="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                v-if="quiz.status === 'enviado'"
                type="button"
                class="btn-secondary"
                :disabled="guardandoAjustes"
                @click="cambiarAjuste({ status: 'cerrado' })"
              >Cerrar el cuestionario</button>
              <button
                v-if="quiz.status === 'cerrado'"
                type="button"
                class="btn-secondary"
                :disabled="guardandoAjustes"
                @click="cambiarAjuste({ status: 'enviado' })"
              >Reabrirlo</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Alumnado -->
      <div v-else class="mt-4">
        <QuizTake :quiz="quiz" @recargar="cargar" />
      </div>
    </template>
  </div>
</template>
