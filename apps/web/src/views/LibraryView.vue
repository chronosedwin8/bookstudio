<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import BookCard from '@/components/BookCard.vue';
import AddStudentsDialog from '@/components/library/AddStudentsDialog.vue';
import BookActivityPanel from '@/components/library/BookActivityPanel.vue';
import BookGradesPanel from '@/components/library/BookGradesPanel.vue';
import ClavesEntregadas from '@/components/library/ClavesEntregadas.vue';
import DistributeDialog from '@/components/library/DistributeDialog.vue';
import GradeBookGrid from '@/components/library/GradeBookGrid.vue';
import PhidiasImportDialog from '@/components/media/PhidiasImportDialog.vue';
import QuizList from '@/components/quizzes/QuizList.vue';
import { authApi, booksApi, librariesApi, phidiasApi, usersApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type {
  EditorTool,
  ElementType,
  AddStudentsResult,
  Book,
  ClaveEntregada,
  ClassView,
  DistributeResult,
  LayoutFormat,
  Library,
  LibraryMembers,
  Page,
  StudentCredential,
} from '@/types/api';

const route = useRoute();
const router = useRouter();
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

/**
 * La pantalla estaba creciendo en vertical hasta volverse un rollo interminable:
 * formularios, libros, cuadricula, alumnado y equipo docente, todo apilado. Se
 * reparte en pestanas porque son tareas distintas y rara vez se hacen a la vez.
 *
 * La pestana viaja en la URL para que recargar no devuelva al principio y para poder
 * pasarle a un companero el enlace de la cuadricula de notas.
 */
type Pestana = 'libros' | 'examenes' | 'notas' | 'alumnado' | 'ajustes';

const PESTANAS: Array<{ id: Pestana; label: string; icono: string; soloDocente: boolean }> = [
  { id: 'libros', label: 'Libros', icono: '📚', soloDocente: false },
  // Visible tambien para el alumnado: ahi ve los examenes que le han enviado.
  { id: 'examenes', label: 'Cuestionarios', icono: '📝', soloDocente: false },
  { id: 'notas', label: 'Valoraciones', icono: '🎯', soloDocente: true },
  { id: 'alumnado', label: 'Alumnado', icono: '👥', soloDocente: true },
  { id: 'ajustes', label: 'Ajustes', icono: '⚙️', soloDocente: true },
];

const pestanasVisibles = computed(() => PESTANAS.filter((p) => !p.soloDocente || isManager.value));

const pestana = computed<Pestana>({
  get() {
    const pedida = String(route.query.t ?? '') as Pestana;
    return pestanasVisibles.value.some((p) => p.id === pedida) ? pedida : 'libros';
  },
  set(valor) {
    void router.replace({ query: { ...route.query, t: valor } });
  },
});

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

/**
 * Alumnado con todo junto: sus cifras vienen de la vista de clase (paginada y
 * buscable) y su curso y correo de la lista de miembros. Antes eran dos secciones
 * distintas con los mismos nombres repetidos.
 */
const alumnado = computed(() => {
  const porId = new Map((members.value?.students ?? []).map((s) => [s.id, s]));
  return (classView.value?.items ?? []).map((entrada) => ({
    ...entrada,
    course: porId.get(entrada.studentId)?.course ?? null,
    email: porId.get(entrada.studentId)?.email ?? null,
  }));
});

/** Cifras de cabecera: lo que un docente quiere saber de un vistazo. */
const resumen = computed(() => ({
  libros: books.value.length,
  alumnos: members.value?.students.length ?? 0,
  paginas: books.value.reduce((acc, b) => acc + (b.pageCount ?? 0), 0),
}));

// --- Alumnado de otros cursos ---
const showAddStudents = ref(false);

/** Claves a repartir tras el alta. Se muestran una sola vez. */
const claves = ref<ClaveEntregada[]>([]);

async function onStudentsAdded(resultado: AddStudentsResult): Promise<void> {
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
  claves.value = resultado.credentials;
  // Si hay claves que repartir, la pestana de alumnado es donde se ven.
  if (resultado.credentials.length) pestana.value = 'alumnado';
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

/**
 * Borra la cuenta del alumno y todo su contenido. Distinto de "sacar", que solo lo
 * quita de esta biblioteca y le conserva el trabajo.
 */
async function deleteStudent(studentId: string, nombre: string): Promise<void> {
  const respuesta = window.prompt(
    `Vas a BORRAR la cuenta de ${nombre} y todo su contenido: sus libros, sus ` +
      'valoraciones y sus archivos. No se puede deshacer.\n\n' +
      `Escribe su nombre completo para confirmar:\n${nombre}`,
  );
  if (respuesta?.trim() !== nombre) {
    if (respuesta !== null) error.value = 'El nombre no coincide: no se ha borrado nada.';
    return;
  }

  try {
    const borrado = await usersApi.remove(studentId);
    notice.value = `${borrado.fullName} borrado: ${borrado.books} libros · ${borrado.mediaDeleted} archivos`;
    await loadAll();
  } catch (err) {
    error.value = errorMessage(err);
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

/**
 * Herramientas del editor que puede usar el alumnado.
 *
 * El catalogo lo da el servidor para que la pantalla y la comprobacion al
 * insertar hablen de la misma lista. Se guarda lo vetado, no lo permitido: asi
 * una herramienta nueva aparece habilitada sin tocar las bibliotecas de nadie.
 */
const herramientas = ref<EditorTool[]>([]);
const guardandoHerramientas = ref(false);

void librariesApi
  .tools()
  .then((lista) => (herramientas.value = lista))
  .catch(() => (herramientas.value = []));

function herramientaActiva(id: ElementType): boolean {
  return !(library.value?.disabledTools ?? []).includes(id);
}

async function alternarHerramienta(id: ElementType): Promise<void> {
  if (!library.value || guardandoHerramientas.value) return;
  const vetadas = library.value.disabledTools ?? [];
  const siguiente = vetadas.includes(id) ? vetadas.filter((x) => x !== id) : [...vetadas, id];

  guardandoHerramientas.value = true;
  try {
    library.value = await librariesApi.update(libraryId.value, { disabledTools: siguiente });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardandoHerramientas.value = false;
  }
}

const vetadasCuenta = computed(() => library.value?.disabledTools?.length ?? 0);

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-16">
    <p v-if="loading" class="py-10 text-sm text-slate-500">Cargando...</p>

    <template v-else-if="library">
      <!-- ================= Cabecera ================= -->
      <header class="pt-6">
        <RouterLink :to="{ name: 'dashboard' }" class="text-sm text-brand-600 hover:underline">
          &larr; Bibliotecas
        </RouterLink>

        <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="text-2xl font-black text-slate-900">{{ library.name }}</h1>

            <!-- Las cifras que un docente quiere de un vistazo, sin bajar a buscarlas -->
            <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span><strong class="text-slate-800">{{ resumen.libros }}</strong> libros</span>
              <span><strong class="text-slate-800">{{ resumen.paginas }}</strong> páginas</span>
              <span v-if="isManager"><strong class="text-slate-800">{{ resumen.alumnos }}</strong> alumnos</span>
              <span class="font-mono text-xs tracking-widest text-brand-700">{{ library.codeInvite }}</span>
            </p>
          </div>

          <div v-if="isManager" class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" @click="showAddStudents = true">Añadir alumnos</button>
            <button type="button" class="btn-primary" :disabled="busy" @click="createBook()">Nuevo libro</button>
          </div>
        </div>
      </header>

      <!-- ================= Pestañas ================= -->
      <!-- Sticky: en listas largas la navegación no debe quedarse arriba del todo -->
      <nav
        v-if="pestanasVisibles.length > 1"
        class="sticky top-0 z-20 -mx-4 mt-5 border-b border-slate-200 bg-white/95 px-4 backdrop-blur"
        aria-label="Secciones de la biblioteca"
      >
        <ul class="flex gap-1 overflow-x-auto">
          <li v-for="opcion in pestanasVisibles" :key="opcion.id">
            <button
              type="button"
              class="whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition"
              :class="pestana === opcion.id
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'"
              :aria-current="pestana === opcion.id ? 'page' : undefined"
              @click="pestana = opcion.id"
            >
              <span aria-hidden="true">{{ opcion.icono }}</span> {{ opcion.label }}
            </button>
          </li>
        </ul>
      </nav>

      <div class="mt-4 space-y-2">
        <AlertMessage :message="error" />
        <AlertMessage :message="notice" variant="success" />
      </div>

      <!-- ================= Cuestionarios ================= -->
      <!-- v-if y no v-show: la lista se pide al servidor solo si se entra aqui. -->
      <section v-if="pestana === 'examenes'" class="mt-5">
        <QuizList :library-id="libraryId" :is-manager="isManager" />
      </section>

      <!-- ================= Libros ================= -->
      <section v-show="pestana === 'libros'" class="mt-5">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <div class="flex flex-wrap items-center gap-1">
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
          </div>

          <!-- El borrado masivo vive en la vista de lista, que es donde se marca -->
          <div v-if="isManager && vista === 'lista'" class="ml-auto flex items-center gap-3">
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

          <form v-else class="ml-auto flex flex-wrap items-center gap-2" @submit.prevent="createBook">
            <input
              v-model.trim="newBookTitle"
              type="text"
              maxlength="255"
              class="input max-w-[12rem] py-1.5 text-sm"
              placeholder="Título del libro"
            />
            <select v-model="newBookFormat" class="input max-w-[8rem] py-1.5 text-sm" aria-label="Formato de página">
              <option value="square">Cuadrado</option>
              <option value="portrait">Vertical</option>
              <option value="landscape">Apaisado</option>
            </select>
            <button type="submit" class="btn-secondary px-3 py-1.5 text-sm" :disabled="busy">Crear</button>
          </form>
        </div>

        <p v-if="!books.length" class="card p-10 text-center text-sm text-slate-500">
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
              <div class="mt-2 grid grid-cols-3 gap-1">
                <button type="button" class="btn-secondary px-1 text-xs" @click="valorando = book">Valorar</button>
                <button type="button" class="btn-secondary px-1 text-xs" @click="bitacora = book">Bitácora</button>
                <button type="button" class="btn-secondary px-1 text-xs" @click="entregando = book">Entregar</button>
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

      <!-- ================= Valoraciones ================= -->
      <!-- v-if, no v-show: la cuadricula consulta al servidor al montarse y no tiene
           sentido pedirla a quien nunca abre esta pestana. -->
      <div v-if="isManager && pestana === 'notas'" class="mt-5">
        <GradeBookGrid ref="cuadricula" :library-id="libraryId" />
      </div>

      <!-- ================= Alumnado ================= -->
      <section v-if="isManager" v-show="pestana === 'alumnado'" class="mt-5">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <input
            v-model.trim="search"
            type="search"
            class="input max-w-xs py-1.5 text-sm"
            placeholder="Buscar alumno..."
          />
          <div class="ml-auto flex flex-wrap gap-2">
            <button type="button" class="btn-secondary px-3 py-1.5 text-sm" @click="showAddStudents = true">
              👥 Añadir de otros cursos
            </button>
            <button
              v-if="phidiasEnabled"
              type="button"
              class="btn-secondary px-3 py-1.5 text-sm"
              @click="showPhidias = true"
            >🎓 Traer de Phidias</button>
          </div>
        </div>

        <ClavesEntregadas v-if="claves.length" class="mb-4" :credentials="claves" @close="claves = []" />

        <!-- Alta rápida con QR, para quien no tiene correo institucional -->
        <form class="card mb-4 flex flex-wrap items-end gap-2 p-4" @submit.prevent="addStudent">
          <div class="min-w-[14rem] flex-1">
            <label class="label" for="nuevo-alumno">Crear un alumno nuevo (acceso por QR)</label>
            <input
              id="nuevo-alumno"
              v-model.trim="studentName"
              type="text"
              required
              minlength="2"
              class="input py-1.5 text-sm"
              placeholder="Nombre y apellido"
            />
          </div>
          <button type="submit" class="btn-secondary px-3 py-1.5 text-sm" :disabled="busy">Crear y generar QR</button>
        </form>

        <div v-if="credential" class="card mb-4 flex flex-wrap items-center gap-5 p-5">
          <img
            :src="credential.qrDataUrl"
            :alt="`Código QR de ${credential.user.fullName}`"
            class="h-32 w-32 rounded-lg border border-slate-200"
          />
          <div class="min-w-0 flex-1">
            <h3 class="font-bold text-slate-900">{{ credential.user.fullName }}</h3>
            <p class="mt-1 text-sm text-slate-500">Imprime o muestra este QR para que el alumno inicie sesión.</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <a
                :href="credential.qrDataUrl"
                :download="`qr-${credential.user.fullName.replace(/\s+/g, '-').toLowerCase()}.png`"
                class="btn-secondary"
              >Descargar PNG</a>
              <button type="button" class="btn-secondary" @click="credential = null">Cerrar</button>
            </div>
          </div>
        </div>

        <p v-if="!alumnado.length" class="card p-10 text-center text-sm text-slate-500">
          Aún no hay alumnos inscritos en esta biblioteca.
        </p>

        <div v-else class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2">Alumno</th>
                <th class="px-4 py-2">Curso</th>
                <th class="px-4 py-2 text-right">Libros</th>
                <th class="px-4 py-2 text-right">Páginas</th>
                <th class="px-4 py-2 text-right">Publicados</th>
                <th class="px-4 py-2">Última actividad</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="alumno in alumnado" :key="alumno.studentId" class="hover:bg-slate-50">
                <td class="px-4 py-2">
                  <span class="block font-medium text-slate-800">{{ alumno.studentName }}</span>
                  <span class="block text-xs text-slate-500">{{ alumno.email || 'Accede con QR' }}</span>
                </td>
                <td class="px-4 py-2">
                  <span
                    v-if="alumno.course"
                    class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600"
                  >{{ alumno.course }}</span>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
                <td class="px-4 py-2 text-right tabular-nums text-slate-700">{{ alumno.bookCount }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-slate-700">{{ alumno.totalPages }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-slate-700">{{ alumno.publishedCount }}</td>
                <td class="px-4 py-2 text-xs text-slate-500">{{ formatDate(alumno.lastActivityAt) }}</td>
                <td class="px-4 py-2 text-right">
                  <span class="flex justify-end gap-3">
                    <button
                      type="button"
                      class="text-xs font-semibold text-slate-500 hover:underline"
                      title="Lo quita de esta biblioteca; su trabajo se conserva"
                      @click="removeStudent(alumno.studentId, alumno.studentName)"
                    >Sacar</button>
                    <button
                      type="button"
                      class="text-xs font-semibold text-red-600 hover:underline"
                      title="Borra su cuenta y todo su contenido"
                      @click="deleteStudent(alumno.studentId, alumno.studentName)"
                    >Borrar</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="classView && classView.totalPages > 1" class="mt-4 flex items-center justify-center gap-3">
          <button type="button" class="btn-secondary" :disabled="page <= 1" @click="page -= 1">Anterior</button>
          <span class="text-sm text-slate-600">Página {{ classView.page }} de {{ classView.totalPages }}</span>
          <button
            type="button"
            class="btn-secondary"
            :disabled="page >= classView.totalPages"
            @click="page += 1"
          >Siguiente</button>
        </div>

        <!-- Equipo docente -->
        <div class="mt-8">
          <h2 class="mb-3 font-bold text-slate-800">Equipo docente</h2>

          <form class="card mb-3 flex flex-wrap items-end gap-2 p-4" @submit.prevent="addCoTeacher">
            <div class="min-w-[16rem] flex-1">
              <label class="label" for="co-docente">Invitar co-docente</label>
              <input
                id="co-docente"
                v-model.trim="coTeacherEmail"
                type="email"
                required
                class="input py-1.5 text-sm"
                placeholder="colega@escuela.edu"
              />
            </div>
            <button type="submit" class="btn-secondary px-3 py-1.5 text-sm" :disabled="busy">Invitar</button>
          </form>

          <ul v-if="members" class="card divide-y divide-slate-100">
            <li class="flex items-center justify-between gap-3 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-800">{{ members.owner.fullName }}</p>
                <p class="truncate text-xs text-slate-500">{{ members.owner.email }}</p>
              </div>
              <span class="shrink-0 rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                Propietario
              </span>
            </li>
            <li
              v-for="teacher in members.teachers"
              :key="teacher.id"
              class="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-800">{{ teacher.fullName }}</p>
                <p class="truncate text-xs text-slate-500">{{ teacher.email }}</p>
              </div>
              <button
                v-if="library.ownerId === auth.user?.id"
                type="button"
                class="btn-danger shrink-0"
                @click="removeCoTeacher(teacher.id)"
              >Quitar</button>
            </li>
          </ul>
        </div>
      </section>

      <!-- ================= Ajustes ================= -->
      <section v-if="isManager" v-show="pestana === 'ajustes'" class="mt-5 grid gap-4 lg:grid-cols-2">
        <div class="card p-5">
          <h2 class="mb-1 font-bold text-slate-800">Qué pueden hacer los alumnos</h2>
          <p class="mb-4 text-xs text-slate-500">Se aplica a todos los miembros de esta biblioteca.</p>

          <div class="space-y-3 text-sm">
            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                :checked="library.studentEditable"
                class="mt-1 h-4 w-4 rounded"
                @change="toggleSetting('studentEditable')"
              />
              <span>
                Editar sus libros
                <span class="block text-xs text-slate-500">Sin esto solo pueden leerlos.</span>
              </span>
            </label>

            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                :checked="library.studentPublishable"
                class="mt-1 h-4 w-4 rounded"
                @change="toggleSetting('studentPublishable')"
              />
              <span>
                Publicar sus libros
                <span class="block text-xs text-slate-500">Publicar los hace visibles fuera de la clase.</span>
              </span>
            </label>

            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                :checked="library.commentsEnabled"
                class="mt-1 h-4 w-4 rounded"
                @change="toggleSetting('commentsEnabled')"
              />
              <span>Comentarios habilitados</span>
            </label>

            <label class="flex items-start gap-2 border-t border-slate-100 pt-3">
              <input
                type="checkbox"
                :checked="library.studentsSeePeers"
                class="mt-1 h-4 w-4 rounded"
                @change="toggleSetting('studentsSeePeers')"
              />
              <span>
                Ver las creaciones de los compañeros
                <span class="block text-xs text-slate-500">
                  Si lo apagas, cada alumno solo verá sus libros, los que entregues tú y los colaborativos.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div class="card p-5 lg:col-span-2">
          <h2 class="mb-1 font-bold text-slate-800">Herramientas del editor</h2>
          <p class="mb-4 text-xs text-slate-500">
            Lo que el alumnado puede insertar en sus libros. Todas vienen activadas; apaga las que
            no quieras en esta clase.
            <span v-if="vetadasCuenta" class="font-semibold text-amber-700">
              {{ vetadasCuenta }} apagada(s).
            </span>
            A ti no te afecta: tú sigues teniéndolas todas.
          </p>

          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="tool in herramientas"
              :key="tool.id"
              class="flex items-start gap-2 rounded-lg border p-2.5 text-sm transition"
              :class="herramientaActiva(tool.id) ? 'border-slate-200' : 'border-amber-300 bg-amber-50'"
            >
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded"
                :checked="herramientaActiva(tool.id)"
                :disabled="guardandoHerramientas"
                @change="alternarHerramienta(tool.id)"
              />
              <span class="min-w-0">
                <span class="font-semibold text-slate-800">{{ tool.label }}</span>
                <span class="block text-xs leading-tight text-slate-500">{{ tool.hint }}</span>
              </span>
            </label>
          </div>
        </div>

        <div class="card p-5">
          <h2 class="mb-1 font-bold text-slate-800">Cómo se entra a esta biblioteca</h2>
          <p class="mb-4 text-xs text-slate-500">Reparte el código o el enlace; ambos hacen lo mismo.</p>

          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Código</p>
          <p class="font-mono text-2xl font-black tracking-widest text-brand-700">{{ library.codeInvite }}</p>

          <p class="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Enlace directo</p>
          <div class="mt-1 flex items-center gap-2">
            <input
              :value="joinUrl"
              readonly
              class="input py-1 font-mono text-xs"
              aria-label="Enlace de inscripción"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button type="button" class="btn-secondary shrink-0 px-2 py-1 text-xs" @click="copyJoinUrl">
              {{ copied ? 'Copiado' : 'Copiar' }}
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            No todo el mundo puede escanear un QR: el enlace sirve por chat o correo.
          </p>
        </div>
      </section>

      <!-- ================= Diálogos ================= -->
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
    </template>
  </div>
</template>
