<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookCard from '@/components/BookCard.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import PhidiasImportDialog from '@/components/media/PhidiasImportDialog.vue';
import TransferBookDialog from '@/components/TransferBookDialog.vue';
import LibraryList from '@/components/library/LibraryList.vue';
import LibrosAlumnadoDialog from '@/components/library/LibrosAlumnadoDialog.vue';
import { booksApi, phidiasApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { useLibrariesStore } from '@/stores/libraries';
import type { Book, LayoutFormat, PhidiasImportResult, TransferResult } from '@/types/api';
import type { EntregaEnBiblioteca } from '@/utils/entrega';

const ASPECT: Record<LayoutFormat, number> = { square: 1, portrait: 3 / 4, landscape: 4 / 3 };

const auth = useAuthStore();
const libraries = useLibrariesStore();
const router = useRouter();

const newName = ref('');
const joinCode = ref('');
const formError = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);

// Libros personales: existen fuera de cualquier clase y solo los ve su autor.
const allBooks = ref<Book[]>([]);
const loadingBooks = ref(true);
const newBookTitle = ref('');
const newBookFormat = ref<LayoutFormat>('square');

const personalBooks = computed(() => allBooks.value.filter((b) => !b.libraryId));

/** Portadas por biblioteca para pintar el lomo de cada estanteria. */
const booksByLibrary = computed(() => {
  const map = new Map<string, Book[]>();
  for (const book of allBooks.value) {
    if (!book.libraryId) continue;
    map.set(book.libraryId, [...(map.get(book.libraryId) ?? []), book]);
  }
  return map;
});

/** Una sola peticion: la lista ya trae la portada de cada libro. */
async function loadBooks(): Promise<void> {
  loadingBooks.value = true;
  try {
    // En modo administracion los estantes tienen que traer los libros de las
    // bibliotecas que se estan viendo, que no son las propias.
    allBooks.value = await booksApi.list(libraries.verTodo ? { all: 'true' } : {});
  } catch (err) {
    formError.value = errorMessage(err);
  } finally {
    loadingBooks.value = false;
  }
}

async function createPersonalBook(): Promise<void> {
  busy.value = true;
  formError.value = null;
  notice.value = null;
  try {
    // Sin libraryId el backend lo guarda como personal.
    const book = await booksApi.create({
      title: newBookTitle.value || 'Mi libro',
      layoutFormat: newBookFormat.value,
    });
    newBookTitle.value = '';
    allBooks.value = [book, ...allBooks.value];
    await router.push({ name: 'book-editor', params: { id: book.id } });
  } catch (err) {
    formError.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function removePersonalBook(book: Book): Promise<void> {
  if (!window.confirm(`Eliminar "${book.title}"? Esta accion no se puede deshacer.`)) return;
  try {
    await booksApi.remove(book.id);
    allBooks.value = allBooks.value.filter((b) => b.id !== book.id);
  } catch (err) {
    formError.value = errorMessage(err);
  }
}

// --- Pasar un libro de Mis libros a bibliotecas ---
const transfiriendo = ref<Book | null>(null);

async function onTransferido(resultado: TransferResult, entregas: EntregaEnBiblioteca[] = []): Promise<void> {
  const titulo = transfiriendo.value?.title ?? 'El libro';
  transfiriendo.value = null;

  const partes: string[] = [];
  if (resultado.moved) partes.push(`«${titulo}» está ahora en «${resultado.moved.libraryName}»`);
  if (resultado.copies.length) {
    const nombres = resultado.copies.map((c) => `«${c.libraryName}»`).join(', ');
    partes.push(`${resultado.moved ? 'con copia' : `Copia de «${titulo}»`} en ${nombres}`);
  }
  // Lo entregado, biblioteca a biblioteca: si en una fallo, el libro ya esta alli
  // y basta con entregarlo desde ella.
  const entregado = entregas
    .filter((e) => e.result)
    .map((e) => {
      const r = e.result!;
      const sinLibro = r.withoutBooks ? `, ${r.withoutBooks} sin libro donde insertarlo` : '';
      return `entregado en «${e.libraryName}» a ${r.delivered} alumnos (${r.pages} páginas${sinLibro})`;
    });
  notice.value = `${[...partes, ...entregado].join('; ')}.`;
  const fallidas = entregas.filter((e) => e.error);
  formError.value = fallidas.length
    ? `No se pudo entregar en ${fallidas.map((e) => `«${e.libraryName}» (${e.error})`).join(', ')}. ` +
      'El libro ya está en la biblioteca: puedes entregarlo desde allí.'
    : null;
  await loadBooks();
}

/**
 * El interruptor de administracion cambia que bibliotecas se ven, y con ellas
 * que libros hay que traer para llenar sus estantes.
 */
async function alternarVerTodo(): Promise<void> {
  await libraries.alternarVerTodo();
  await loadBooks();
}

onMounted(async () => {
  void libraries.fetchAll();
  void loadBooks();

  if (!auth.isTeacher) return;
  try {
    phidiasEnabled.value = await phidiasApi.status();
  } catch {
    // Sin integracion configurada, el boton sencillamente no aparece.
    phidiasEnabled.value = false;
  }
});

// --- Importacion de grupos desde Phidias ---
const phidiasEnabled = ref(false);
const showPhidias = ref(false);

async function onPhidiasImported(resultado?: PhidiasImportResult): Promise<void> {
  showPhidias.value = false;
  await libraries.fetchAll();
  await loadBooks();
  // Recien creada y con alumnado: es el momento de darle a cada uno su libro.
  if (resultado?.libraryId && resultado.enrolled + resultado.reused > 0) {
    librosAlumnado.value = {
      id: resultado.libraryId,
      name: resultado.libraryName,
      alumnos: resultado.enrolled,
    };
  }
}

/** Biblioteca a la que se ofrece crear un libro por alumno, si hay una. */
const librosAlumnado = ref<{ id: string; name: string; alumnos: number } | null>(null);

async function onLibrosAlumnadoCreados(mensaje: string): Promise<void> {
  librosAlumnado.value = null;
  notice.value = mensaje;
  await loadBooks();
}

async function createLibrary(): Promise<void> {
  busy.value = true;
  formError.value = null;
  notice.value = null;
  try {
    const library = await libraries.create(newName.value);
    newName.value = '';
    notice.value = `Biblioteca creada. Codigo de invitacion: ${library.codeInvite}`;
  } catch (err) {
    formError.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function joinLibrary(): Promise<void> {
  busy.value = true;
  formError.value = null;
  notice.value = null;
  try {
    const library = await libraries.join(joinCode.value.toUpperCase());
    joinCode.value = '';
    notice.value = `Te uniste a "${library.name}"`;
  } catch (err) {
    formError.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function removeLibrary(id: string, name: string): Promise<void> {
  if (!window.confirm(`Eliminar "${name}" y todos sus libros? Esta accion no se puede deshacer.`)) return;
  try {
    await libraries.remove(id);
  } catch (err) {
    formError.value = errorMessage(err);
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <!-- Modo de prueba: el limite se explica antes de que el usuario choque con el -->
    <div
      v-if="auth.isTrial"
      class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <div>
        <p class="font-bold text-amber-900">Estas probando BookStudio</p>
        <p class="text-sm text-amber-800">
          Tienes todas las herramientas, con un limite de <strong>1 libro y 2 páginas</strong>.
          Nada se pierde: crea una cuenta cuando quieras seguir.
        </p>
      </div>
      <RouterLink :to="{ name: 'checkout' }" class="btn-primary shrink-0">
        Ver planes
      </RouterLink>
    </div>

    <h1 class="text-2xl font-black text-slate-900">Hola, {{ auth.user?.fullName }}</h1>
    <p class="mt-1 text-sm text-slate-500">Tus libros personales y tus bibliotecas de clase</p>

    <section class="mt-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-slate-800">Mis libros</h2>
          <p class="text-xs text-slate-500">
            {{ personalBooks.length }} {{ personalBooks.length === 1 ? 'libro' : 'libros' }} ·
            fuera de cualquier clase, solo tu los ves
          </p>
        </div>

        <!--
          `sm:flex-nowrap`: los campos llevan `.input`, que es `w-full`, y eso hacia
          que el formulario se quedara en el ancho justo de los dos campos y el boton
          bajara solo a otra linea, flotando encima del titulo. En pantalla estrecha
          si debe poder partirse.
        -->
        <form class="flex flex-wrap items-center gap-2 sm:flex-nowrap" @submit.prevent="createPersonalBook">
          <input
            v-model.trim="newBookTitle"
            type="text"
            maxlength="255"
            class="input max-w-[14rem]"
            placeholder="Título del libro"
            aria-label="Título del libro personal"
          />
          <select v-model="newBookFormat" class="input w-[9rem] shrink-0" aria-label="Formato de página">
            <option value="square">Cuadrado 1:1</option>
            <option value="portrait">Vertical 3:4</option>
            <option value="landscape">Apaisado 4:3</option>
          </select>
          <button
            type="submit"
            class="btn-primary shrink-0 whitespace-nowrap"
            :disabled="busy || (auth.isTrial && personalBooks.length >= 1)"
            :title="auth.isTrial && personalBooks.length >= 1
              ? 'La prueba permite un libro'
              : undefined"
          >Crear libro</button>
        </form>
      </div>

      <p v-if="loadingBooks" class="text-sm text-slate-500">Cargando...</p>

      <p v-else-if="!personalBooks.length" class="card p-8 text-center text-sm text-slate-500">
        Todavia no tienes libros propios. Crea el primero: no necesitas pertenecer a ninguna clase.
      </p>

      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BookCard
          v-for="book in personalBooks"
          :key="book.id"
          :book="book"
          can-delete
          @remove="removePersonalBook"
        >
          <template #acciones>
            <button
              type="button"
              class="mt-2 self-start text-xs font-semibold text-brand-600 hover:underline"
              @click="transfiriendo = book"
            >Pasar a biblioteca…</button>
          </template>
        </BookCard>
      </ul>
    </section>

    <div class="mb-3 mt-10">
      <h2 class="font-bold text-slate-800">Clases</h2>
      <p class="text-xs text-slate-500">Bibliotecas compartidas con alumnos y otros docentes.</p>

      <!--
        Ver todo el colegio. Va apagado por omision: encontrarse cada dia con las
        bibliotecas de todo el centro convertiria este panel en algo inservible.
      -->
      <label
        v-if="auth.user?.role === 'admin'"
        class="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600"
      >
        <input
          type="checkbox"
          class="h-3.5 w-3.5 rounded"
          :checked="libraries.verTodo"
          @change="alternarVerTodo()"
        />
        Ver las bibliotecas de todo el colegio
        <span v-if="libraries.verTodo" class="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
          modo administración
        </span>
      </label>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <form v-if="auth.isTeacher" class="card p-5" @submit.prevent="createLibrary">
        <h2 class="mb-3 font-bold text-slate-800">Nueva biblioteca</h2>
        <div class="flex gap-2">
          <input v-model.trim="newName" type="text" required minlength="2" maxlength="100" class="input" placeholder="Ej. Lengua 4B" />
          <button type="submit" class="btn-primary shrink-0" :disabled="busy">Crear</button>
        </div>

        <button
          v-if="phidiasEnabled"
          type="button"
          class="btn-secondary mt-2 w-full justify-start"
          @click="showPhidias = true"
        >
          🎓 Crear desde un grupo de Phidias
          <span class="ml-1 text-xs text-slate-500">(trae a los alumnos)</span>
        </button>
      </form>

      <form class="card p-5" @submit.prevent="joinLibrary">
        <h2 class="mb-3 font-bold text-slate-800">Unirse con código</h2>
        <div class="flex gap-2">
          <input
            v-model.trim="joinCode"
            type="text"
            required
            maxlength="5"
            class="input font-mono uppercase tracking-widest"
            placeholder="VBWQ2"
          />
          <button type="submit" class="btn-secondary shrink-0" :disabled="busy || joinCode.length !== 5">Unirme</button>
        </div>
      </form>
    </div>

    <div class="mt-4 space-y-2">
      <AlertMessage :message="formError" />
      <AlertMessage :message="notice" variant="success" />
      <AlertMessage :message="libraries.error" />
    </div>

    <p v-if="libraries.loading" class="mt-6 text-sm text-slate-500">Cargando...</p>

    <p v-else-if="!libraries.items.length" class="card mt-6 p-8 text-center text-sm text-slate-500">
      Todavia no perteneces a ninguna clase. No hace falta: tus libros personales funcionan igual.
    </p>

    <LibraryList
      v-else
      :libraries="libraries.items"
      :books-by-library="booksByLibrary"
      :current-user-id="auth.user?.id"
      @remove="removeLibrary($event.id, $event.name)"
    />

    <PhidiasImportDialog v-if="showPhidias" @close="showPhidias = false" @imported="onPhidiasImported" />

    <LibrosAlumnadoDialog
      v-if="librosAlumnado"
      :library-id="librosAlumnado.id"
      :library-name="librosAlumnado.name"
      :student-count="librosAlumnado.alumnos"
      recien-creada
      @close="librosAlumnado = null"
      @done="onLibrosAlumnadoCreados"
    />

    <TransferBookDialog
      v-if="transfiriendo"
      :book="transfiriendo"
      @close="transfiriendo = null"
      @done="onTransferido"
    />
  </div>
</template>
