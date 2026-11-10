<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { CriterioValoracion } from '@/types/api';

/**
 * Criterios de valoracion de una biblioteca.
 *
 * Los tres de siempre (Trabajos, Seguimientos, Otros) son de la plataforma y no
 * se tocan. Cada docente anade los suyos, solo para esta biblioteca o para todas
 * las que lleva. Borrar uno no borra las notas: se quedan con su nombre.
 */
const props = defineProps<{ libraryId: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const criterios = ref<CriterioValoracion[]>([]);
const cargando = ref(true);
const guardando = ref(false);
const error = ref<string | null>(null);

const nuevo = ref('');
const alcance = ref<'biblioteca' | 'todas'>('biblioteca');

/** El que se esta renombrando y su nombre provisional. */
const renombrando = ref<string | null>(null);
const nombreNuevo = ref('');

async function cargar(): Promise<void> {
  try {
    criterios.value = await librariesApi.gradeCriteria(props.libraryId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

const grupos = computed(() => [
  { titulo: 'De la plataforma', ayuda: 'Para todos los docentes. No se pueden cambiar.', lista: criterios.value.filter((c) => c.alcance === 'plataforma') },
  { titulo: 'De esta biblioteca', ayuda: 'Los usan todos los docentes de esta biblioteca.', lista: criterios.value.filter((c) => c.alcance === 'biblioteca') },
  { titulo: 'Para todas mis bibliotecas', ayuda: 'Te acompañan en cada biblioteca que lleves.', lista: criterios.value.filter((c) => c.alcance === 'docente') },
]);

async function crear(): Promise<void> {
  const nombre = nuevo.value.trim();
  if (nombre.length < 2) return;
  guardando.value = true;
  error.value = null;
  try {
    await librariesApi.createCriterion(props.libraryId, { name: nombre, alcance: alcance.value });
    nuevo.value = '';
    emit('changed');
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}

function empezarRenombre(c: CriterioValoracion): void {
  renombrando.value = c.id;
  nombreNuevo.value = c.name;
}

async function renombrar(c: CriterioValoracion): Promise<void> {
  const nombre = nombreNuevo.value.trim();
  if (nombre.length < 2 || nombre === c.name) {
    renombrando.value = null;
    return;
  }
  guardando.value = true;
  error.value = null;
  try {
    await librariesApi.renameCriterion(props.libraryId, c.id, nombre);
    renombrando.value = null;
    emit('changed');
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}

async function borrar(c: CriterioValoracion): Promise<void> {
  const aviso = c.usos
    ? `¿Quitar el criterio «${c.name}»? Las ${c.usos} valoraciones que lo usan no se borran: conservan su nombre.`
    : `¿Quitar el criterio «${c.name}»?`;
  if (!window.confirm(aviso)) return;
  guardando.value = true;
  error.value = null;
  try {
    await librariesApi.removeCriterion(props.libraryId, c.id);
    emit('changed');
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9400] flex items-end justify-center bg-slate-900/70 sm:items-center sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="criterios-titulo"
    @keydown.esc="emit('close')"
  >
    <div class="flex max-h-[100dvh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-xl" data-criterios>
      <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:p-5">
        <div class="min-w-0">
          <h2 id="criterios-titulo" class="text-lg font-black text-slate-900">Criterios de valoración</h2>
          <p class="mt-0.5 text-sm text-slate-500">Cada valoración se pone dentro de uno.</p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3 sm:p-5">
        <AlertMessage :message="error" />

        <p v-if="cargando" class="text-sm text-slate-500">Cargando...</p>

        <template v-else>
          <section v-for="g in grupos" :key="g.titulo">
            <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500">{{ g.titulo }}</h3>
            <p class="text-[11px] text-slate-400">{{ g.ayuda }}</p>
            <p v-if="!g.lista.length" class="mt-2 text-sm italic text-slate-400">Ninguno todavía.</p>
            <ul v-else class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              <li v-for="c in g.lista" :key="c.id" class="flex items-center gap-2 px-3 py-2 text-sm" :data-criterio="c.name">
                <template v-if="renombrando === c.id">
                  <input
                    v-model="nombreNuevo"
                    type="text"
                    maxlength="60"
                    class="input min-w-0 flex-1 py-1"
                    aria-label="Nuevo nombre"
                    @keydown.enter.prevent="renombrar(c)"
                    @keydown.esc.stop="renombrando = null"
                  />
                  <button type="button" class="btn-primary px-2 py-1 text-xs" :disabled="guardando" @click="renombrar(c)">Guardar</button>
                </template>
                <template v-else>
                  <span class="min-w-0 flex-1 truncate font-medium text-slate-800">{{ c.name }}</span>
                  <span v-if="c.alcance !== 'plataforma' && !c.editable && c.teacherName" class="text-[11px] text-slate-400">
                    de {{ c.teacherName }}
                  </span>
                  <span class="text-[11px] tabular-nums text-slate-400">{{ c.usos }} {{ c.usos === 1 ? 'nota' : 'notas' }}</span>
                  <template v-if="c.editable">
                    <button type="button" class="text-xs font-semibold text-brand-700 hover:underline" @click="empezarRenombre(c)">Renombrar</button>
                    <button type="button" class="text-xs font-semibold text-red-600 hover:underline" :disabled="guardando" @click="borrar(c)">Quitar</button>
                  </template>
                </template>
              </li>
            </ul>
          </section>

          <form class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" data-nuevo-criterio @submit.prevent="crear">
            <label class="label mb-0" for="criterio-nuevo">Nuevo criterio</label>
            <div class="flex gap-2">
              <input
                id="criterio-nuevo"
                v-model="nuevo"
                type="text"
                maxlength="60"
                class="input min-w-0 flex-1"
                placeholder="Por ejemplo: Exposiciones"
              />
              <button type="submit" class="btn-primary shrink-0" :disabled="guardando || nuevo.trim().length < 2">Crear</button>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              <label class="flex items-center gap-1.5">
                <input v-model="alcance" type="radio" value="biblioteca" class="h-4 w-4" />
                Solo esta biblioteca
              </label>
              <label class="flex items-center gap-1.5">
                <input v-model="alcance" type="radio" value="todas" class="h-4 w-4" data-alcance-todas />
                Todas mis bibliotecas
              </label>
            </div>
          </form>
        </template>
      </div>
    </div>
  </div>
</template>
