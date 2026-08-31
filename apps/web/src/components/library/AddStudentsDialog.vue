<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { StudentSearchResult } from '@/types/api';

/**
 * Suma alumnado de cualquier curso a la biblioteca.
 *
 * Una biblioteca puede reunir a gente de grupos distintos, asi que la busqueda recorre
 * todo el centro. Cada resultado muestra en que cursos esta ya, que es lo que permite
 * distinguir a dos alumnos que se llaman parecido.
 */
const props = defineProps<{
  libraryId: string;
  libraryName: string;
}>();

const emit = defineEmits<{
  close: [];
  added: [count: number];
}>();

const search = ref('');
const results = ref<StudentSearchResult[]>([]);
const selected = ref<Set<string>>(new Set());
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const buscado = ref(false);

const campo = ref<HTMLInputElement | null>(null);
onMounted(() => campo.value?.focus());

const disponibles = computed(() => results.value.filter((s) => !s.alreadyIn));
const elegidos = computed(() => selected.value.size);

async function buscar(): Promise<void> {
  const termino = search.value.trim();
  if (termino.length < 2) {
    results.value = [];
    buscado.value = false;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    results.value = await librariesApi.searchStudents(props.libraryId, termino);
    buscado.value = true;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

// Se espera a que deje de escribir: una consulta por tecla no aporta nada.
let temporizador: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void buscar(), 350);
});

function alternar(id: string): void {
  const copia = new Set(selected.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  selected.value = copia;
}

function elegirTodos(): void {
  const ids = disponibles.value.map((s) => s.id);
  const faltan = ids.some((id) => !selected.value.has(id));
  selected.value = faltan ? new Set([...selected.value, ...ids]) : new Set();
}

async function anadir(): Promise<void> {
  if (!elegidos.value) return;
  saving.value = true;
  error.value = null;
  try {
    const resultado = await librariesApi.addStudents(props.libraryId, [...selected.value]);
    emit('added', resultado.added);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9000] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="anadir-alumnos-titulo"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-2xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <h2 id="anadir-alumnos-titulo" class="text-lg font-black text-slate-900">Añadir alumnos</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            Busca en todo el centro y súmalos a <strong>{{ libraryName }}</strong>. Pueden ser de cursos distintos.
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <label class="label" for="buscar-alumno">Nombre o correo</label>
        <input
          id="buscar-alumno"
          ref="campo"
          v-model="search"
          type="search"
          class="input"
          placeholder="Escribe al menos dos letras..."
          autocomplete="off"
        />

        <AlertMessage class="mt-3" :message="error" />

        <p v-if="loading" class="mt-4 text-sm text-slate-500">Buscando...</p>

        <p v-else-if="buscado && !results.length" class="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          Nadie coincide con «{{ search }}». Si el alumno no tiene cuenta todavía, créala desde
          «Agregar alumno» o tráela de Phidias.
        </p>

        <template v-else-if="results.length">
          <div class="mt-4 flex items-center justify-between gap-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {{ results.length }} resultados
            </p>
            <button
              v-if="disponibles.length"
              type="button"
              class="text-xs font-semibold text-brand-600 hover:underline"
              @click="elegirTodos"
            >
              {{ disponibles.every((s) => selected.has(s.id)) ? 'Quitar todos' : 'Elegir todos' }}
            </button>
          </div>

          <ul class="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            <li v-for="alumno in results" :key="alumno.id">
              <label
                class="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-50"
                :class="alumno.alreadyIn ? 'cursor-not-allowed opacity-60' : ''"
              >
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 shrink-0 rounded"
                  :checked="selected.has(alumno.id)"
                  :disabled="alumno.alreadyIn"
                  @change="alternar(alumno.id)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-slate-800">{{ alumno.fullName }}</span>
                  <span v-if="alumno.email" class="block truncate text-xs text-slate-500">{{ alumno.email }}</span>
                  <span v-if="alumno.libraries.length" class="mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="nombre in alumno.libraries"
                      :key="nombre"
                      class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                    >{{ nombre }}</span>
                  </span>
                </span>
                <span
                  v-if="alumno.alreadyIn"
                  class="shrink-0 self-center rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                >Ya está</span>
              </label>
            </li>
          </ul>
        </template>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-slate-200 p-5">
        <p class="text-sm text-slate-500">
          {{ elegidos ? `${elegidos} seleccionados` : 'Ninguno seleccionado' }}
        </p>
        <button type="button" class="btn-primary" :disabled="!elegidos || saving" @click="anadir">
          {{ saving ? 'Añadiendo...' : 'Añadir a la biblioteca' }}
        </button>
      </footer>
    </div>
  </div>
</template>
