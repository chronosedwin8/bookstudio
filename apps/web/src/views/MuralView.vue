<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import { muralApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { MuralBook } from '@/types/api';

/**
 * Mural: la vitrina publica de los libros que el profesorado decide ensenar.
 *
 * Se ve sin cuenta a proposito. Es la pagina que se le pasa a una familia o se
 * proyecta en una jornada de puertas abiertas, y pedir registro para eso la
 * dejaria sin sentido.
 */
const auth = useAuthStore();

const libros = ref<MuralBook[]>([]);
const total = ref(0);
const pagina = ref(1);
const totalPaginas = ref(1);
const busqueda = ref('');
const cargando = ref(false);
const error = ref<string | null>(null);

const RATIO = { portrait: 3 / 4, square: 1, landscape: 4 / 3 } as const;

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const datos = await muralApi.list({ page: pagina.value, search: busqueda.value.trim() || undefined });
    libros.value = datos.items;
    total.value = datos.total;
    totalPaginas.value = datos.totalPages;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

/**
 * La busqueda espera a que se deje de teclear. Sin esto se lanzaba una consulta
 * por letra y las respuestas llegaban desordenadas.
 */
let temporizador: ReturnType<typeof setTimeout> | undefined;
watch(busqueda, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    pagina.value = 1;
    void cargar();
  }, 350);
});

function irA(n: number): void {
  if (n < 1 || n > totalPaginas.value) return;
  pagina.value = n;
  void cargar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const resumen = computed(() => {
  if (cargando.value) return 'Cargando...';
  if (!total.value) return busqueda.value.trim() ? 'No hay libros que coincidan.' : 'Aún no hay libros publicados.';
  return `${total.value} ${total.value === 1 ? 'libro publicado' : 'libros publicados'}`;
});

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
</script>

<template>
  <div class="min-h-full bg-slate-50">
    <!--
      Cabecera propia SOLO para quien llega sin sesion. Con sesion, la aplicacion
      ya pinta la suya arriba y salian dos, una debajo de otra.
    -->
    <header v-if="!auth.isAuthenticated" class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <RouterLink to="/" class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-bold text-white">B</span>
          <span class="text-lg font-bold text-slate-800">BookStudio</span>
        </RouterLink>
        <RouterLink to="/login" class="btn-secondary py-1.5 text-sm">Entrar</RouterLink>
      </div>
    </header>

    <section class="border-b border-slate-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-8">
        <h1 class="text-3xl font-bold text-slate-800">Mural</h1>
        <p class="mt-1 max-w-2xl text-sm text-slate-500">
          Libros que el profesorado ha decidido publicar. Se abren sin necesidad de
          tener cuenta.
        </p>
        <input
          v-model="busqueda"
          type="search"
          class="input mt-4 max-w-md"
          placeholder="Buscar por título o autoría"
          aria-label="Buscar en el mural"
        />
      </div>
    </section>

    <main class="mx-auto max-w-6xl px-4 py-8">
      <AlertMessage v-if="error" :message="error" />

      <p class="mb-4 text-sm text-slate-500">{{ resumen }}</p>

      <ul v-if="libros.length" class="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        <li v-for="libro in libros" :key="libro.id">
          <a
            :href="`/leer/${libro.shareToken}`"
            class="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm
                   transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div class="overflow-hidden bg-slate-100" :style="{ aspectRatio: String(RATIO[libro.layoutFormat]) }">
              <!-- La portada se pinta con el mismo lienzo que el editor, sin
                   interactividad: es una miniatura, no un libro abierto. -->
              <PagePreview
                v-if="libro.cover"
                :background-color="libro.cover.backgroundColor"
                :background-pattern="libro.cover.backgroundPattern"
                :elements="libro.cover.elements"
                :aspect-ratio="RATIO[libro.layoutFormat]"
                :width="300"
                class="w-full"
              />
              <div v-else class="grid h-full place-items-center text-3xl text-slate-300">📕</div>
            </div>

            <div class="p-3">
              <h2 class="truncate font-semibold text-slate-800 group-hover:text-brand-700">
                {{ libro.title }}
              </h2>
              <p v-if="libro.authorName" class="truncate text-xs text-slate-500">
                {{ libro.authorName }}
              </p>
              <p class="mt-1 text-[11px] text-slate-400">
                {{ libro.pageCount }} {{ libro.pageCount === 1 ? 'página' : 'páginas' }} ·
                {{ fecha(libro.publishedAt) }}
              </p>
              <p v-if="libro.libraryName" class="truncate text-[11px] text-slate-400">
                {{ libro.libraryName }}
              </p>
            </div>
          </a>
        </li>
      </ul>

      <nav v-if="totalPaginas > 1" class="mt-8 flex items-center justify-center gap-3">
        <button type="button" class="btn-secondary py-1 text-sm" :disabled="pagina === 1" @click="irA(pagina - 1)">
          Anterior
        </button>
        <span class="text-sm text-slate-500">Página {{ pagina }} de {{ totalPaginas }}</span>
        <button
          type="button" class="btn-secondary py-1 text-sm"
          :disabled="pagina === totalPaginas" @click="irA(pagina + 1)"
        >Siguiente</button>
      </nav>
    </main>
  </div>
</template>
