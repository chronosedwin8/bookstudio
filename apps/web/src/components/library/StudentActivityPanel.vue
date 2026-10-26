<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { fechaHora } from '@/utils/grades';
import { duracion, resumenHecho } from '@/utils/bitacora';
import type { StudentActivity } from '@/types/api';

/**
 * Bitacora de un alumno: todo lo que ha trabajado en los libros de esta
 * biblioteca. Cuantas veces, cuanto rato, en que libro y que hizo en cada
 * sesion (elementos y paginas nuevos, cambiados o borrados).
 */
const props = defineProps<{
  libraryId: string;
  studentId: string;
  studentName: string;
}>();

const emit = defineEmits<{ close: []; abrirLibro: [bookId: string] }>();

const cierre = useCierreExterior(() => emit('close'));

const datos = ref<StudentActivity | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);
/** Libro cuyas sesiones se estan mirando; null = todas. */
const filtro = ref<string | null>(null);

onMounted(async () => {
  try {
    datos.value = await librariesApi.studentActivity(props.libraryId, props.studentId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});

const sesiones = computed(() =>
  (datos.value?.sessions ?? []).filter((s) => !filtro.value || s.bookId === filtro.value),
);
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bitacora-alumno-titulo"
    data-bitacora-alumno
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-4xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="bitacora-alumno-titulo" class="text-lg font-black text-slate-900">Bitácora del estudiante</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500">
            {{ studentName }}<span v-if="datos?.student.course"> · {{ datos.student.course }}</span>
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />
        <p v-if="cargando" class="text-sm text-slate-500">Cargando...</p>

        <p v-else-if="datos && !datos.sessions.length" class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
          Todavía no ha trabajado en ningún libro de esta biblioteca.
        </p>

        <template v-else-if="datos">
          <div class="mb-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span><strong class="text-slate-900">{{ datos.total.sessions }}</strong> {{ datos.total.sessions === 1 ? 'sesión' : 'sesiones' }}</span>
            <span><strong class="text-slate-900">{{ duracion(datos.total.totalSeconds) }}</strong> de trabajo</span>
            <span><strong class="text-slate-900">{{ datos.books.length }}</strong> {{ datos.books.length === 1 ? 'libro' : 'libros' }}</span>
            <span class="basis-full text-xs text-slate-500">{{ resumenHecho(datos.total.hecho) }}</span>
          </div>

          <h3 class="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Por libro</h3>
          <div class="mb-5 overflow-x-auto rounded-lg border border-slate-200">
            <table class="w-full text-sm">
              <thead class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Libro</th>
                  <th class="px-3 py-2 text-right">Veces</th>
                  <th class="px-3 py-2 text-right">Tiempo</th>
                  <th class="px-3 py-2">Lo realizado</th>
                  <th class="px-3 py-2">Última vez</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr
                  v-for="libro in datos.books"
                  :key="libro.bookId"
                  class="cursor-pointer hover:bg-slate-50"
                  :class="filtro === libro.bookId ? 'bg-brand-50' : ''"
                  :title="filtro === libro.bookId ? 'Ver las sesiones de todos los libros' : 'Ver solo las sesiones de este libro'"
                  @click="filtro = filtro === libro.bookId ? null : libro.bookId"
                >
                  <td class="px-3 py-2">
                    <span class="font-medium text-slate-800">{{ libro.bookTitle }}</span>
                    <span v-if="libro.bookHidden" class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">oculto</span>
                    <button
                      type="button"
                      class="ml-2 text-xs font-semibold text-brand-600 hover:underline"
                      @click.stop="emit('abrirLibro', libro.bookId)"
                    >Abrir</button>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums text-slate-700">{{ libro.sessions }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{{ duracion(libro.totalSeconds) }}</td>
                  <td class="px-3 py-2 text-xs text-slate-600">{{ resumenHecho(libro.hecho) }}</td>
                  <td class="px-3 py-2 text-xs text-slate-500">{{ fechaHora(libro.lastAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            Sesiones{{ filtro ? ' de este libro' : '' }} ({{ sesiones.length }})
          </h3>
          <ol class="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li v-for="sesion in sesiones" :key="sesion.id" class="grid gap-x-3 px-3 py-2 text-sm sm:grid-cols-[11rem_1fr_auto]">
              <span class="text-xs text-slate-500">
                {{ fechaHora(sesion.startedAt) }}
                <span class="mx-1">→</span>
                {{ new Date(sesion.lastSeenAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }}
              </span>
              <span class="min-w-0">
                <span class="font-medium text-slate-800">{{ sesion.bookTitle }}</span>
                <span class="block text-xs text-slate-500">{{ resumenHecho(sesion.hecho, sesion.startedAt) }}</span>
              </span>
              <span class="tabular-nums font-semibold text-slate-700">{{ duracion(sesion.durationSeconds) }}</span>
            </li>
          </ol>
        </template>

        <p class="mt-4 text-xs text-slate-500">
          Una sesión se cierra sola tras unos minutos sin actividad: el tiempo refleja trabajo real y no
          pestañas olvidadas. Lo realizado se cuenta desde el 26 de octubre de 2026.
        </p>
      </div>
    </div>
  </div>
</template>
