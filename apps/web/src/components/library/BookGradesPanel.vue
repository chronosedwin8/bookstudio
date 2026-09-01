<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import GradeDialog from '@/components/library/GradeDialog.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { colorNota, etiquetaNota, fechaHora, formatoNota } from '@/utils/grades';
import type { Grade } from '@/types/api';

/**
 * Valoraciones de un libro, en orden cronologico.
 *
 * Es lo que ve el alumno al abrir su libro: que nota le han puesto, cuando y por que.
 * El docente ve el mismo panel y ademas puede anadir y corregir.
 */
const props = defineProps<{
  bookId: string;
  bookTitle: string;
  studentName?: string;
  /** El docente puede poner y corregir notas; el alumno solo leerlas. */
  canGrade?: boolean;
}>();

const emit = defineEmits<{ close: []; changed: [] }>();

const cierre = useCierreExterior(() => emit('close'));

const grades = ref<Grade[]>([]);
const cargando = ref(true);
const error = ref<string | null>(null);

const creando = ref(false);
const abierta = ref<Grade | null>(null);

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    grades.value = await booksApi.grades(props.bookId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

const media = computed(() => {
  if (!grades.value.length) return null;
  const suma = grades.value.reduce((acc, g) => acc + g.score, 0);
  return Math.round((suma / grades.value.length) * 100) / 100;
});

function onSaved(): void {
  creando.value = false;
  abierta.value = null;
  emit('changed');
  void cargar();
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="notas-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-2xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="notas-titulo" class="text-lg font-black text-slate-900">Valoraciones del docente</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500">
            <span v-if="studentName">{{ studentName }} · </span>{{ bookTitle }}
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <button v-if="canGrade" type="button" class="btn-primary" @click="creando = true">
            Nueva valoración
          </button>
          <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
        </div>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <p v-if="cargando" class="text-sm text-slate-500">Cargando...</p>

        <p v-else-if="!grades.length" class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
          {{ canGrade
            ? 'Todavía no has valorado este libro.'
            : 'Tu profesor aún no ha dejado ninguna valoración en este libro.' }}
        </p>

        <template v-else>
          <div class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <span class="text-sm text-slate-600">
              {{ grades.length }} {{ grades.length === 1 ? 'valoración' : 'valoraciones' }}
            </span>
            <span class="flex items-center gap-2 text-sm text-slate-600">
              Promedio
              <span class="rounded border px-2 py-0.5 font-black tabular-nums" :class="colorNota(media!)">
                {{ formatoNota(media!) }}
              </span>
            </span>
          </div>

          <ol class="space-y-3">
            <li
              v-for="grade in grades"
              :key="grade.id"
              class="rounded-lg border border-slate-200 p-4"
            >
              <div class="flex items-start gap-4">
                <span
                  class="grid h-14 w-14 shrink-0 place-items-center rounded-lg border-2 text-xl font-black tabular-nums"
                  :class="colorNota(grade.score)"
                >{{ formatoNota(grade.score) }}</span>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <p class="font-bold text-slate-900">{{ grade.title }}</p>
                    <p class="text-xs text-slate-500">{{ etiquetaNota(grade.score) }}</p>
                  </div>
                  <p class="mt-0.5 text-xs text-slate-500">
                    {{ fechaHora(grade.createdAt) }}
                    <span v-if="grade.teacherName"> · {{ grade.teacherName }}</span>
                    <span v-if="grade.updatedAt !== grade.createdAt">
                      · corregida el {{ fechaHora(grade.updatedAt) }}
                    </span>
                  </p>
                  <p v-if="grade.description" class="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {{ grade.description }}
                  </p>
                  <button
                    v-if="canGrade"
                    type="button"
                    class="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                    @click="abierta = grade"
                  >Editar</button>
                </div>
              </div>
            </li>
          </ol>
        </template>
      </div>
    </div>

    <GradeDialog
      v-if="creando"
      :book-id="bookId"
      :book-title="bookTitle"
      :student-name="studentName"
      editable
      @close="creando = false"
      @saved="onSaved"
      @deleted="onSaved"
    />

    <GradeDialog
      v-if="abierta"
      :book-id="bookId"
      :book-title="bookTitle"
      :student-name="studentName"
      :grade="abierta"
      :editable="canGrade"
      @close="abierta = null"
      @saved="onSaved"
      @deleted="onSaved"
    />
  </div>
</template>
