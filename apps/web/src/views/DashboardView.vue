<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookCard from '@/components/BookCard.vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import PhidiasImportDialog from '@/components/media/PhidiasImportDialog.vue';
import { booksApi, phidiasApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { useLibrariesStore } from '@/stores/libraries';
import type { Book, LayoutFormat } from '@/types/api';

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
    allBooks.value = await booksApi.list();
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

async function onPhidiasImported(): Promise<void> {
  showPhidias.value = false;
  await libraries.fetchAll();
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
          Tienes todas las herramientas, con un limite de <strong>1 libro y 2 paginas</strong>.
          Nada se pierde: crea una cuenta cuando quieras seguir.
        </p>
      </div>
      <RouterLink :to="{ name: 'customer-portal' }" class="btn-primary shrink-0">
        Ver planes
      </RouterLink>
    </div>

    <h1 class="text-2xl font-black text-slate-900">Hola, {{ auth.user?.fullName }}</h1>
    <p class="mt-1 text-sm text-slate-500">Tus libros personales y tus bibliotecas de clase</p>

    <section class="mt-6">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="font-bold text-slate-800">Mis libros</h2>
          <p class="text-xs text-slate-500">
            {{ personalBooks.length }} {{ personalBooks.length === 1 ? 'libro' : 'libros' }} ·
            fuera de cualquier clase, solo tu los ves
          </p>
        </div>

        <form class="flex flex-wrap items-end gap-2" @submit.prevent="createPersonalBook">
          <input
            v-model.trim="newBookTitle"
            type="text"
            maxlength="255"
            class="input max-w-[14rem]"
            placeholder="Titulo del libro"
            aria-label="Titulo del libro personal"
          />
          <select v-model="newBookFormat" class="input max-w-[9rem]" aria-label="Formato de pagina">
            <option value="square">Cuadrado 1:1</option>
            <option value="portrait">Vertical 3:4</option>
            <option value="landscape">Apaisado 4:3</option>
          </select>
          <button
            type="submit"
            class="btn-primary"
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
        />
      </ul>
    </section>

    <div class="mb-3 mt-10">
      <h2 class="font-bold text-slate-800">Clases</h2>
      <p class="text-xs text-slate-500">Bibliotecas compartidas con alumnos y otros docentes.</p>
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
        <h2 class="mb-3 font-bold text-slate-800">Unirse con codigo</h2>
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

    <ul v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="library in libraries.items" :key="library.id" class="card flex flex-col overflow-hidden">
        <!-- Estanteria: las portadas de los primeros libros de la biblioteca -->
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
          <p v-else class="w-full pb-3 text-center text-xs text-slate-400">Biblioteca vacia</p>
        </RouterLink>

        <div class="flex flex-1 flex-col p-5">
        <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="font-bold text-slate-900 hover:text-brand-600">
          {{ library.name }}
        </RouterLink>

        <p class="mt-2 text-xs text-slate-500">Codigo de invitacion</p>
        <p class="font-mono text-lg font-black tracking-widest text-brand-700">{{ library.codeInvite }}</p>

        <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span class="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            {{ booksByLibrary.get(library.id)?.length ?? 0 }} de {{ library.studentBookLimit }} libros
          </span>
          <span v-if="library.studentEditable" class="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Edicion alumnos</span>
          <span v-if="library.studentPublishable" class="rounded bg-brand-100 px-2 py-0.5 text-brand-700">Publicable</span>
        </div>

        <div class="mt-4 flex gap-2 border-t border-slate-100 pt-3">
          <RouterLink :to="{ name: 'library', params: { id: library.id } }" class="btn-secondary flex-1">Abrir</RouterLink>
          <button
            v-if="library.ownerId === auth.user?.id"
            type="button"
            class="btn-danger"
            @click="removeLibrary(library.id, library.name)"
          >
            Eliminar
          </button>
        </div>
        </div>
      </li>
    </ul>

    <PhidiasImportDialog v-if="showPhidias" @close="showPhidias = false" @imported="onPhidiasImported" />
  </div>
</template>
