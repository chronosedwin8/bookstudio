<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookSpread from '@/components/canvas/BookSpread.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { SharedBook } from '@/types/api';

const route = useRoute();
const auth = useAuthStore();

/** La misma vista sirve /books/:id/read (con sesion) y /leer/:token (enlace). */
const shareToken = computed(() => (route.params.token as string | undefined) ?? null);

const ASPECT = { square: 1, portrait: 3 / 4, landscape: 4 / 3 } as const;

const book = ref<SharedBook | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const index = ref(0);
const showPages = ref(false);

/** El libro abierto; se le pide pasar de hoja para que la animacion sea la suya. */
const libro = ref<InstanceType<typeof BookSpread> | null>(null);

const stage = ref<HTMLElement | null>(null);
const stageSize = ref({ width: 0, height: 0 });

const aspectRatio = computed(() => (book.value ? ASPECT[book.value.layoutFormat] : 1));
const pages = computed(() => book.value?.pages ?? []);

/*
 * Los extremos los decide el libro, no el indice de pagina: a doble pagina la
 * ultima vista puede contener dos, asi que "estar en la ultima pagina" y "no poder
 * avanzar" dejaron de ser lo mismo.
 */
const isFirst = computed(() => libro.value?.hayAnterior !== true);
const isLast = computed(() => libro.value?.haySiguiente !== true);

/** Pasar de hoja lo hace el libro, que es quien sabe animarlo. */
function turn(step: number): void {
  libro.value?.pasar(step > 0 ? 1 : -1);
}

/**
 * Salto desde un marcador dentro del libro.
 *
 * El marcador guarda el numero de pagina que ve el lector (la portada es la 1), no
 * el indice interno, para que siga apuntando bien aunque se reordenen las paginas.
 */
function irAPaginaNumero(numero: number): void {
  const destino = (book.value?.pages ?? []).findIndex((p) => p.pageNumber === numero);
  if (destino >= 0) goTo(destino);
}

/**
 * Rotulo del pie. A doble pagina se ven dos a la vez, asi que decir "pagina 3" de
 * un pliego 3-4 seria mentir a medias.
 */
const rotuloPagina = computed(() => {
  const visibles = libro.value?.paginasVisibles ?? [];
  if (!visibles.length) return 'Portada';
  if (visibles.length === 1) return visibles[0] === 1 ? 'Portada' : `Página ${visibles[0]}`;
  return `Páginas ${visibles[0]}-${visibles[visibles.length - 1]}`;
});

/** Salto directo (miniaturas, marcadores, inicio y fin): sin giro, seria falso. */
function goTo(target: number): void {
  index.value = target;
  showPages.value = false;
}

/**
 * Corrige una pregunta. Va al servidor a proposito: las opciones que llegaron al
 * navegador no traen la marca de correcta, asi que la solucion no es inspeccionable.
 */
async function checkAnswer(elementId: string, answer: string[]) {
  return shareToken.value
    ? booksApi.answerSharedQuestion(shareToken.value, elementId, answer)
    : booksApi.answerQuestion(book.value!.id, elementId, answer);
}

function onKeydown(event: KeyboardEvent): void {
  const actions: Record<string, () => void> = {
    ArrowRight: () => turn(1),
    ArrowDown: () => turn(1),
    PageDown: () => turn(1),
    ' ': () => turn(1),
    ArrowLeft: () => turn(-1),
    ArrowUp: () => turn(-1),
    PageUp: () => turn(-1),
    Home: () => goTo(0),
    End: () => goTo(pages.value.length - 1),
    Escape: () => (showPages.value = false),
  };
  const action = actions[event.key];
  if (!action) return;

  // Dentro de un campo o de un bloque de pregunta el teclado es para el elemento.
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;

  event.preventDefault();
  action();
}

const isFullscreen = ref(false);

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}

function syncFullscreen(): void {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

let observer: ResizeObserver | undefined;

/**
 * Hueco real para el libro.
 *
 * Se descuenta el relleno: clientHeight lo incluye, asi que dar esa altura por
 * disponible hacia que el libro se pasara justo de lo que cabe y el contenedor le
 * recortara los bordes.
 */
function measure(): void {
  const el = stage.value;
  if (!el) return;
  const estilo = getComputedStyle(el);
  const relleno = (a: string, b: string) => parseFloat(estilo[a as never]) + parseFloat(estilo[b as never]);
  stageSize.value = {
    width: Math.max(0, el.clientWidth - relleno('paddingLeft', 'paddingRight')),
    height: Math.max(0, el.clientHeight - relleno('paddingTop', 'paddingBottom')),
  };
}

/**
 * El escenario vive dentro de un v-if, asi que no existe hasta que Vue vuelve a
 * renderizar. Medirlo en onMounted dejaba el ancho en 0 y la pagina no se pintaba:
 * el watcher espera a que la referencia apunte a un elemento real.
 */
watch(stage, (el) => {
  observer?.disconnect();
  observer = undefined;
  if (!el) return;
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
});

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', syncFullscreen);

  try {
    book.value = shareToken.value
      ? await booksApi.getShared(shareToken.value)
      : ((await booksApi.get(route.params.id as string)) as SharedBook);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  observer?.disconnect();
});
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden bg-slate-900">
    <p v-if="loading" class="p-8 text-sm text-slate-300">Abriendo el libro...</p>

    <div v-else-if="error" class="p-8">
      <AlertMessage :message="error" />
      <RouterLink
        :to="auth.isAuthenticated ? { name: 'dashboard' } : { name: 'login' }"
        class="btn-secondary mt-4 inline-flex"
      >{{ auth.isAuthenticated ? 'Volver' : 'Iniciar sesión' }}</RouterLink>
    </div>

    <template v-else-if="book">
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-slate-800 px-4 py-2 text-white">
        <div class="flex min-w-0 items-center gap-3">
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="{ name: 'dashboard' }"
            class="shrink-0 text-sm text-slate-300 hover:text-white"
          >&larr; Salir</RouterLink>
          <span v-else class="shrink-0 font-black text-brand-400">BookStudio</span>

          <div class="min-w-0">
            <h1 class="truncate font-bold">{{ book.title }}</h1>
            <p v-if="book.authorName" class="truncate text-xs text-slate-400">por {{ book.authorName }}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
            @click="showPages = !showPages"
          >Páginas</button>
          <button
            type="button"
            class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
            @click="toggleFullscreen"
          >{{ isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa' }}</button>
          <RouterLink
            v-if="book.permissions.canEdit"
            :to="{ name: 'book-editor', params: { id: book.id } }"
            class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
          >Editar</RouterLink>

          <RouterLink
            v-else-if="!auth.isAuthenticated"
            :to="{ name: 'login' }"
            class="rounded px-2 py-1 text-sm text-brand-300 hover:bg-slate-700 hover:text-white"
          >Entrar</RouterLink>
        </div>
      </header>

      <!-- Escenario: la página ocupa todo el hueco disponible -->
      <!--
        Sin items-center (es decir, con el stretch por defecto) el escenario ocupa
        todo el alto de la fila. Con items-center su altura la marcaba su propio
        contenido, que se calcula a partir de esa altura: el bucle hacia crecer la
        página sin limite hasta desbordar la ventana.
      -->
      <div class="relative flex min-h-0 flex-1 gap-2 px-2">
        <button
          type="button"
          class="z-10 grid h-16 w-12 shrink-0 self-center place-items-center rounded-lg text-3xl text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
          :disabled="isFirst"
          aria-label="Página anterior"
          @click="turn(-1)"
        >‹</button>

        <!--
          Sin overflow-hidden: al girar, la hoja se sale del ancho del libro por la
          propia perspectiva, y recortarla ahi delataba el truco. El contenedor de
          arriba ya impide que nada se escape de la ventana.
        -->
        <div ref="stage" class="grid min-h-0 min-w-0 flex-1 place-items-center py-3">
          <BookSpread
            ref="libro"
            v-model="index"
            :pages="pages"
            :aspect-ratio="aspectRatio"
            :available="stageSize"
            :check-answer="checkAnswer"
            @ir-a-pagina="irAPaginaNumero"
          />
        </div>

        <button
          type="button"
          class="z-10 grid h-16 w-12 shrink-0 self-center place-items-center rounded-lg text-3xl text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
          :disabled="isLast"
          aria-label="Página siguiente"
          @click="turn(1)"
        >›</button>
      </div>

      <footer class="shrink-0 bg-slate-800 px-4 py-2 text-center text-sm text-slate-300">
        <span class="tabular-nums">
          {{ rotuloPagina }} de {{ pages.length }}
        </span>
        <span class="ml-3 hidden text-xs text-slate-500 sm:inline">
          Usa las flechas del teclado para pasar de página
        </span>
      </footer>

      <!-- Rejilla de páginas -->
      <div
        v-if="showPages"
        class="absolute inset-0 z-20 overflow-y-auto bg-slate-900/95 p-6"
        @click.self="showPages = false"
      >
        <div class="mx-auto max-w-6xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-bold text-white">Páginas de "{{ book.title }}"</h2>
            <button type="button" class="btn-secondary" @click="showPages = false">Cerrar</button>
          </div>

          <ul class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <li v-for="(page, i) in pages" :key="page.id">
              <button
                type="button"
                class="w-full overflow-hidden rounded-lg border-2 bg-white transition hover:scale-[1.02]"
                :class="i === index ? 'border-brand-400' : 'border-transparent'"
                @click="goTo(i)"
              >
                <div class="w-full" :style="{ aspectRatio: `${aspectRatio}` }">
                  <PagePreview
                    :background-color="page.backgroundColor"
                    :background-pattern="page.backgroundPattern"
                    :elements="page.elements"
                    :aspect-ratio="aspectRatio"
                    :width="190"
                  />
                </div>
                <span class="block bg-white py-1 text-xs font-semibold text-slate-600">
                  {{ i === 0 ? 'Portada' : page.pageNumber }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * El paso de hoja vive en BookSpread, que es quien conoce el lomo y las dos caras
 * del papel. Aqui solo queda el escenario, que se limita a centrar el libro y a
 * medir el hueco del que dispone.
 */
</style>
