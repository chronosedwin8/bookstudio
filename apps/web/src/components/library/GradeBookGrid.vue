<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import GradeDialog from '@/components/library/GradeDialog.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { colorNota, fechaCorta, formatoNota } from '@/utils/grades';
import type { Grade, GradeBook, GradeBookEntry } from '@/types/api';

/**
 * Cuadricula de valoraciones: alumnado en filas, titulos de nota en columnas.
 *
 * Un alumno puede tener el mismo titulo en dos libros distintos, asi que una celda
 * puede contener mas de una nota. Se muestran ambas en vez de esconder una, y la
 * media las cuenta todas.
 */
const props = defineProps<{ libraryId: string }>();

const datos = ref<GradeBook | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);

/** Nota abierta en la ficha, con el alumno al que pertenece. */
const abierta = ref<{ grade: Grade & { bookTitle: string }; studentName: string } | null>(null);

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    datos.value = await librariesApi.gradebook(props.libraryId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
defineExpose({ recargar: cargar });

/** Notas de un alumno bajo un titulo concreto. Puede haber mas de una. */
function celda(alumno: GradeBookEntry, titulo: string) {
  return alumno.grades.filter((g) => g.title === titulo);
}

const hayNotas = computed(() => Boolean(datos.value?.titles.length));

function onSaved(): void {
  abierta.value = null;
  void cargar();
}
</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
      <h2 class="font-bold text-slate-800">Valoraciones</h2>
      <p v-if="datos?.classAverage !== null && datos" class="text-sm text-slate-500">
        Media de la clase:
        <span class="rounded border px-1.5 py-0.5 font-bold" :class="colorNota(datos.classAverage!)">
          {{ formatoNota(datos.classAverage!) }}
        </span>
      </p>
    </div>

    <AlertMessage class="mb-3" :message="error" />

    <p v-if="cargando" class="card p-8 text-center text-sm text-slate-500">Cargando valoraciones...</p>

    <p v-else-if="!datos?.students.length" class="card p-8 text-center text-sm text-slate-500">
      Aún no hay alumnos inscritos en esta biblioteca.
    </p>

    <p v-else-if="!hayNotas" class="card p-8 text-center text-sm text-slate-500">
      Todavía no has puesto ninguna valoración. Abre un libro de un alumno y usa
      <strong>Valorar</strong>, o pulsa la columna de un alumno aquí abajo.
    </p>

    <div v-else class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="sticky left-0 z-10 bg-white px-4 py-2">Alumno</th>
            <th v-for="titulo in datos.titles" :key="titulo" class="px-3 py-2 text-center">{{ titulo }}</th>
            <th class="px-4 py-2 text-center">Promedio</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="alumno in datos.students" :key="alumno.studentId" class="hover:bg-slate-50">
            <th scope="row" class="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium">
              <span class="block truncate text-slate-800">{{ alumno.studentName }}</span>
              <span v-if="alumno.course" class="text-xs font-normal text-slate-500">{{ alumno.course }}</span>
            </th>

            <td v-for="titulo in datos.titles" :key="titulo" class="px-3 py-2 text-center">
              <div class="flex flex-wrap justify-center gap-1">
                <button
                  v-for="nota in celda(alumno, titulo)"
                  :key="nota.id"
                  type="button"
                  class="rounded border px-2 py-1 text-sm font-bold tabular-nums transition hover:ring-2 hover:ring-brand-300"
                  :class="colorNota(nota.score)"
                  :title="`${nota.title} · ${fechaCorta(nota.createdAt)} · ${nota.bookTitle}`"
                  @click="abierta = { grade: nota, studentName: alumno.studentName }"
                >{{ formatoNota(nota.score) }}</button>
                <span v-if="!celda(alumno, titulo).length" class="text-slate-300">—</span>
              </div>
            </td>

            <td class="px-4 py-2 text-center">
              <span
                v-if="alumno.average !== null"
                class="rounded border px-2 py-1 text-sm font-black tabular-nums"
                :class="colorNota(alumno.average)"
              >{{ formatoNota(alumno.average) }}</span>
              <span v-else class="text-slate-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="hayNotas" class="mt-2 text-xs text-slate-500">
      Pulsa una nota para ver la ficha completa y editarla. Recuerda: <strong>1.0 es la mejor nota</strong>.
    </p>

    <GradeDialog
      v-if="abierta"
      :book-id="abierta.grade.bookId"
      :book-title="abierta.grade.bookTitle"
      :student-name="abierta.studentName"
      :grade="abierta.grade"
      editable
      @close="abierta = null"
      @saved="onSaved"
      @deleted="onSaved"
    />
  </section>
</template>
