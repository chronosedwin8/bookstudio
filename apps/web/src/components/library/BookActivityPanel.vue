<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { fechaHora } from '@/utils/grades';
import type { BookActivity } from '@/types/api';

/**
 * Bitacora de trabajo: cuantas veces ha entrado cada alumno a este libro, cuando y
 * cuanto tiempo ha estado.
 *
 * Las sesiones se cortan solas tras unos minutos sin actividad, asi que lo que se ve
 * es tiempo de trabajo y no una pestana que alguien dejo abierta.
 */
const props = defineProps<{
  bookId: string;
  bookTitle: string;
  studentName?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const cierre = useCierreExterior(() => emit('close'));

const datos = ref<BookActivity | null>(null);
const cargando = ref(true);
const error = ref<string | null>(null);
const detalle = ref(false);

onMounted(async () => {
  try {
    datos.value = await booksApi.activity(props.bookId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});

/** "1 h 24 min", "7 min", "menos de 1 min". */
function duracion(segundos: number): string {
  if (segundos < 60) return 'menos de 1 min';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

const totalSesiones = computed(() => datos.value?.sessions.length ?? 0);
const totalTiempo = computed(() =>
  (datos.value?.people ?? []).reduce((acc, p) => acc + p.totalSeconds, 0),
);
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bitacora-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-3xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="bitacora-titulo" class="text-lg font-black text-slate-900">Bitácora de trabajo</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500">
            <span v-if="studentName">{{ studentName }} · </span>{{ bookTitle }}
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <p v-if="cargando" class="text-sm text-slate-500">Cargando...</p>

        <p v-else-if="!totalSesiones" class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
          Nadie ha abierto este libro todavía.
        </p>

        <template v-else>
          <div class="mb-4 flex flex-wrap gap-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span><strong class="text-slate-900">{{ totalSesiones }}</strong> sesiones</span>
            <span><strong class="text-slate-900">{{ duracion(totalTiempo) }}</strong> en total</span>
            <span><strong class="text-slate-900">{{ datos!.people.length }}</strong> personas</span>
          </div>

          <!-- Resumen por persona, que es lo que se mira primero -->
          <div class="overflow-x-auto rounded-lg border border-slate-200">
            <table class="w-full text-sm">
              <thead class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Persona</th>
                  <th class="px-3 py-2 text-right">Veces</th>
                  <th class="px-3 py-2 text-right">Tiempo</th>
                  <th class="px-3 py-2">Primera vez</th>
                  <th class="px-3 py-2">Última vez</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="persona in datos!.people" :key="persona.userId">
                  <td class="px-3 py-2">
                    <span class="font-medium text-slate-800">{{ persona.userName }}</span>
                    <span
                      v-if="persona.role !== 'student'"
                      class="ml-1 rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700"
                    >docente</span>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums text-slate-700">{{ persona.sessions }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                    {{ duracion(persona.totalSeconds) }}
                  </td>
                  <td class="px-3 py-2 text-xs text-slate-500">{{ fechaHora(persona.firstAt) }}</td>
                  <td class="px-3 py-2 text-xs text-slate-500">{{ fechaHora(persona.lastAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            type="button"
            class="mt-3 text-sm font-semibold text-brand-600 hover:underline"
            @click="detalle = !detalle"
          >
            {{ detalle ? 'Ocultar' : 'Ver' }} las {{ totalSesiones }} sesiones una a una
          </button>

          <ol v-if="detalle" class="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li
              v-for="sesion in datos!.sessions"
              :key="sesion.id"
              class="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"
            >
              <span class="font-medium text-slate-800">{{ sesion.userName }}</span>
              <span class="text-xs text-slate-500">
                {{ fechaHora(sesion.startedAt) }}
                <span class="mx-1">→</span>
                {{ new Date(sesion.lastSeenAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) }}
              </span>
              <span class="tabular-nums font-semibold text-slate-700">{{ duracion(sesion.durationSeconds) }}</span>
            </li>
          </ol>
        </template>

        <p class="mt-4 text-xs text-slate-500">
          Una sesión se cierra sola tras unos minutos sin actividad, de modo que el tiempo refleja
          trabajo real y no pestañas olvidadas abiertas.
        </p>
      </div>
    </div>
  </div>
</template>
