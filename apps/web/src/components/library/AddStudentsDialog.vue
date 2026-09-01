<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useCierreExterior } from '@/composables/useCierreExterior';
import type { AddStudentsResult, Candidate, SourceGroup } from '@/types/api';

/**
 * Arma una biblioteca con alumnado suelto de varios grupos.
 *
 * El caso real es "cinco de 10A, seis de 10B y nueve de 10C", asi que se trabaja por
 * grupos: se elige uno, se ve su lista completa y se marca. Lo marcado se conserva al
 * cambiar de grupo, de modo que se recorren los tres y se anaden todos de una vez.
 *
 * Buscar por nombre queda como atajo para cuando ya se sabe a quien se quiere.
 */
const props = defineProps<{
  libraryId: string;
  libraryName: string;
}>();

const emit = defineEmits<{
  close: [];
  added: [resultado: AddStudentsResult];
}>();

const cierre = useCierreExterior(() => emit('close'));

type Modo = 'grupo' | 'buscar';
const modo = ref<Modo>('grupo');

const grupos = ref<SourceGroup[]>([]);
const grupoActivo = ref<SourceGroup | null>(null);
const lista = ref<Candidate[]>([]);
const filtroGrupo = ref('');

const search = ref('');
const resultados = ref<Candidate[]>([]);
const buscado = ref(false);

/** Lo marcado se guarda con su nombre para poder mostrarlo fuera de su grupo. */
const elegidos = ref<Map<string, string>>(new Map());

const cargandoGrupos = ref(true);
const cargandoLista = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const gruposFiltrados = computed(() => {
  const t = filtroGrupo.value.trim().toLowerCase();
  return t ? grupos.value.filter((g) => g.name.toLowerCase().includes(t)) : grupos.value;
});

const visibles = computed(() => (modo.value === 'grupo' ? lista.value : resultados.value));
const disponibles = computed(() => visibles.value.filter((a) => !a.alreadyIn));
const todosMarcados = computed(
  () => disponibles.value.length > 0 && disponibles.value.every((a) => elegidos.value.has(a.key)),
);

onMounted(async () => {
  try {
    grupos.value = await librariesApi.sourceGroups(props.libraryId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargandoGrupos.value = false;
  }
});

async function abrirGrupo(grupo: SourceGroup): Promise<void> {
  grupoActivo.value = grupo;
  lista.value = [];
  cargandoLista.value = true;
  error.value = null;
  try {
    lista.value = await librariesApi.roster(props.libraryId, grupo.kind, grupo.id);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargandoLista.value = false;
  }
}

async function buscar(): Promise<void> {
  const termino = search.value.trim();
  if (termino.length < 2) {
    resultados.value = [];
    buscado.value = false;
    return;
  }
  error.value = null;
  try {
    const encontrados = await librariesApi.searchStudents(props.libraryId, termino);
    resultados.value = encontrados.map((s) => ({
      key: s.id,
      fullName: s.fullName,
      email: s.email,
      alreadyIn: s.alreadyIn,
      hasAccount: true,
    }));
    buscado.value = true;
  } catch (err) {
    error.value = errorMessage(err);
  }
}

let temporizador: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void buscar(), 350);
});

function alternar(alumno: Candidate): void {
  const copia = new Map(elegidos.value);
  if (copia.has(alumno.key)) copia.delete(alumno.key);
  else copia.set(alumno.key, alumno.fullName);
  elegidos.value = copia;
}

function marcarTodos(): void {
  const copia = new Map(elegidos.value);
  if (todosMarcados.value) {
    for (const a of disponibles.value) copia.delete(a.key);
  } else {
    for (const a of disponibles.value) copia.set(a.key, a.fullName);
  }
  elegidos.value = copia;
}

function quitar(key: string): void {
  const copia = new Map(elegidos.value);
  copia.delete(key);
  elegidos.value = copia;
}

async function anadir(): Promise<void> {
  if (!elegidos.value.size) return;
  guardando.value = true;
  error.value = null;
  try {
    const resultado = await librariesApi.addStudents(props.libraryId, [...elegidos.value.keys()]);
    emit('added', resultado);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9000] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="anadir-alumnos-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-4xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <h2 id="anadir-alumnos-titulo" class="text-lg font-black text-slate-900">Añadir alumnos</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            Elige un grupo, marca a quien quieras y pasa al siguiente.
            Lo marcado se conserva hasta que lo añadas a <strong>{{ libraryName }}</strong>.
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="border-b border-slate-200 px-5 pt-3">
        <div class="flex gap-1">
          <button
            type="button"
            class="rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold"
            :class="modo === 'grupo' ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500'"
            @click="modo = 'grupo'"
          >Por grupo</button>
          <button
            type="button"
            class="rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold"
            :class="modo === 'buscar' ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500'"
            @click="modo = 'buscar'"
          >Buscar por nombre</button>
        </div>
      </div>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <!-- Por grupo -->
        <div v-if="modo === 'grupo'" class="grid gap-4 sm:grid-cols-[15rem_1fr]">
          <div class="min-w-0">
            <label class="label" for="filtro-grupo">Grupo</label>
            <input id="filtro-grupo" v-model="filtroGrupo" type="search" class="input mb-2" placeholder="10A, 10B..." />

            <p v-if="cargandoGrupos" class="text-sm text-slate-500">Cargando grupos...</p>
            <p v-else-if="!grupos.length" class="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              No hay grupos con alumnado todavía. Importa un curso de Phidias o crea alumnos con QR.
            </p>

            <ul v-else class="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              <li v-for="grupo in gruposFiltrados" :key="grupo.kind + grupo.id">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  :class="grupoActivo?.id === grupo.id && grupoActivo?.kind === grupo.kind
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-slate-700'"
                  @click="abrirGrupo(grupo)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ grupo.name }}</span>
                  <span class="shrink-0 text-xs text-slate-400">{{ grupo.studentCount }}</span>
                </button>
              </li>
            </ul>
          </div>

          <div class="min-w-0">
            <p v-if="!grupoActivo" class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
              Elige un grupo de la izquierda para ver su lista.
            </p>

            <template v-else>
              <div class="mb-2 flex items-center justify-between gap-3">
                <p class="truncate text-sm font-bold text-slate-800">{{ grupoActivo.name }}</p>
                <button
                  v-if="disponibles.length"
                  type="button"
                  class="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
                  @click="marcarTodos"
                >{{ todosMarcados ? 'Quitar todos' : 'Marcar todos' }}</button>
              </div>

              <p v-if="cargandoLista" class="text-sm text-slate-500">Cargando la lista...</p>

              <ul v-else class="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                <li v-for="alumno in lista" :key="alumno.key">
                  <label
                    class="flex items-start gap-3 p-2.5"
                    :class="alumno.alreadyIn ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'"
                  >
                    <input
                      type="checkbox"
                      class="mt-1 h-4 w-4 shrink-0 rounded"
                      :checked="elegidos.has(alumno.key)"
                      :disabled="alumno.alreadyIn"
                      @change="alternar(alumno)"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-slate-800">{{ alumno.fullName }}</span>
                      <span v-if="alumno.email" class="block truncate text-xs text-slate-500">{{ alumno.email }}</span>
                    </span>
                    <span
                      v-if="alumno.alreadyIn"
                      class="shrink-0 self-center rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                    >Ya está</span>
                    <span
                      v-else-if="!alumno.hasAccount"
                      class="shrink-0 self-center rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      title="Se le creará la cuenta al añadirlo"
                    >Cuenta nueva</span>
                  </label>
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- Buscar por nombre -->
        <div v-else>
          <label class="label" for="buscar-alumno">Nombre o correo</label>
          <input
            id="buscar-alumno"
            v-model="search"
            type="search"
            class="input"
            placeholder="Escribe al menos dos letras..."
            autocomplete="off"
          />
          <p class="mt-1 text-xs text-slate-500">
            Busca entre quienes ya tienen cuenta. Para alumnos que aún no la tienen, usa «Por grupo».
          </p>

          <p v-if="buscado && !resultados.length" class="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            Nadie coincide con «{{ search }}».
          </p>

          <ul
            v-else-if="resultados.length"
            class="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
          >
            <li v-for="alumno in resultados" :key="alumno.key">
              <label
                class="flex items-start gap-3 p-2.5"
                :class="alumno.alreadyIn ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'"
              >
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 rounded"
                  :checked="elegidos.has(alumno.key)"
                  :disabled="alumno.alreadyIn"
                  @change="alternar(alumno)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-slate-800">{{ alumno.fullName }}</span>
                  <span v-if="alumno.email" class="block truncate text-xs text-slate-500">{{ alumno.email }}</span>
                </span>
                <span
                  v-if="alumno.alreadyIn"
                  class="shrink-0 self-center rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                >Ya está</span>
              </label>
            </li>
          </ul>
        </div>

        <!-- Lo elegido, recorriendo varios grupos -->
        <div v-if="elegidos.size" class="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p class="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700">
            Elegidos ({{ elegidos.size }})
          </p>
          <ul class="flex flex-wrap gap-1.5">
            <li
              v-for="[key, nombre] in elegidos"
              :key="key"
              class="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 shadow-sm"
            >
              <span class="max-w-[12rem] truncate">{{ nombre }}</span>
              <button
                type="button"
                class="text-slate-400 hover:text-red-600"
                :aria-label="`Quitar a ${nombre}`"
                @click="quitar(key)"
              >×</button>
            </li>
          </ul>
        </div>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-slate-200 p-5">
        <p class="text-sm text-slate-500">
          {{ elegidos.size ? `${elegidos.size} alumnos seleccionados` : 'Ninguno seleccionado' }}
        </p>
        <button type="button" class="btn-primary" :disabled="!elegidos.size || guardando" @click="anadir">
          {{ guardando ? 'Añadiendo...' : 'Añadir a la biblioteca' }}
        </button>
      </footer>
    </div>
  </div>
</template>
