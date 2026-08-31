<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { DistributeResult, LibraryMembers, Page } from '@/types/api';

/**
 * Entrega material al alumnado de la biblioteca.
 *
 * Cada alumno recibe su propia copia, editable y a su nombre. Al repartir mas paginas
 * del mismo material se anaden al libro que ya tiene, en vez de dejarle uno nuevo por
 * cada envio.
 */
const props = defineProps<{
  libraryId: string;
  libraryName: string;
  sourceBookId: string;
  sourceTitle: string;
  /** Paginas del libro de origen, para poder mandar solo una. */
  pages?: Page[];
  /** Pagina abierta cuando se llama desde el editor. */
  currentPageId?: string;
}>();

const emit = defineEmits<{
  close: [];
  done: [result: DistributeResult];
}>();

type Alcance = 'libro' | 'pagina';

const alcance = ref<Alcance>(props.currentPageId ? 'pagina' : 'libro');
const pageId = ref<string>(props.currentPageId ?? props.pages?.[0]?.id ?? '');
const titulo = ref(props.sourceTitle);

const members = ref<LibraryMembers | null>(null);
const aTodos = ref(true);
const selected = ref<Set<string>>(new Set());

const loading = ref(true);
const sending = ref(false);
const error = ref<string | null>(null);

const alumnos = computed(() => members.value?.students ?? []);
const destinatarios = computed(() => (aTodos.value ? alumnos.value.length : selected.value.size));
const puedeEnviar = computed(
  () => destinatarios.value > 0 && (alcance.value === 'libro' || Boolean(pageId.value)) && !sending.value,
);

onMounted(async () => {
  try {
    members.value = await librariesApi.members(props.libraryId);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});

function alternar(id: string): void {
  const copia = new Set(selected.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  selected.value = copia;
}

const etiquetaPagina = (pagina: Page, indice: number) =>
  indice === 0 ? 'Portada' : `Página ${pagina.pageNumber}`;

async function enviar(): Promise<void> {
  sending.value = true;
  error.value = null;
  try {
    const resultado = await librariesApi.distribute(props.libraryId, {
      sourceBookId: props.sourceBookId,
      pageId: alcance.value === 'pagina' ? pageId.value : undefined,
      studentIds: aTodos.value ? undefined : [...selected.value],
      title: titulo.value.trim() || undefined,
    });
    emit('done', resultado);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="entregar-titulo"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-2xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
          <h2 id="entregar-titulo" class="text-lg font-black text-slate-900">Entregar a los alumnos</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            Cada alumno de <strong>{{ libraryName }}</strong> recibe su propia copia para trabajar sobre ella.
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="space-y-6 p-5">
        <AlertMessage :message="error" />

        <!-- Qué se entrega -->
        <fieldset>
          <legend class="text-xs font-bold uppercase tracking-wide text-slate-500">Qué entregas</legend>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
              :class="alcance === 'libro' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
            >
              <input v-model="alcance" type="radio" value="libro" class="mt-1 h-4 w-4" />
              <span>
                <span class="block text-sm font-semibold text-slate-800">El libro entero</span>
                <span class="block text-xs text-slate-500">
                  {{ pages?.length ?? 0 }} páginas, tal y como está ahora.
                </span>
              </span>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3"
              :class="alcance === 'pagina' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
            >
              <input v-model="alcance" type="radio" value="pagina" class="mt-1 h-4 w-4" :disabled="!pages?.length" />
              <span>
                <span class="block text-sm font-semibold text-slate-800">Una sola página</span>
                <span class="block text-xs text-slate-500">Se añade al final de lo que ya tengan.</span>
              </span>
            </label>
          </div>

          <select v-if="alcance === 'pagina' && pages?.length" v-model="pageId" class="input mt-2" aria-label="Página a entregar">
            <option v-for="(pagina, indice) in pages" :key="pagina.id" :value="pagina.id">
              {{ etiquetaPagina(pagina, indice) }}
            </option>
          </select>
        </fieldset>

        <!-- Nombre del libro que recibirán -->
        <div>
          <label class="label" for="entregar-titulo-libro">Título del libro que recibirán</label>
          <input id="entregar-titulo-libro" v-model="titulo" type="text" maxlength="255" class="input" />
          <p class="mt-1 text-xs text-slate-500">
            Si vuelves a entregar más páginas de este mismo material, caerán en este libro y no en uno nuevo.
          </p>
        </div>

        <!-- A quién -->
        <fieldset>
          <legend class="text-xs font-bold uppercase tracking-wide text-slate-500">A quién</legend>

          <p v-if="loading" class="mt-2 text-sm text-slate-500">Cargando alumnos...</p>

          <p v-else-if="!alumnos.length" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Esta biblioteca todavía no tiene alumnos. Añádelos antes de entregar material.
          </p>

          <template v-else>
            <label class="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input v-model="aTodos" type="checkbox" class="h-4 w-4 rounded" />
              Toda la clase ({{ alumnos.length }} alumnos)
            </label>

            <ul
              v-if="!aTodos"
              class="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
            >
              <li v-for="alumno in alumnos" :key="alumno.id">
                <label class="flex cursor-pointer items-center gap-3 p-2.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 rounded"
                    :checked="selected.has(alumno.id)"
                    @change="alternar(alumno.id)"
                  />
                  <span class="min-w-0 flex-1 truncate text-slate-800">{{ alumno.fullName }}</span>
                </label>
              </li>
            </ul>
          </template>
        </fieldset>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-slate-200 p-5">
        <p class="text-sm text-slate-500">
          {{ destinatarios ? `${destinatarios} destinatarios` : 'Nadie seleccionado' }}
        </p>
        <button type="button" class="btn-primary" :disabled="!puedeEnviar" @click="enviar">
          {{ sending ? 'Entregando...' : 'Entregar' }}
        </button>
      </footer>
    </div>
  </div>
</template>
