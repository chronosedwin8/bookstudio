<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import GradeDialog from '@/components/library/GradeDialog.vue';
import CriteriosDialog from '@/components/library/CriteriosDialog.vue';
import SeguimientoAlumno from '@/components/library/SeguimientoAlumno.vue';
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

/*
 * Filtro por criterio: con uno elegido solo se ven sus notas y sus columnas, y
 * la media es la de ese criterio. Sin filtro, una columna de media por criterio.
 */
const filtro = ref<string | null>(null);
const gestionando = ref(false);
/** Seguimiento por criterios de un alumno, abierto desde su nombre. */
const informe = ref<{ studentId: string; studentName: string } | null>(null);

const enFiltro = (g: { criterionName: string }) => !filtro.value || g.criterionName === filtro.value;

/** Notas de un alumno bajo un titulo concreto. Puede haber mas de una. */
function celda(alumno: GradeBookEntry, titulo: string) {
  return alumno.grades.filter((g) => g.title === titulo && enFiltro(g));
}

const titulosVisibles = computed(() =>
  (datos.value?.titles ?? []).filter((t) => datos.value!.students.some((a) => a.grades.some((g) => g.title === t && enFiltro(g)))),
);

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
      <div class="flex flex-wrap items-center gap-3">
        <p v-if="datos?.classAverage !== null && datos" class="text-sm text-slate-500">
          Media de la clase:
          <span class="rounded border px-1.5 py-0.5 font-bold" :class="colorNota(datos.classAverage!)">
            {{ formatoNota(datos.classAverage!) }}
          </span>
        </p>
        <button type="button" class="btn-secondary text-sm" data-abrir-criterios @click="gestionando = true">
          Criterios
        </button>
      </div>
    </div>

    <!-- Filtro por criterio -->
    <div v-if="datos && datos.criteria.length" class="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Criterio">
      <button
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
        :class="filtro === null ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
        @click="filtro = null"
      >Todos los criterios</button>
      <button
        v-for="c in datos.criteria"
        :key="c"
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
        :class="filtro === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
        :data-filtro-criterio="c"
        @click="filtro = c"
      >{{ c }}</button>
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
            <th v-for="titulo in titulosVisibles" :key="titulo" class="px-3 py-2 text-center">{{ titulo }}</th>
            <template v-if="!filtro">
              <th v-for="c in datos.criteria" :key="`m-${c}`" class="bg-slate-50 px-3 py-2 text-center">{{ c }}</th>
            </template>
            <th class="px-4 py-2 text-center">{{ filtro ? `Media ${filtro}` : 'Promedio' }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="alumno in datos.students" :key="alumno.studentId" class="hover:bg-slate-50">
            <th scope="row" class="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium">
              <button
                type="button"
                class="block max-w-full truncate text-left text-slate-800 hover:text-brand-700 hover:underline"
                title="Ver su seguimiento por criterios"
                :data-informe-alumno="alumno.studentId"
                @click="informe = { studentId: alumno.studentId, studentName: alumno.studentName }"
              >{{ alumno.studentName }}</button>
              <span v-if="alumno.course" class="text-xs font-normal text-slate-500">{{ alumno.course }}</span>
            </th>

            <td v-for="titulo in titulosVisibles" :key="titulo" class="px-3 py-2 text-center">
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

            <template v-if="!filtro">
              <td v-for="c in datos.criteria" :key="`m-${c}`" class="bg-slate-50 px-3 py-2 text-center">
                <span
                  v-if="alumno.averages[c] !== undefined"
                  class="rounded border px-1.5 py-0.5 text-xs font-bold tabular-nums"
                  :class="colorNota(alumno.averages[c])"
                >{{ formatoNota(alumno.averages[c]) }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
            </template>
            <td class="px-4 py-2 text-center">
              <template v-if="filtro ? alumno.averages[filtro] !== undefined : alumno.average !== null">
                <span
                  class="rounded border px-2 py-1 text-sm font-black tabular-nums"
                  :class="colorNota(filtro ? alumno.averages[filtro] : alumno.average!)"
                >{{ formatoNota(filtro ? alumno.averages[filtro] : alumno.average!) }}</span>
              </template>
              <span v-else class="text-slate-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="hayNotas" class="mt-2 text-xs text-slate-500">
      Pulsa una nota para ver la ficha completa y editarla, o el nombre de un alumno para ver su seguimiento por
      criterios. Recuerda: <strong>1.0 es la mejor nota</strong>.
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

    <CriteriosDialog v-if="gestionando" :library-id="libraryId" @close="gestionando = false" @changed="cargar" />

    <div
      v-if="informe"
      class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Seguimiento por criterios"
      @keydown.esc="informe = null"
    >
      <div class="mx-auto w-full max-w-4xl rounded-xl bg-slate-50 shadow-2xl">
        <header class="flex items-start justify-between gap-4 rounded-t-xl border-b border-slate-200 bg-white p-5">
          <div class="min-w-0">
            <h2 class="text-lg font-black text-slate-900">Seguimiento por criterios</h2>
            <p class="mt-0.5 truncate text-sm text-slate-500">{{ informe.studentName }}</p>
          </div>
          <button type="button" class="btn-secondary shrink-0" @click="informe = null">Cerrar</button>
        </header>
        <div class="p-5">
          <SeguimientoAlumno :library-id="libraryId" :student-id="informe.studentId" />
        </div>
      </div>
    </div>
  </section>
</template>
