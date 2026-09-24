<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import type { Book, LayoutFormat, Library } from '@/types/api';

/**
 * Las bibliotecas del panel: buscar, ordenar, elegir como se ven y paginar.
 *
 * Con cuatro bibliotecas bastaba una rejilla de tarjetas. Un docente con todos sus
 * grupos del año, o la administracion viendo el colegio entero, tiene decenas: sin
 * buscador ni orden habia que recorrer la pagina a ojo.
 *
 * Todo se hace aqui, sin ir al servidor: la lista ya esta cargada entera y filtrar
 * unos cientos de nombres es instantaneo. La vista, el orden y el tamano de pagina
 * se recuerdan en este navegador.
 */
const props = defineProps<{
  libraries: Library[];
  booksByLibrary: Map<string, Book[]>;
  currentUserId?: string;
}>();

defineEmits<{ remove: [library: Library] }>();

const ASPECT: Record<LayoutFormat, number> = { square: 1, portrait: 3 / 4, landscape: 4 / 3 };

type Vista = 'tarjetas' | 'lista' | 'compacta';
type Orden = 'nombre-asc' | 'nombre-desc' | 'recientes' | 'antiguas';

const VISTAS: Array<{ id: Vista; nombre: string; icono: string }> = [
  { id: 'tarjetas', nombre: 'Tarjetas', icono: '▦' },
  { id: 'lista', nombre: 'Lista', icono: '☰' },
  { id: 'compacta', nombre: 'Compacta', icono: '≡' },
];

const ORDENES: Array<{ id: Orden; nombre: string }> = [
  { id: 'nombre-asc', nombre: 'Nombre (A → Z)' },
  { id: 'nombre-desc', nombre: 'Nombre (Z → A)' },
  { id: 'recientes', nombre: 'Más recientes' },
  { id: 'antiguas', nombre: 'Más antiguas' },
];

/** Por vista: en tarjetas caben menos por pantalla que en una lista. */
const POR_PAGINA: Record<Vista, number> = { tarjetas: 12, lista: 25, compacta: 40 };

const CLAVE = 'bookstudio:bibliotecas';

function leerPreferencias(): { vista: Vista; orden: Orden } {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<{ vista: Vista; orden: Orden }>;
    return {
      vista: VISTAS.some((v) => v.id === guardado.vista) ? guardado.vista! : 'tarjetas',
      orden: ORDENES.some((o) => o.id === guardado.orden) ? guardado.orden! : 'nombre-asc',
    };
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): se usa lo de siempre.
    return { vista: 'tarjetas', orden: 'nombre-asc' };
  }
}

const inicial = leerPreferencias();
const vista = ref<Vista>(inicial.vista);
const orden = ref<Orden>(inicial.orden);
const busqueda = ref('');
const pagina = ref(1);

watch([vista, orden], () => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ vista: vista.value, orden: orden.value }));
  } catch {
    // No recordarlo no es un fallo.
  }
});

/** Sin tildes ni mayusculas: "matematicas" encuentra "Matemáticas". */
const plano = (t: string): string => t.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

/*
 * Orden natural: "K8" antes que "K10". Con un orden alfabetico a secas saldria
 * K10, K11, K12, K8, que es justo lo contrario de como se piensa en cursos.
 */
const colacion = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

const filtradas = computed(() => {
  const q = plano(busqueda.value.trim());
  const lista = q
    ? props.libraries.filter((l) => plano(l.name).includes(q) || l.codeInvite.toLowerCase().includes(q))
    : [...props.libraries];

  switch (orden.value) {
    case 'nombre-asc':
      return lista.sort((a, b) => colacion.compare(a.name, b.name));
    case 'nombre-desc':
      return lista.sort((a, b) => colacion.compare(b.name, a.name));
    case 'recientes':
      return lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'antiguas':
      return lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
});

const porPagina = computed(() => POR_PAGINA[vista.value]);
const totalPaginas = computed(() => Math.max(1, Math.ceil(filtradas.value.length / porPagina.value)));

// Buscar, reordenar o cambiar de vista vuelve al principio: seguir en la pagina 4
// de una busqueda que ahora tiene dos resultados dejaria la pantalla vacia.
watch([busqueda, orden, vista], () => {
  pagina.value = 1;
});
// Y si se borra una biblioteca y la ultima pagina se queda vacia, se retrocede.
watch(totalPaginas, (total) => {
  if (pagina.value > total) pagina.value = total;
});

const visibles = computed(() =>
  filtradas.value.slice((pagina.value - 1) * porPagina.value, pagina.value * porPagina.value),
);

const librosDe = (id: string): number => props.booksByLibrary.get(id)?.length ?? 0;
const esMia = (l: Library): boolean => l.ownerId === props.currentUserId;

const fecha = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<template>
  <section class="mt-6">
    <!-- Barra: buscar, ordenar y elegir vista -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="relative min-w-[12rem] flex-1">
        <span class="sr-only">Buscar biblioteca</span>
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
        <input
          v-model="busqueda"
          type="search"
          class="input pl-8"
          placeholder="Buscar por nombre o código"
        />
      </label>

      <label class="flex items-center gap-1.5 text-sm text-slate-600">
        <span class="hidden sm:inline">Ordenar</span>
        <select v-model="orden" class="input w-auto py-1.5" aria-label="Ordenar bibliotecas">
          <option v-for="o in ORDENES" :key="o.id" :value="o.id">{{ o.nombre }}</option>
        </select>
      </label>

      <div class="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Cómo ver las bibliotecas">
        <button
          v-for="v in VISTAS"
          :key="v.id"
          type="button"
          class="px-3 py-1.5 text-sm transition"
          :class="vista === v.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
          :aria-pressed="vista === v.id"
          :title="`Ver en ${v.nombre.toLowerCase()}`"
          @click="vista = v.id"
        >
          <span aria-hidden="true">{{ v.icono }}</span>
          <span class="ml-1 hidden md:inline">{{ v.nombre }}</span>
        </button>
      </div>
    </div>

    <p class="mt-2 text-xs text-slate-500">
      <template v-if="busqueda.trim()">
        {{ filtradas.length }} de {{ libraries.length }} bibliotecas coinciden con «{{ busqueda.trim() }}»
      </template>
      <template v-else>{{ libraries.length }} {{ libraries.length === 1 ? 'biblioteca' : 'bibliotecas' }}</template>
    </p>

    <p v-if="!filtradas.length" class="card mt-4 p-8 text-center text-sm text-slate-500">
      Ninguna biblioteca coincide con «{{ busqueda.trim() }}».
      <button type="button" class="ml-1 font-semibold text-brand-600 hover:underline" @click="busqueda = ''">
        Ver todas
      </button>
    </p>

    <!-- Tarjetas: con la estanteria de portadas -->
    <ul v-else-if="vista === 'tarjetas'" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="library in visibles" :key="library.id" class="card flex flex-col overflow-hidden">
        <RouterLink
          :to="{ name: 'library', params: { id: library.id } }"
          class="flex h-28 items-end gap-1.5 bg-slate-800 px-3 pt-3"
          :title="`Abrir ${library.name}`"
        >
          <template v-if="booksByLibrary.get(library.id)?.length">
            <div
              v-for="book in booksByLibrary.get(library.id)!.slice(0, 4)"
              :key="book.id"
              class="overflow-hidden rounded-t border border-b-0 border-slate-600 bg-white shadow"
            >
              <PagePreview
                v-if="book.cover"
                :background-color="book.cover.backgroundColor"
                :elements="book.cover.elements"
                :aspect-ratio="ASPECT[book.layoutFormat]"
                :width="52"
              />
              <div v-else class="h-[68px] w-[52px] bg-white" />
            </div>
          </template>
          <p v-else class="w-full pb-3 text-center text-xs text-slate-400">Biblioteca vacía</p>
        </RouterLink>

        <div class="flex flex-1 flex-col p-5">
          <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="font-bold text-slate-900 hover:text-brand-600">
            {{ library.name }}
          </RouterLink>

          <p class="mt-2 text-xs text-slate-500">Código de invitación</p>
          <p class="font-mono text-lg font-black tracking-widest text-brand-700">{{ library.codeInvite }}</p>

          <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
            <span class="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
              {{ librosDe(library.id) }} de {{ library.studentBookLimit }} libros
            </span>
            <span v-if="library.studentEditable" class="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Edición alumnos</span>
            <span v-if="library.studentPublishable" class="rounded bg-brand-100 px-2 py-0.5 text-brand-700">Publicable</span>
          </div>

          <div class="mt-auto flex gap-2 border-t border-slate-100 pt-3">
            <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="btn-secondary flex-1">Abrir</RouterLink>
            <button v-if="esMia(library)" type="button" class="btn-danger" @click="$emit('remove', library)">
              Eliminar
            </button>
          </div>
        </div>
      </li>
    </ul>

    <!-- Lista: una fila por biblioteca, con sus datos en columnas -->
    <div v-else-if="vista === 'lista'" class="card mt-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-2">Biblioteca</th>
            <th class="px-4 py-2">Código</th>
            <th class="px-4 py-2 text-right">Libros</th>
            <th class="px-4 py-2">Alumnado</th>
            <th class="px-4 py-2">Creada</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="library in visibles" :key="library.id" class="hover:bg-slate-50">
            <td class="px-4 py-2">
              <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="font-semibold text-slate-900 hover:text-brand-600">
                {{ library.name }}
              </RouterLink>
            </td>
            <td class="px-4 py-2 font-mono font-bold tracking-widest text-brand-700">{{ library.codeInvite }}</td>
            <td class="px-4 py-2 text-right tabular-nums text-slate-700">{{ librosDe(library.id) }}</td>
            <td class="px-4 py-2 text-xs">
              <span v-if="library.studentEditable" class="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Edita</span>
              <span v-if="library.studentPublishable" class="rounded bg-brand-100 px-1.5 py-0.5 text-brand-700">Publica</span>
              <span v-if="!library.studentEditable && !library.studentPublishable" class="text-slate-400">Solo lectura</span>
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{{ fecha(library.createdAt) }}</td>
            <td class="px-4 py-2 text-right">
              <span class="flex justify-end gap-3">
                <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="text-xs font-semibold text-brand-600 hover:underline">
                  Abrir
                </RouterLink>
                <button
                  v-if="esMia(library)"
                  type="button"
                  class="text-xs font-semibold text-red-600 hover:underline"
                  @click="$emit('remove', library)"
                >Eliminar</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Compacta: solo nombres, para cuando hay muchas -->
    <ul v-else class="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
      <li v-for="library in visibles" :key="library.id">
        <RouterLink
          :to="{ name: 'library', params: { id: library.id } }"
          class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-brand-400 hover:bg-brand-50"
          :title="`Abrir ${library.name}`"
        >
          <span class="truncate font-medium text-slate-800">{{ library.name }}</span>
          <span class="shrink-0 rounded bg-slate-100 px-1.5 text-xs tabular-nums text-slate-500">{{ librosDe(library.id) }}</span>
        </RouterLink>
      </li>
    </ul>

    <!-- Paginacion -->
    <nav v-if="totalPaginas > 1" class="mt-4 flex items-center justify-center gap-2" aria-label="Páginas de bibliotecas">
      <button type="button" class="btn-secondary" :disabled="pagina <= 1" @click="pagina -= 1">Anterior</button>
      <span class="text-sm text-slate-600">Página {{ pagina }} de {{ totalPaginas }}</span>
      <button type="button" class="btn-secondary" :disabled="pagina >= totalPaginas" @click="pagina += 1">Siguiente</button>
    </nav>
  </section>
</template>
