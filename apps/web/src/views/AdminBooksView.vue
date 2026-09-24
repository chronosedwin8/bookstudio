<script setup lang="ts">
/**
 * Todos los libros de la plataforma, para borrar en masa.
 *
 * Sirve para limpiar: libros de cuentas de prueba, entregas repetidas, material de
 * cursos pasados. Se busca por titulo, autor o biblioteca, se marcan y se borran
 * de una vez. Como borrar se lleva el trabajo de otras personas, hay que escribir
 * cuantos son antes de confirmar: un "aceptar" se pulsa sin leer.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { AdminBook } from '@/types/api';

useSeo({ title: 'Libros · BookStudio', description: 'Todos los libros de la plataforma.' });

type Ambito = 'all' | 'personal' | 'library' | 'trial';
const AMBITOS: Array<{ id: Ambito; nombre: string }> = [
  { id: 'all', nombre: 'Todos' },
  { id: 'library', nombre: 'En bibliotecas' },
  { id: 'personal', nombre: 'En Mis libros' },
  { id: 'trial', nombre: 'De cuentas de prueba' },
];

const libros = ref<AdminBook[]>([]);
const total = ref(0);
const pagina = ref(1);
const totalPaginas = ref(1);
const porPagina = ref(50);
const busqueda = ref('');
const ambito = ref<Ambito>('all');
const cargando = ref(false);
const borrando = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

/** Lo marcado sobrevive al cambiar de pagina: se puede marcar en varias. */
const marcados = ref(new Map<string, AdminBook>());

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const r = await booksApi.adminList({
      search: busqueda.value.trim() || undefined,
      scope: ambito.value,
      page: pagina.value,
      pageSize: porPagina.value,
    });
    libros.value = r.items;
    total.value = r.total;
    totalPaginas.value = r.totalPages;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

// La busqueda espera a que se deje de escribir: una consulta por tecla sobra.
let temporizador: number | undefined;
watch(busqueda, () => {
  window.clearTimeout(temporizador);
  temporizador = window.setTimeout(() => {
    pagina.value = 1;
    void cargar();
  }, 350);
});
watch([ambito, porPagina], () => {
  pagina.value = 1;
  void cargar();
});
watch(pagina, () => void cargar());

const todaLaPaginaMarcada = computed(
  () => libros.value.length > 0 && libros.value.every((l) => marcados.value.has(l.id)),
);

function alternar(libro: AdminBook): void {
  const m = new Map(marcados.value);
  if (m.has(libro.id)) m.delete(libro.id);
  else m.set(libro.id, libro);
  marcados.value = m;
}

function alternarPagina(): void {
  const m = new Map(marcados.value);
  if (todaLaPaginaMarcada.value) libros.value.forEach((l) => m.delete(l.id));
  else libros.value.forEach((l) => m.set(l.id, l));
  marcados.value = m;
}

async function borrarMarcados(): Promise<void> {
  const cuantos = marcados.value.size;
  if (!cuantos) return;
  const respuesta = window.prompt(
    `Vas a BORRAR ${cuantos} ${cuantos === 1 ? 'libro' : 'libros'} con todas sus páginas, sean de quien sean. ` +
      `No se puede deshacer.\n\nEscribe ${cuantos} para confirmar:`,
  );
  if (respuesta === null) return;
  if (respuesta.trim() !== String(cuantos)) {
    error.value = 'El número no coincide: no se ha borrado nada.';
    return;
  }

  borrando.value = true;
  error.value = null;
  try {
    const r = await booksApi.adminBulkDelete([...marcados.value.keys()]);
    marcados.value = new Map();
    aviso.value = `${r.deleted} ${r.deleted === 1 ? 'libro borrado' : 'libros borrados'}` +
      (r.ignored ? ` · ${r.ignored} ya no existían` : '');
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    borrando.value = false;
  }
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8">
    <header>
      <h1 class="text-2xl font-black text-slate-900">Libros</h1>
      <p class="mt-1 text-sm text-slate-600">
        Todos los libros de la plataforma. Busca, marca los que sobran y bórralos de una vez.
      </p>
    </header>

    <div class="mt-4 space-y-2">
      <AlertMessage :message="error" />
      <AlertMessage :message="aviso" variant="success" />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <input
        v-model="busqueda"
        type="search"
        class="input min-w-[14rem] flex-1"
        placeholder="Buscar por título, autor, correo o biblioteca"
        aria-label="Buscar libros"
      />
      <select v-model="ambito" class="input w-auto py-1.5" aria-label="Qué libros">
        <option v-for="a in AMBITOS" :key="a.id" :value="a.id">{{ a.nombre }}</option>
      </select>
      <select v-model.number="porPagina" class="input w-auto py-1.5" aria-label="Libros por página">
        <option :value="25">25 por página</option>
        <option :value="50">50 por página</option>
        <option :value="100">100 por página</option>
      </select>
    </div>

    <!-- Barra de borrado: siempre a la vista, con lo marcado en todas las paginas -->
    <div class="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
      <span class="text-sm text-slate-700">
        <strong>{{ marcados.size }}</strong> {{ marcados.size === 1 ? 'marcado' : 'marcados' }}
        <span class="text-slate-400">· {{ total }} {{ total === 1 ? 'libro' : 'libros' }} en total</span>
      </span>
      <button
        v-if="marcados.size"
        type="button"
        class="text-xs font-semibold text-slate-500 hover:underline"
        @click="marcados = new Map()"
      >Desmarcar todo</button>
      <button
        type="button"
        class="btn-danger ml-auto"
        :disabled="!marcados.size || borrando"
        @click="borrarMarcados"
      >{{ borrando ? 'Borrando...' : `Borrar ${marcados.size || ''} marcados` }}</button>
    </div>

    <p v-if="cargando && !libros.length" class="mt-6 text-sm text-slate-500">Cargando...</p>
    <p v-else-if="!libros.length" class="card mt-4 p-8 text-center text-sm text-slate-500">
      No hay libros que coincidan.
    </p>

    <div v-else class="card mt-3 overflow-x-auto" :class="cargando && 'opacity-60'">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="w-10 px-3 py-2">
              <input
                type="checkbox"
                class="h-4 w-4 rounded"
                :checked="todaLaPaginaMarcada"
                aria-label="Marcar toda la página"
                @change="alternarPagina"
              />
            </th>
            <th class="px-3 py-2">Libro</th>
            <th class="px-3 py-2">Autor</th>
            <th class="px-3 py-2">Dónde</th>
            <th class="px-3 py-2 text-right">Págs.</th>
            <th class="px-3 py-2">Modificado</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr
            v-for="libro in libros"
            :key="libro.id"
            class="cursor-pointer hover:bg-slate-50"
            :class="marcados.has(libro.id) && 'bg-red-50 hover:bg-red-50'"
            @click="alternar(libro)"
          >
            <td class="px-3 py-2" @click.stop>
              <input
                type="checkbox"
                class="h-4 w-4 rounded"
                :checked="marcados.has(libro.id)"
                :aria-label="`Marcar ${libro.title}`"
                @change="alternar(libro)"
              />
            </td>
            <td class="px-3 py-2">
              <RouterLink
                :to="{ name: 'book-reader', params: { id: libro.id } }"
                class="font-semibold text-slate-900 hover:text-brand-600"
                @click.stop
              >{{ libro.title }}</RouterLink>
            </td>
            <td class="px-3 py-2">
              <span class="block text-slate-800">{{ libro.creatorName ?? '—' }}</span>
              <span class="block text-xs text-slate-500">
                {{ libro.creatorEmail }}
                <span v-if="libro.isTrial" class="ml-1 rounded bg-amber-100 px-1 text-amber-800">prueba</span>
              </span>
            </td>
            <td class="px-3 py-2 text-xs">
              <span v-if="libro.libraryName" class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{{ libro.libraryName }}</span>
              <span v-else class="text-slate-500">Mis libros</span>
            </td>
            <td class="px-3 py-2 text-right tabular-nums text-slate-700">{{ libro.pageCount }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{{ fecha(libro.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="totalPaginas > 1" class="mt-4 flex items-center justify-center gap-2" aria-label="Páginas">
      <button type="button" class="btn-secondary" :disabled="pagina <= 1" @click="pagina -= 1">Anterior</button>
      <span class="text-sm text-slate-600">Página {{ pagina }} de {{ totalPaginas }}</span>
      <button type="button" class="btn-secondary" :disabled="pagina >= totalPaginas" @click="pagina += 1">Siguiente</button>
    </nav>
  </main>
</template>
