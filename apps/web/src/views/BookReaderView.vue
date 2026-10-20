<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookSpread from '@/components/canvas/BookSpread.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import BookGradesPanel from '@/components/library/BookGradesPanel.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { ordenarPorAlumno, tituloConAutor } from '@/utils/ordenAlumnos';
import type { Book, SharedBook } from '@/types/api';

const route = useRoute();
const router = useRouter();
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

/**
 * A donde lleva "Salir": a la biblioteca de la que se abrio el libro.
 *
 * Primero la pagina de la que se vino, si era una biblioteca: un libro repartido
 * puede estar en varias y hay que volver a la que se estaba mirando. Si no, la
 * biblioteca del propio libro. Por enlace compartido no se supone ninguna: quien
 * lo abre puede no ser miembro. Antes llevaba siempre a la raiz de la cuenta.
 */
const salida = computed(() => {
  const atras = (window.history.state as { back?: unknown } | null)?.back;
  if (typeof atras === 'string' && /^\/libraries\/[^/?#]+/.test(atras)) return atras;
  if (!shareToken.value && book.value?.libraryId) {
    return { name: 'library', params: { id: book.value.libraryId } };
  }
  return { name: 'dashboard' };
});

/* ---------------------------------------------------------------------------
 * Revisar una biblioteca libro a libro
 *
 * El docente abre el libro de un alumno, lo lee, lo valora y pasa al siguiente
 * sin volver a la lista. El orden es el de la lista de la biblioteca: por
 * apellidos. Solo para quien gestiona la biblioteca del libro.
 * ------------------------------------------------------------------------ */

/** Los libros de la biblioteca, por apellidos; vacio si no se revisa una clase. */
const librosClase = ref<Book[]>([]);
const valorando = ref(false);

const revisandoClase = computed(
  () => !shareToken.value && Boolean(book.value?.libraryId) && book.value?.permissions.isManager === true,
);
const posicion = computed(() => librosClase.value.findIndex((b) => b.id === book.value?.id));
const actual = computed(() => librosClase.value[posicion.value] ?? null);
const siguiente = computed(() => (posicion.value >= 0 ? librosClase.value[posicion.value + 1] ?? null : null));

/** El libro de otra persona lleva delante quien lo hizo y su curso. */
const titulo = computed(() => {
  if (!book.value) return '';
  const libro = actual.value;
  return libro && libro.creatorId !== auth.user?.id ? tituloConAutor(libro) : book.value.title;
});

/** Valorar es para los libros del alumnado, no para los propios del docente. */
const puedeValorar = computed(() => revisandoClase.value && Boolean(actual.value) && actual.value!.creatorId !== auth.user?.id);

function irASiguiente(): void {
  if (siguiente.value) void router.push({ name: 'book-reader', params: { id: siguiente.value.id } });
}

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
  // En un video tambien: el espacio lo pausa y las flechas lo adelantan.
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"], video')) return;

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

async function cargar(): Promise<void> {
  loading.value = true;
  error.value = null;
  valorando.value = false;
  showPages.value = false;
  index.value = 0;
  try {
    book.value = shareToken.value
      ? await booksApi.getShared(shareToken.value)
      : ((await booksApi.get(route.params.id as string)) as SharedBook);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }

  // La lista de la clase se pide una vez: al pasar al siguiente libro ya esta.
  if (revisandoClase.value && !librosClase.value.some((b) => b.id === book.value?.id)) {
    try {
      librosClase.value = ordenarPorAlumno(await booksApi.list({ libraryId: book.value!.libraryId! }));
    } catch {
      librosClase.value = [];
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', syncFullscreen);
  void cargar();
});

// "Siguiente libro" reutiliza esta misma vista: solo cambia el id de la ruta.
watch(
  () => route.params.id,
  (nuevo, anterior) => {
    if (nuevo && nuevo !== anterior) void cargar();
  },
);

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
      <!-- relative z-30: la hoja en vuelo sobresale del libro y, sin esto, se
           pintaba por encima de la cabecera y del pie. -->
      <header class="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 bg-slate-800 px-4 py-2 text-white">
        <div class="flex min-w-0 items-center gap-3">
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="salida"
            class="shrink-0 text-sm text-slate-300 hover:text-white"
          >&larr; Salir</RouterLink>
          <span v-else class="shrink-0 font-black text-brand-400">BookStudio</span>

          <div class="min-w-0">
            <h1 class="truncate font-bold" :title="titulo">{{ titulo }}</h1>
            <p v-if="book.authorName" class="truncate text-xs text-slate-400">por {{ book.authorName }}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <template v-if="revisandoClase && posicion >= 0">
            <span class="hidden text-xs tabular-nums text-slate-400 md:inline">
              Libro {{ posicion + 1 }} de {{ librosClase.length }}
            </span>
            <button
              type="button"
              data-siguiente-libro
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white shadow hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              :disabled="!siguiente"
              :title="siguiente ? `Siguiente: ${tituloConAutor(siguiente)}` : 'Es el último libro de la biblioteca'"
              @click="irASiguiente"
            >Siguiente libro ›</button>
          </template>
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
            :numbering="book.pageNumbering"
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

      <footer class="relative z-30 shrink-0 bg-slate-800 px-4 py-2 text-center text-sm text-slate-300">
        <span class="tabular-nums">
          {{ rotuloPagina }} de {{ pages.length }}
        </span>
        <span class="ml-3 hidden text-xs text-slate-500 sm:inline">
          Usa las flechas del teclado para pasar de página
        </span>
      </footer>

      <!-- Valorar sin salir del libro: la misma valoracion de la biblioteca. -->
      <button
        v-if="puedeValorar && !showPages"
        type="button"
        data-valorar-estudiante
        class="absolute bottom-14 right-4 z-30 flex items-center gap-2 rounded-xl border-2 border-white bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xl hover:bg-emerald-500"
        @click="valorando = true"
      >🎯 Valorar al estudiante</button>

      <BookGradesPanel
        v-if="valorando && actual"
        :book-id="actual.id"
        :book-title="actual.title"
        :student-name="actual.creatorSurnameFirst ?? actual.creatorName ?? undefined"
        :can-grade="true"
        @close="valorando = false"
      />

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
