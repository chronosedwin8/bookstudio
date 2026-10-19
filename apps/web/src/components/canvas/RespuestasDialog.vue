<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { booksApi, librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { Library, QuestionOption, QuestionResponseRow } from '@/types/api';

/**
 * Respuestas guardadas de una pregunta o encuesta.
 *
 * Reune las de todas sus copias: el material repartido a cada alumno, las
 * paginas pegadas en otros libros, el libro compartido por enlace. Cada docente
 * ve las de su alumnado (las bibliotecas que dirige) y las dadas en este libro;
 * la administracion, todas.
 */
const props = defineProps<{ bookId: string; elementId: string }>();
const emit = defineEmits<{ close: [] }>();
const cierre = useCierreExterior(() => emit('close'));

const cargando = ref(true);
const error = ref<string | null>(null);
const pregunta = ref<{ kind: string; prompt: string; options: QuestionOption[] } | null>(null);
const filas = ref<QuestionResponseRow[]>([]);
const bibliotecas = ref<Library[]>([]);
const biblioteca = ref('');

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const r = await booksApi.questionResponses(props.bookId, props.elementId, biblioteca.value || undefined);
    pregunta.value = r.question;
    filas.value = r.rows;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(async () => {
  void cargar();
  try {
    bibliotecas.value = await librariesApi.list(false);
  } catch {
    // Sin la lista, simplemente no se puede filtrar.
  }
});

const textoOpcion = (id: string) => pregunta.value?.options.find((o) => o.id === id)?.text ?? id;
const esAbierta = computed(() => pregunta.value?.kind === 'open');
const esEncuesta = computed(() => pregunta.value?.kind === 'poll');

/** La respuesta de una fila, legible: el texto o las opciones elegidas. */
function respuesta(f: QuestionResponseRow): string {
  if (esAbierta.value) return f.answer[0] ?? '';
  const sep = pregunta.value?.kind === 'order' ? ' → ' : ', ';
  return f.answer.map(textoOpcion).join(sep);
}

/** Cuantos eligieron cada opcion (con los filtros aplicados). */
const resumen = computed(() => {
  const opciones = pregunta.value?.options ?? [];
  if (!opciones.length || esAbierta.value || pregunta.value?.kind === 'order') return [];
  const total = filas.value.length || 1;
  return opciones.map((o) => {
    const n = filas.value.filter((f) => f.answer.includes(o.id)).length;
    return { id: o.id, texto: o.text, n, pct: Math.round((n / total) * 100) };
  });
});

const aciertos = computed(() => {
  const corregidas = filas.value.filter((f) => f.correct !== null);
  if (!corregidas.length) return null;
  return Math.round((corregidas.filter((f) => f.correct).length / corregidas.length) * 100);
});

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Descarga en CSV (se abre con Excel). Con BOM para que respete las tildes. */
function descargarCsv(): void {
  const celda = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const cabecera = ['Nombre', 'Correo', 'Curso', 'Bibliotecas', 'Respuesta', 'Correcta', 'Intentos', 'Fecha', 'Libro'];
  const lineas = filas.value.map((f) =>
    [
      f.fullName,
      f.email,
      f.course ?? '',
      f.libraries.join(' / '),
      respuesta(f),
      f.correct === null ? '' : f.correct ? 'Sí' : 'No',
      String(f.attempts),
      new Date(f.answeredAt).toLocaleString('es-CO'),
      f.bookTitle ?? '',
    ].map(celda).join(';'),
  );
  const blob = new Blob(['﻿' + [cabecera.map(celda).join(';'), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'respuestas.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9300] grid place-items-start overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="respuestas-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-4xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
        <div class="min-w-0">
          <h2 id="respuestas-titulo" class="text-lg font-black text-slate-900">
            {{ esEncuesta ? 'Resultados de la encuesta' : 'Respuestas del alumnado' }}
          </h2>
          <p class="truncate text-sm text-slate-500">{{ pregunta?.prompt }}</p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="space-y-4 p-4">
        <AlertMessage :message="error" />

        <div class="flex flex-wrap items-center gap-2">
          <select v-model="biblioteca" class="input w-auto py-1 text-sm" aria-label="Filtrar por biblioteca" @change="cargar">
            <option value="">Todo mi alumnado</option>
            <option v-for="b in bibliotecas" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <span class="text-sm text-slate-600">
            {{ filas.length }} {{ filas.length === 1 ? 'respuesta' : 'respuestas' }}
            <template v-if="aciertos !== null"> · {{ aciertos }} % de aciertos</template>
          </span>
          <button type="button" class="btn-secondary ml-auto py-1 text-xs" :disabled="!filas.length" @click="descargarCsv">
            ⬇ Descargar (Excel)
          </button>
        </div>

        <!-- Resumen por opcion -->
        <ul v-if="resumen.length && filas.length" class="space-y-1.5 rounded-lg bg-slate-50 p-3">
          <li v-for="r in resumen" :key="r.id" class="text-sm">
            <div class="flex justify-between gap-2">
              <span class="truncate text-slate-700">{{ r.texto }}</span>
              <span class="shrink-0 tabular-nums text-slate-500">{{ r.n }} · {{ r.pct }} %</span>
            </div>
            <div class="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-brand-500" :style="{ width: `${r.pct}%` }" />
            </div>
          </li>
        </ul>

        <p v-if="cargando" class="text-sm text-slate-500">Cargando respuestas…</p>
        <p v-else-if="!filas.length" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Todavía no hay respuestas. Se guardan las de quien contesta con su cuenta: en su copia del libro, en
          un libro de la biblioteca o en uno abierto con enlace.
        </p>

        <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Respuesta</th>
                <th v-if="!esEncuesta && !esAbierta" class="px-3 py-2">¿Bien?</th>
                <th class="px-3 py-2">Cuándo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="f in filas" :key="f.userId" class="align-top">
                <td class="px-3 py-2">
                  <p class="font-semibold text-slate-800">{{ f.fullName }}</p>
                  <p class="text-xs text-slate-500">{{ [f.course, ...f.libraries].filter(Boolean).join(' · ') || f.email }}</p>
                </td>
                <td class="max-w-md whitespace-pre-wrap px-3 py-2 text-slate-700">{{ respuesta(f) }}</td>
                <td v-if="!esEncuesta && !esAbierta" class="px-3 py-2">
                  <span v-if="f.correct" class="font-bold text-emerald-600">✓</span>
                  <span v-else class="font-bold text-red-600">✗</span>
                  <span v-if="f.attempts > 1" class="ml-1 text-xs text-slate-400">({{ f.attempts }} intentos)</span>
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                  {{ fecha(f.answeredAt) }}
                  <span v-if="f.bookTitle" class="block truncate">{{ f.bookTitle }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
