<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { colorNota, etiquetaNota, fechaHora, formatoNota } from '@/utils/grades';
import type { InformeAlumno } from '@/types/api';

/**
 * Seguimiento de un alumno en una biblioteca: sus valoraciones agrupadas por
 * criterio ("Trabajos", "Seguimientos", "Otros"...), con la media de cada uno y
 * la de todo. Lo ve el propio alumno (sin `studentId`) y sus docentes.
 *
 * Recuerda la escala: 1.0 es la mejor nota.
 */
const props = defineProps<{ libraryId: string; studentId?: string }>();

const informe = ref<InformeAlumno | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    informe.value = await librariesApi.report(props.libraryId, props.studentId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <section data-seguimiento>
    <AlertMessage class="mb-3" :message="error" />
    <p v-if="cargando" class="card p-8 text-center text-sm text-slate-500">Cargando el seguimiento...</p>

    <template v-else-if="informe">
      <p v-if="!informe.criteria.length" class="card p-8 text-center text-sm text-slate-500">
        {{ studentId ? 'Este alumno' : 'Tu profesor' }} aún no tiene valoraciones en esta biblioteca.
      </p>

      <template v-else>
        <!-- Resumen: la media de cada criterio y la de todo -->
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-resumen-criterios>
          <div
            v-for="c in informe.criteria"
            :key="c.criterion"
            class="card flex items-center justify-between gap-3 p-3"
            :data-media-criterio="c.criterion"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold text-slate-800">{{ c.criterion }}</p>
              <p class="text-xs text-slate-500">{{ c.grades.length }} {{ c.grades.length === 1 ? 'valoración' : 'valoraciones' }}</p>
            </div>
            <span class="rounded border px-2 py-1 text-lg font-black tabular-nums" :class="colorNota(c.average)">
              {{ formatoNota(c.average) }}
            </span>
          </div>
          <div v-if="informe.average !== null" class="card flex items-center justify-between gap-3 border-2 p-3">
            <p class="font-bold text-slate-900">Promedio general</p>
            <span class="rounded border px-2 py-1 text-lg font-black tabular-nums" :class="colorNota(informe.average)">
              {{ formatoNota(informe.average) }}
            </span>
          </div>
        </div>
        <p class="mt-1 text-xs text-slate-500">Recuerda: <strong>1.0 es la mejor nota</strong> y 6.0 la peor.</p>

        <!-- Detalle por criterio -->
        <div v-for="c in informe.criteria" :key="c.criterion" class="mt-6">
          <h3 class="mb-2 flex items-center gap-2 font-bold text-slate-800">
            {{ c.criterion }}
            <span class="rounded border px-1.5 py-0.5 text-xs font-black tabular-nums" :class="colorNota(c.average)">
              {{ formatoNota(c.average) }}
            </span>
          </h3>
          <ol class="space-y-2">
            <li v-for="g in c.grades" :key="g.id" class="card flex items-start gap-3 p-3">
              <span
                class="grid h-12 w-12 shrink-0 place-items-center rounded-lg border-2 text-lg font-black tabular-nums"
                :class="colorNota(g.score)"
              >{{ formatoNota(g.score) }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <p class="font-semibold text-slate-900">{{ g.title }}</p>
                  <p class="text-xs text-slate-500">{{ etiquetaNota(g.score) }}</p>
                </div>
                <p class="text-xs text-slate-500">
                  {{ g.bookTitle }} · {{ fechaHora(g.createdAt) }}<span v-if="g.teacherName"> · {{ g.teacherName }}</span>
                </p>
                <p v-if="g.description" class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{{ g.description }}</p>
              </div>
            </li>
          </ol>
        </div>
      </template>
    </template>
  </section>
</template>
