<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookCard from '@/components/BookCard.vue';
import PhidiasImportDialog from '@/components/media/PhidiasImportDialog.vue';
import { authApi, booksApi, librariesApi, phidiasApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { Book, ClassView, LayoutFormat, Library, LibraryMembers, StudentCredential } from '@/types/api';

const route = useRoute();
const auth = useAuthStore();
const libraryId = computed(() => route.params.id as string);

const library = ref<Library | null>(null);
const books = ref<Book[]>([]);
const newBookTitle = ref('');
const newBookFormat = ref<LayoutFormat>('square');
const members = ref<LibraryMembers | null>(null);
const classView = ref<ClassView | null>(null);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const loading = ref(true);

const search = ref('');
const page = ref(1);
const pageSize = 12;

const studentName = ref('');
const coTeacherEmail = ref('');
const credential = ref<StudentCredential | null>(null);
const busy = ref(false);

const isManager = computed(() => auth.isTeacher && Boolean(library.value));

/** Enlace directo de inscripcion, para repartirlo por chat o correo. */
const joinUrl = computed(() =>
  library.value ? `${window.location.origin}/unirse/${library.value.codeInvite}` : '',
);
const copied = ref(false);

async function copyJoinUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(joinUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS) queda el campo para copiar a mano.
    error.value = 'No se pudo copiar. Selecciona el enlace y copialo manualmente.';
  }
}

// --- Alumnos desde Phidias ---
const phidiasEnabled = ref(false);
const showPhidias = ref(false);

async function onPhidiasImported(): Promise<void> {
  showPhidias.value = false;
  notice.value = 'Alumnos anadidos desde Phidias';
  await loadAll();
}

async function loadClassView(): Promise<void> {
  if (!auth.isTeacher) return;
  classView.value = await librariesApi.classView(libraryId.value, {
    page: page.value,
    pageSize,
    search: search.value || undefined,
  });
}

async function loadAll(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    library.value = await librariesApi.get(libraryId.value);
    members.value = await librariesApi.members(libraryId.value);
    books.value = await booksApi.list({ libraryId: libraryId.value });
    await loadClassView();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function createBook(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const book = await booksApi.create({
      title: newBookTitle.value || 'Libro sin titulo',
      libraryId: libraryId.value,
      layoutFormat: newBookFormat.value,
    });
    newBookTitle.value = '';
    books.value = [book, ...books.value];
    notice.value = `Libro "${book.title}" creado`;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function removeBook(id: string, title: string): Promise<void> {
  if (!window.confirm(`Eliminar "${title}"? Esta accion no se puede deshacer.`)) return;
  try {
    await booksApi.remove(id);
    books.value = books.value.filter((b) => b.id !== id);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

onMounted(async () => {
  await loadAll();
  if (!auth.isTeacher) return;
  try {
    phidiasEnabled.value = await phidiasApi.status();
  } catch {
    // Sin integracion configurada el boton no aparece.
    phidiasEnabled.value = false;
  }
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void loadClassView().catch((err) => (error.value = errorMessage(err)));
  }, 350);
});

watch(page, () => void loadClassView().catch((err) => (error.value = errorMessage(err))));

async function addStudent(): Promise<void> {
  busy.value = true;
  error.value = null;
  notice.value = null;
  try {
    credential.value = await authApi.createStudent({ fullName: studentName.value, libraryId: libraryId.value });
    studentName.value = '';
    notice.value = `Alumno creado. Descarga o muestra su QR.`;
    await loadAll();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function addCoTeacher(): Promise<void> {
  busy.value = true;
  error.value = null;
  notice.value = null;
  try {
    await librariesApi.addTeacher(libraryId.value, coTeacherEmail.value);
    coTeacherEmail.value = '';
    notice.value = 'Co-docente agregado';
    members.value = await librariesApi.members(libraryId.value);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function removeCoTeacher(teacherId: string): Promise<void> {
  try {
    await librariesApi.removeTeacher(libraryId.value, teacherId);
    members.value = await librariesApi.members(libraryId.value);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function toggleSetting(key: 'studentEditable' | 'studentPublishable' | 'commentsEnabled'): Promise<void> {
  if (!library.value) return;
  try {
    library.value = await librariesApi.update(libraryId.value, { [key]: !library.value[key] });
  } catch (err) {
    error.value = errorMessage(err);
  }
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <RouterLink :to="{ name: 'dashboard' }" class="text-sm text-brand-600 hover:underline">&larr; Bibliotecas</RouterLink>

    <p v-if="loading" class="mt-6 text-sm text-slate-500">Cargando...</p>

    <template v-else-if="library">
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-black text-slate-900">{{ library.name }}</h1>
          <p class="mt-1 text-sm text-slate-500">
            Código:
            <span class="font-mono text-base font-bold tracking-widest text-brand-700">{{ library.codeInvite }}</span>
          </p>

          <!-- Enlace de inscripción: no todo el mundo puede escanear un QR -->
          <div class="mt-2 flex max-w-md items-center gap-2">
            <input
              :value="joinUrl"
              readonly
              class="input py-1 font-mono text-xs"
              aria-label="Enlace de inscripción"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button type="button" class="btn-secondary shrink-0 px-2 py-1 text-xs" @click="copyJoinUrl">
              {{ copied ? 'Copiado' : 'Copiar enlace' }}
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-2">
        <AlertMessage :message="error" />
        <AlertMessage :message="notice" variant="success" />
      </div>

      <section v-if="isManager" class="mt-6 grid gap-4 lg:grid-cols-3">
        <form class="card p-5" @submit.prevent="addStudent">
          <h2 class="mb-3 font-bold text-slate-800">Agregar alumno</h2>
          <div class="flex gap-2">
            <input v-model.trim="studentName" type="text" required minlength="2" class="input" placeholder="Nombre y apellido" />
            <button type="submit" class="btn-primary shrink-0" :disabled="busy">Crear QR</button>
          </div>
          <p class="mt-2 text-xs text-slate-500">Se genera un acceso sin correo ni contraseña.</p>

          <button
            v-if="phidiasEnabled"
            type="button"
            class="btn-secondary mt-2 w-full justify-start"
            @click="showPhidias = true"
          >
            🎓 Traer alumnos de Phidias
          </button>
        </form>

        <form class="card p-5" @submit.prevent="addCoTeacher">
          <h2 class="mb-3 font-bold text-slate-800">Invitar co-docente</h2>
          <div class="flex gap-2">
            <input v-model.trim="coTeacherEmail" type="email" required class="input" placeholder="colega@escuela.edu" />
            <button type="submit" class="btn-secondary shrink-0" :disabled="busy">Invitar</button>
          </div>
        </form>

        <div class="card p-5">
          <h2 class="mb-3 font-bold text-slate-800">Permisos</h2>
          <div class="space-y-2 text-sm">
            <label class="flex items-center gap-2">
              <input type="checkbox" :checked="library.studentEditable" class="h-4 w-4 rounded" @change="toggleSetting('studentEditable')" />
              Los alumnos pueden editar
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" :checked="library.studentPublishable" class="h-4 w-4 rounded" @change="toggleSetting('studentPublishable')" />
              Los alumnos pueden publicar
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" :checked="library.commentsEnabled" class="h-4 w-4 rounded" @change="toggleSetting('commentsEnabled')" />
              Comentarios habilitados
            </label>
          </div>
        </div>
      </section>

      <div v-if="credential" class="card mt-4 flex flex-wrap items-center gap-5 p-5">
        <img :src="credential.qrDataUrl" :alt="`Código QR de ${credential.user.fullName}`" class="h-40 w-40 rounded-lg border border-slate-200" />
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-slate-900">{{ credential.user.fullName }}</h3>
          <p class="mt-1 text-sm text-slate-500">Imprime o muestra este QR para que el alumno inicie sesión.</p>
          <div class="mt-2 flex max-w-md items-center gap-2">
            <input
              :value="`${joinUrl.replace(/\/unirse\/.*$/, '')}/login/qr?t=${credential.qrToken}`"
              readonly
              class="input py-1 font-mono text-xs"
              aria-label="Enlace de acceso del alumno"
              @focus="($event.target as HTMLInputElement).select()"
            />
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <a :href="credential.qrDataUrl" :download="`qr-${credential.user.fullName.replace(/\s+/g, '-').toLowerCase()}.png`" class="btn-secondary">
              Descargar PNG
            </a>
            <button type="button" class="btn-secondary" @click="credential = null">Cerrar</button>
          </div>
        </div>
      </div>

      <section class="mt-8">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 class="font-bold text-slate-800">Libros</h2>

          <form class="flex flex-wrap items-end gap-2" @submit.prevent="createBook">
            <input v-model.trim="newBookTitle" type="text" maxlength="255" class="input max-w-[14rem]" placeholder="Título del libro" />
            <select v-model="newBookFormat" class="input max-w-[9rem]" aria-label="Formato de página">
              <option value="square">Cuadrado 1:1</option>
              <option value="portrait">Vertical 3:4</option>
              <option value="landscape">Apaisado 4:3</option>
            </select>
            <button type="submit" class="btn-primary" :disabled="busy">Nuevo libro</button>
          </form>
        </div>

        <p v-if="!books.length" class="card p-8 text-center text-sm text-slate-500">
          Todavia no hay libros en esta biblioteca.
        </p>

        <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BookCard
            v-for="book in books"
            :key="book.id"
            :book="book"
            :can-delete="isManager || book.creatorId === auth.user?.id"
            @remove="removeBook($event.id, $event.title)"
          />
        </ul>
      </section>

      <section v-if="isManager" class="mt-8">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-bold text-slate-800">Vista de clase</h2>
          <input v-model.trim="search" type="search" class="input max-w-xs" placeholder="Buscar alumno..." />
        </div>

        <p v-if="!classView?.items.length" class="card p-8 text-center text-sm text-slate-500">
          Aun no hay alumnos inscritos en esta biblioteca.
        </p>

        <template v-else>
          <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="entry in classView.items" :key="entry.studentId" class="card p-4">
              <h3 class="truncate font-bold text-slate-900">{{ entry.studentName }}</h3>

              <div class="mt-2 grid grid-cols-3 gap-2 text-center">
                <div class="rounded bg-slate-50 py-1.5">
                  <p class="text-base font-black text-slate-800">{{ entry.bookCount }}</p>
                  <p class="text-[11px] text-slate-500">libros</p>
                </div>
                <div class="rounded bg-slate-50 py-1.5">
                  <p class="text-base font-black text-slate-800">{{ entry.totalPages }}</p>
                  <p class="text-[11px] text-slate-500">páginas</p>
                </div>
                <div class="rounded bg-slate-50 py-1.5">
                  <p class="text-base font-black text-slate-800">{{ entry.publishedCount }}</p>
                  <p class="text-[11px] text-slate-500">publicados</p>
                </div>
              </div>

              <p class="mt-2 text-xs text-slate-500">Ultima actividad: {{ formatDate(entry.lastActivityAt) }}</p>

              <ul v-if="entry.books.length" class="mt-3 space-y-1 border-t border-slate-100 pt-2">
                <li v-for="book in entry.books" :key="book.id" class="flex items-center justify-between gap-2 text-xs">
                  <span class="truncate text-slate-700">{{ book.title }}</span>
                  <span class="shrink-0 text-slate-400">{{ book.pageCount }}p</span>
                </li>
              </ul>
            </li>
          </ul>

          <div v-if="classView.totalPages > 1" class="mt-4 flex items-center justify-center gap-3">
            <button type="button" class="btn-secondary" :disabled="page <= 1" @click="page -= 1">Anterior</button>
            <span class="text-sm text-slate-600">Página {{ classView.page }} de {{ classView.totalPages }}</span>
            <button type="button" class="btn-secondary" :disabled="page >= classView.totalPages" @click="page += 1">Siguiente</button>
          </div>
        </template>
      </section>

      <PhidiasImportDialog
        v-if="showPhidias && library"
        :library-id="library.id"
        :library-name="library.name"
        @close="showPhidias = false"
        @imported="onPhidiasImported"
      />

      <section v-if="members" class="mt-8">
        <h2 class="mb-3 font-bold text-slate-800">Equipo docente</h2>
        <ul class="card divide-y divide-slate-100">
          <li class="flex items-center justify-between gap-3 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-800">{{ members.owner.fullName }}</p>
              <p class="truncate text-xs text-slate-500">{{ members.owner.email }}</p>
            </div>
            <span class="shrink-0 rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Propietario</span>
          </li>
          <li v-for="teacher in members.teachers" :key="teacher.id" class="flex items-center justify-between gap-3 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-800">{{ teacher.fullName }}</p>
              <p class="truncate text-xs text-slate-500">{{ teacher.email }}</p>
            </div>
            <button
              v-if="library.ownerId === auth.user?.id"
              type="button"
              class="btn-danger shrink-0"
              @click="removeCoTeacher(teacher.id)"
            >
              Quitar
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
