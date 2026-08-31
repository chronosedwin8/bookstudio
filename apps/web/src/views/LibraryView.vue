<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookCard from '@/components/BookCard.vue';
import AddStudentsDialog from '@/components/library/AddStudentsDialog.vue';
import BookActivityPanel from '@/components/library/BookActivityPanel.vue';
import BookGradesPanel from '@/components/library/BookGradesPanel.vue';
import DistributeDialog from '@/components/library/DistributeDialog.vue';
import GradeBookGrid from '@/components/library/GradeBookGrid.vue';
import PhidiasImportDialog from '@/components/media/PhidiasImportDialog.vue';
import { authApi, booksApi, librariesApi, phidiasApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type {
  Book,
  ClassView,
  DistributeResult,
  LayoutFormat,
  Library,
  LibraryMembers,
  Page,
  StudentCredential,
} from '@/types/api';

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

// --- Vistas del contenido ---
// La cuadricula de portadas es bonita pero no responde a "quien no ha entregado" ni
// a "que hay aqui dentro". Cada vista contesta una pregunta distinta.
type VistaLibros = 'portadas' | 'lista' | 'autor';
const vista = ref<VistaLibros>('portadas');

const VISTAS: Array<{ id: VistaLibros; label: string; icono: string; ayuda: string }> = [
  { id: 'portadas', label: 'Portadas', icono: '▦', ayuda: 'Cuadrícula con la primera página de cada libro' },
  { id: 'lista', label: 'Lista', icono: '☰', ayuda: 'Tabla compacta con autor, páginas y última edición' },
  { id: 'autor', label: 'Por alumno', icono: '👥', ayuda: 'Agrupados por quien los creó' },
];

const fechaCorta = (valor: string) =>
  new Date(valor).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' });

const librosOrdenados = computed(() =>
  [...books.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);

/** Agrupa por autor, con su curso, y ordena alfabeticamente para poder buscar a alguien. */
const porAutor = computed(() => {
  const grupos = new Map<string, { nombre: string; curso: string | null; libros: Book[] }>();
  for (const libro of librosOrdenados.value) {
    const clave = libro.creatorId ?? 'sin-autor';
    const grupo = grupos.get(clave) ?? {
      nombre: libro.creatorName ?? 'Sin autor',
      curso: libro.creatorCourse ?? null,
      libros: [],
    };
    grupo.libros.push(libro);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
});

// --- Alumnos desde Phidias ---
const phidiasEnabled = ref(false);
const showPhidias = ref(false);

// --- Alumnado de otros cursos ---
const showAddStudents = ref(false);

async function onStudentsAdded(resultado: { added: number; accountsCreated: number }): Promise<void> {
  showAddStudents.value = false;
  const partes = [resultado.added === 1 ? '1 alumno añadido' : `${resultado.added} alumnos añadidos`];
  if (resultado.accountsCreated) {
    partes.push(
      resultado.accountsCreated === 1
        ? '1 cuenta creada'
        : `${resultado.accountsCreated} cuentas creadas`,
    );
  }
  notice.value = partes.join(' · ');
  await loadAll();
}

// --- Valoraciones y bitacora ---
const valorando = ref<Book | null>(null);
const bitacora = ref<Book | null>(null);
const cuadricula = ref<InstanceType<typeof GradeBookGrid> | null>(null);

// --- Borrado masivo de libros ---
const seleccion = ref<Set<string>>(new Set());
const borrando = ref(false);

const todosSeleccionados = computed(
  () => librosOrdenados.value.length > 0 && librosOrdenados.value.every((b) => seleccion.value.has(b.id)),
);

function alternarLibro(id: string): void {
  const copia = new Set(seleccion.value);
  if (copia.has(id)) copia.delete(id);
  else copia.add(id);
  seleccion.value = copia;
}

function alternarTodos(): void {
  seleccion.value = todosSeleccionados.value
    ? new Set()
    : new Set(librosOrdenados.value.map((b) => b.id));
}

/**
 * Borra los libros marcados. Es destructivo y se lleva por delante trabajo de otras
 * personas, asi que se pide escribir cuantos son: un "aceptar" a ciegas es demasiado
 * facil de pulsar sin leer.
 */
async function borrarSeleccionados(): Promise<void> {
  const cuantos = seleccion.value.size;
  if (!cuantos) return;

  const respuesta = window.prompt(
    `Vas a borrar ${cuantos} ${cuantos === 1 ? 'libro' : 'libros'} con todas sus páginas. ` +
      `No se puede deshacer.\n\nEscribe ${cuantos} para confirmar:`,
  );
  if (respuesta?.trim() !== String(cuantos)) return;

  borrando.value = true;
  error.value = null;
  try {
    const resultado = await librariesApi.bulkDeleteBooks(libraryId.value, [...seleccion.value]);
    seleccion.value = new Set();
    notice.value = `${resultado.deleted} ${resultado.deleted === 1 ? 'libro borrado' : 'libros borrados'}`;
    await loadAll();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    borrando.value = false;
  }
}

async function removeStudent(studentId: string, nombre: string): Promise<void> {
  if (!window.confirm(`Sacar a ${nombre} de esta biblioteca? Sus libros se conservan.`)) return;
  try {
    await librariesApi.removeStudent(libraryId.value, studentId);
    notice.value = `${nombre} ya no pertenece a esta biblioteca`;
    await loadAll();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// --- Entrega de material ---
const entregando = ref<Book | null>(null);
const entregaPaginas = ref<Page[]>([]);

// Las paginas se piden al abrir el dialogo: hacen falta para elegir cual mandar, y
// cargarlas antes seria traer el contenido de todos los libros de la biblioteca.
watch(entregando, async (libro) => {
  entregaPaginas.value = [];
  if (!libro) return;
  try {
    const detalle = await booksApi.get(libro.id);
    entregaPaginas.value = detalle.pages;
  } catch (err) {
    error.value = errorMessage(err);
  }
});

function onDistributed(resultado: DistributeResult): void {
  entregando.value = null;
  const partes = [`${resultado.delivered} alumnos`, `${resultado.pages} páginas`];
  if (resultado.created) partes.push(`${resultado.created} libros nuevos`);
  if (resultado.updated) partes.push(`${resultado.updated} ampliados`);
  if (resultado.withoutBooks) partes.push(`${resultado.withoutBooks} sin libro donde insertar`);
  notice.value = `Entregado: ${partes.join(' · ')}`;
  void loadAll();
}

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

type Ajuste = 'studentEditable' | 'studentPublishable' | 'commentsEnabled' | 'studentsSeePeers';

async function toggleSetting(key: Ajuste): Promise<void> {
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

          <button type="button" class="btn-secondary mt-2 w-full justify-start" @click="showAddStudents = true">
            👥 Añadir alumnos de otros cursos
          </button>

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
            <label class="flex items-start gap-2 border-t border-slate-100 pt-2">
              <input
                type="checkbox"
                :checked="library.studentsSeePeers"
                class="mt-1 h-4 w-4 rounded"
                @change="toggleSetting('studentsSeePeers')"
              />
              <span>
                Ver las creaciones de los compañeros
                <span class="block text-xs text-slate-500">
                  Si lo apagas, cada alumno solo verá sus libros, los que entregues tú y los
                  colaborativos.
                </span>
              </span>
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

        <!-- Cada vista contesta una pregunta distinta sobre el mismo contenido -->
        <div v-if="books.length" class="mb-3 flex flex-wrap items-center gap-1">
          <button
            v-for="opcion in VISTAS"
            :key="opcion.id"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm font-semibold transition"
            :class="vista === opcion.id
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-slate-200 text-slate-600 hover:border-brand-300'"
            :title="opcion.ayuda"
            :aria-pressed="vista === opcion.id"
            @click="vista = opcion.id"
          >
            <span aria-hidden="true">{{ opcion.icono }}</span> {{ opcion.label }}
          </button>

          <!-- El borrado masivo vive en la vista de lista, que es donde se marca -->
          <button
            v-if="isManager && vista !== 'lista'"
            type="button"
            class="ml-auto text-xs font-semibold text-slate-500 hover:text-brand-700"
            @click="vista = 'lista'"
          >Seleccionar y borrar varios</button>

          <div v-else-if="isManager" class="ml-auto flex items-center gap-3">
            <span class="text-xs text-slate-500">
              {{ seleccion.size ? `${seleccion.size} marcados` : 'Marca libros para borrarlos' }}
            </span>
            <button
              type="button"
              class="btn-danger px-3 py-1.5 text-xs"
              :disabled="!seleccion.size || borrando"
              @click="borrarSeleccionados"
            >{{ borrando ? 'Borrando...' : 'Borrar marcados' }}</button>
          </div>
        </div>

        <p v-if="!books.length" class="card p-8 text-center text-sm text-slate-500">
          Todavía no hay libros en esta biblioteca.
        </p>

        <!-- Portadas -->
        <ul v-else-if="vista === 'portadas'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BookCard
            v-for="book in librosOrdenados"
            :key="book.id"
            :book="book"
            :can-delete="isManager || book.creatorId === auth.user?.id"
            @remove="removeBook($event.id, $event.title)"
          >
            <template v-if="isManager" #acciones>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-secondary flex-1 text-xs" @click="valorando = book">
                  Valorar
                </button>
                <button type="button" class="btn-secondary flex-1 text-xs" @click="entregando = book">
                  Entregar
                </button>
              </div>
            </template>
          </BookCard>
        </ul>

        <!-- Lista -->
        <div v-else-if="vista === 'lista'" class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th v-if="isManager" class="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded"
                    :checked="todosSeleccionados"
                    aria-label="Marcar todos los libros"
                    @change="alternarTodos"
                  />
                </th>
                <th class="px-4 py-2">Título</th>
                <th class="px-4 py-2">Autor</th>
                <th class="px-4 py-2">Curso</th>
                <th class="px-4 py-2 text-right">Páginas</th>
                <th class="px-4 py-2">Editado</th>
                <th class="px-4 py-2">Estado</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="book in librosOrdenados"
                :key="book.id"
                class="hover:bg-slate-50"
                :class="seleccion.has(book.id) ? 'bg-red-50' : ''"
              >
                <td v-if="isManager" class="px-4 py-2">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded"
                    :checked="seleccion.has(book.id)"
                    :aria-label="`Marcar ${book.title}`"
                    @change="alternarLibro(book.id)"
                  />
                </td>
                <td class="px-4 py-2">
                  <RouterLink
                    :to="{ name: 'book-editor', params: { id: book.id } }"
                    class="font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                  >{{ book.title }}</RouterLink>
                  <span v-if="book.originBookId" class="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">
                    entregado
                  </span>
                </td>
                <td class="px-4 py-2 text-slate-600">{{ book.creatorName ?? '—' }}</td>
                <td class="px-4 py-2">
                  <span
                    v-if="book.creatorCourse"
                    class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600"
                  >{{ book.creatorCourse }}</span>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-slate-600">{{ book.pageCount ?? '—' }}</td>
                <td class="px-4 py-2 text-slate-500">{{ fechaCorta(book.updatedAt) }}</td>
                <td class="px-4 py-2">
                  <span
                    v-if="book.isPublished"
                    class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                  >Publicado</span>
                  <span v-else class="text-xs text-slate-400">Borrador</span>
                </td>
                <td class="px-4 py-2 text-right">
                  <span v-if="isManager" class="flex justify-end gap-3">
                    <button
                      type="button"
                      class="text-xs font-semibold text-brand-600 hover:underline"
                      @click="valorando = book"
                    >Valorar</button>
                    <button
                      type="button"
                      class="text-xs font-semibold text-brand-600 hover:underline"
                      @click="bitacora = book"
                    >Bitácora</button>
                    <button
                      type="button"
                      class="text-xs font-semibold text-brand-600 hover:underline"
                      @click="entregando = book"
                    >Entregar</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Por alumno -->
        <div v-else class="space-y-5">
          <section v-for="grupo in porAutor" :key="grupo.nombre" class="card p-4">
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h3 class="flex items-baseline gap-2 font-bold text-slate-900">
                {{ grupo.nombre }}
                <span
                  v-if="grupo.curso"
                  class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600"
                >{{ grupo.curso }}</span>
              </h3>
              <span class="text-xs text-slate-500">
                {{ grupo.libros.length }} {{ grupo.libros.length === 1 ? 'libro' : 'libros' }}
              </span>
            </div>
            <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <BookCard
                v-for="book in grupo.libros"
                :key="book.id"
                :book="book"
                :can-delete="isManager || book.creatorId === auth.user?.id"
                @remove="removeBook($event.id, $event.title)"
              />
            </ul>
          </section>
        </div>
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

      <AddStudentsDialog
        v-if="showAddStudents && library"
        :library-id="library.id"
        :library-name="library.name"
        @close="showAddStudents = false"
        @added="onStudentsAdded"
      />

      <DistributeDialog
        v-if="entregando && library"
        :library-id="library.id"
        :library-name="library.name"
        :source-book-id="entregando.id"
        :source-title="entregando.title"
        :pages="entregaPaginas"
        @close="entregando = null"
        @done="onDistributed"
      />

      <BookGradesPanel
        v-if="valorando"
        :book-id="valorando.id"
        :book-title="valorando.title"
        :student-name="valorando.creatorName ?? undefined"
        :can-grade="isManager"
        @close="valorando = null"
        @changed="cuadricula?.recargar()"
      />

      <BookActivityPanel
        v-if="bitacora"
        :book-id="bitacora.id"
        :book-title="bitacora.title"
        :student-name="bitacora.creatorName ?? undefined"
        @close="bitacora = null"
      />

      <!-- Cuadricula de valoraciones de toda la clase -->
      <div v-if="isManager" class="mt-10">
        <GradeBookGrid ref="cuadricula" :library-id="libraryId" />
      </div>

      <!-- Alumnado inscrito: de que curso viene cada uno y como sacarlo de aqui -->
      <section v-if="isManager && members?.students.length" class="mt-8">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-bold text-slate-800">
            Alumnado inscrito
            <span class="ml-1 text-sm font-normal text-slate-500">({{ members.students.length }})</span>
          </h2>
          <button type="button" class="btn-secondary" @click="showAddStudents = true">Añadir alumnos</button>
        </div>

        <ul class="card divide-y divide-slate-100">
          <li
            v-for="alumno in members.students"
            :key="alumno.id"
            class="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-800">{{ alumno.fullName }}</p>
              <p class="truncate text-xs text-slate-500">{{ alumno.email || 'Accede con código QR' }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span
                v-if="alumno.course"
                class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
              >{{ alumno.course }}</span>
              <button
                type="button"
                class="text-xs font-semibold text-red-600 hover:underline"
                @click="removeStudent(alumno.id, alumno.fullName)"
              >Sacar</button>
            </div>
          </li>
        </ul>
      </section>

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
