<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import OpcionesEntregaForm from '@/components/library/OpcionesEntrega.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { booksApi, librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { Book, BookDetail, DestinoTransferencia, Library, LibraryMember, TransferResult } from '@/types/api';
import {
  cuerpoEntrega,
  entregaPorDefecto,
  faltaEnEntrega,
  type EntregaEnBiblioteca,
  type OpcionesEntrega,
} from '@/utils/entrega';


/**
 * Pasar un libro de "Mis libros" a una o varias bibliotecas.
 *
 * Por defecto se copia: cada biblioteca marcada recibe una copia y el original
 * sigue en Mis libros. Si se desmarca "conservar", el libro se MUEVE a la primera
 * biblioteca marcada (con su enlace, su sitio en el mural y su historial) y en las
 * demas queda una copia.
 *
 * El profesorado puede ademas entregarlo al alumnado en el mismo paso, a toda la
 * clase o solo a quien marque: lo que se entrega es lo que queda en cada
 * biblioteca, como si despues se pulsara "Entregar" en cada una, con las mismas
 * opciones de que paginas y donde caen.
 */
const props = defineProps<{ book: Book }>();
const emit = defineEmits<{ close: []; done: [resultado: TransferResult, entregas: EntregaEnBiblioteca[]] }>();
const cierre = useCierreExterior(() => emit('close'));
const auth = useAuthStore();

const esAlumno = computed(() => auth.user?.role === 'student');
const bibliotecas = ref<Library[]>([]);
const cargando = ref(true);
const enviando = ref(false);
const error = ref<string | null>(null);

/** En el orden en que se marcaron: la primera es la que recibe el original. */
const elegidas = ref<string[]>([]);
/**
 * Marcado de salida: lo que mas se hace es llevar una copia a las clases y
 * quedarse con el original. Moverlo es la excepcion y hay que pedirlo.
 */
const conservar = ref(true);

/** El alumnado no entrega material: solo puede llevar libros a sus bibliotecas. */
const puedeEntregar = computed(() => !esAlumno.value);
const entregar = ref(false);
const opciones = ref<OpcionesEntrega>(entregaPorDefecto(props.book.title));
/** El libro con sus paginas, para poder marcar cuales se entregan. */
const detalle = ref<BookDetail | null>(null);

watch(entregar, async (activo) => {
  if (!activo || detalle.value) return;
  try {
    detalle.value = await booksApi.get(props.book.id);
  } catch (err) {
    error.value = errorMessage(err);
  }
});

/* --- A quien se entrega: toda la clase o alumnos concretos de cada biblioteca --- */
const aQuien = ref<'todos' | 'algunos'>('todos');
/** Alumnado de cada biblioteca, segun se va necesitando. */
const alumnosDe = ref<Record<string, LibraryMember[]>>({});
const cargandoAlumnos = ref(new Set<string>());
/** Marcados por biblioteca: el mismo alumno puede estar en dos clases. */
const marcados = ref<Record<string, string[]>>({});
const filtro = ref('');

watch(
  [entregar, aQuien, elegidas],
  async () => {
    if (!entregar.value || aQuien.value !== 'algunos') return;
    for (const id of elegidas.value) {
      if (alumnosDe.value[id] || cargandoAlumnos.value.has(id)) continue;
      cargandoAlumnos.value = new Set(cargandoAlumnos.value).add(id);
      try {
        const miembros = await librariesApi.members(id);
        alumnosDe.value = { ...alumnosDe.value, [id]: miembros.students };
      } catch (err) {
        error.value = errorMessage(err);
      } finally {
        const resto = new Set(cargandoAlumnos.value);
        resto.delete(id);
        cargandoAlumnos.value = resto;
      }
    }
  },
  { deep: true },
);

/** Como se pasa lista: apellidos primero, si se conocen. */
function nombreAlumno(a: LibraryMember): string {
  return a.familyName && a.givenName ? `${a.familyName} ${a.givenName}` : a.fullName;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function visibles(libraryId: string): LibraryMember[] {
  const todos = alumnosDe.value[libraryId] ?? [];
  const q = sinTildes(filtro.value.trim());
  return q ? todos.filter((a) => sinTildes(`${a.fullName} ${a.course ?? ''}`).includes(q)) : todos;
}

function alternarAlumno(libraryId: string, studentId: string): void {
  const actuales = marcados.value[libraryId] ?? [];
  marcados.value = {
    ...marcados.value,
    [libraryId]: actuales.includes(studentId) ? actuales.filter((x) => x !== studentId) : [...actuales, studentId],
  };
}

/** Marca o desmarca de una vez los que se ven (con el filtro aplicado). */
function marcarVisibles(libraryId: string, marcar: boolean): void {
  const ids = visibles(libraryId).map((a) => a.id);
  const actuales = new Set(marcados.value[libraryId] ?? []);
  for (const id of ids) {
    if (marcar) actuales.add(id);
    else actuales.delete(id);
  }
  marcados.value = { ...marcados.value, [libraryId]: [...actuales] };
}

const marcadosEn = (libraryId: string) => marcados.value[libraryId]?.length ?? 0;
const totalMarcados = computed(() => elegidas.value.reduce((n, id) => n + marcadosEn(id), 0));

const faltaEntrega = computed(() => {
  if (!entregar.value) return null;
  if (aQuien.value === 'algunos' && !totalMarcados.value) return 'Marca al menos un alumno';
  return faltaEnEntrega(opciones.value);
});

onMounted(async () => {
  try {
    // Las propias, no las de todo el colegio aunque la administracion las este
    // viendo: "a mis bibliotecas" es lo que se ha pedido.
    const todas = await librariesApi.list(false);
    // El alumnado solo puede llevar libros a las bibliotecas donde edita; las que
    // tienen los libros nuevos bloqueados se ven, pero no se pueden marcar.
    bibliotecas.value = esAlumno.value ? todas.filter((l) => l.studentEditable) : todas;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});

/** Para el alumnado, si el docente ha bloqueado los libros nuevos ahi. */
const bloqueada = (l: Library) => esAlumno.value && !l.studentsCanCreate;

function alternar(id: string): void {
  elegidas.value = elegidas.value.includes(id)
    ? elegidas.value.filter((x) => x !== id)
    : [...elegidas.value, id];
}

const nombreDe = (id: string) => bibliotecas.value.find((l) => l.id === id)?.name ?? '';

/** Lo que va a pasar, dicho antes de pulsar. */
const resumen = computed(() => {
  const n = elegidas.value.length;
  if (!n) return null;
  if (conservar.value) {
    return n === 1
      ? `Se copiará a «${nombreDe(elegidas.value[0])}» y seguirá también en Mis libros.`
      : `Se copiará a ${n} bibliotecas y seguirá también en Mis libros.`;
  }
  const destino = `«${nombreDe(elegidas.value[0])}»`;
  if (n === 1) return `Se moverá a ${destino} y dejará de estar en Mis libros.`;
  const resto = n === 2 ? 'en la otra quedará una copia' : `en las otras ${n - 1} quedará una copia`;
  return `Se moverá a ${destino} y ${resto}. Dejará de estar en Mis libros.`;
});

/**
 * Entrega lo que acaba de quedar en una biblioteca. Las paginas marcadas son las
 * del original; en la copia estan en el mismo orden, asi que se traducen por
 * posicion.
 */
async function entregarEn(destino: DestinoTransferencia, studentIds?: string[]): Promise<EntregaEnBiblioteca> {
  try {
    let pageIds: string[] = [];
    if (opciones.value.alcance === 'paginas') {
      const posiciones = (detalle.value?.pages ?? [])
        .map((p, i) => (opciones.value.pageIds.includes(p.id) ? i : -1))
        .filter((i) => i >= 0);
      const copia = destino.bookId === props.book.id ? detalle.value : await booksApi.get(destino.bookId);
      pageIds = posiciones.map((i) => copia?.pages[i]?.id).filter((id): id is string => Boolean(id));
    }
    const result = await librariesApi.distribute(destino.libraryId, {
      sourceBookId: destino.bookId,
      ...cuerpoEntrega(opciones.value, pageIds),
      studentIds,
    });
    return { libraryName: destino.libraryName, result };
  } catch (err) {
    return { libraryName: destino.libraryName, error: errorMessage(err) };
  }
}

async function transferir(): Promise<void> {
  if (!elegidas.value.length || faltaEntrega.value) return;
  enviando.value = true;
  error.value = null;
  try {
    const resultado = await booksApi.transfer(props.book.id, {
      libraryIds: elegidas.value,
      keepPersonal: conservar.value,
    });
    const entregas: EntregaEnBiblioteca[] = [];
    if (entregar.value) {
      // Una tras otra: cada entrega copia paginas para toda una clase.
      for (const destino of [...(resultado.moved ? [resultado.moved] : []), ...resultado.copies]) {
        if (aQuien.value === 'todos') {
          entregas.push(await entregarEn(destino));
          continue;
        }
        // Con alumnos elegidos, la biblioteca en la que no se marco a nadie
        // recibe el libro pero no entrega nada.
        const ids = marcados.value[destino.libraryId] ?? [];
        if (ids.length) entregas.push(await entregarEn(destino, ids));
      }
    }
    emit('done', resultado, entregas);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <!--
    En pantallas pequenas el dialogo ocupa el alto disponible: la cabecera y los
    botones se quedan fijos y solo se desplaza lo de en medio, para que "Copiar"
    no acabe fuera de la vista.
  -->
  <div
    class="fixed inset-0 z-[9400] flex items-end justify-center bg-slate-900/70 sm:items-center sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="transferir-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div
      data-pasar-biblioteca
      class="flex max-h-[100dvh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl"
      :class="entregar ? 'sm:max-w-2xl' : 'sm:max-w-lg'"
    >
      <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:p-5">
        <div class="min-w-0">
          <h2 id="transferir-titulo" class="text-base font-black text-slate-900 sm:text-lg">Pasar a biblioteca</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500" :title="book.title">{{ book.title }}</p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:p-5">
        <AlertMessage class="mb-3" :message="error" />

        <p v-if="cargando" class="text-sm text-slate-500">Cargando tus bibliotecas...</p>

        <p v-else-if="!bibliotecas.length" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No tienes ninguna biblioteca donde dejar libros. Crea una o únete con un código y vuelve a
          intentarlo.
        </p>

        <template v-else>
          <p class="text-sm font-semibold text-slate-700">Elige una o varias</p>
          <ul class="mt-2 max-h-[min(18rem,38dvh)] space-y-1 overflow-y-auto pr-1">
            <li v-for="biblioteca in bibliotecas" :key="biblioteca.id">
              <label
                class="flex items-center gap-3 rounded-lg border px-3 py-1.5 transition sm:py-2"
                :class="bloqueada(biblioteca)
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                  : elegidas.includes(biblioteca.id)
                    ? 'cursor-pointer border-brand-500 bg-brand-50'
                    : 'cursor-pointer border-slate-200 hover:bg-slate-50'"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 shrink-0 rounded"
                  :checked="elegidas.includes(biblioteca.id)"
                  :disabled="bloqueada(biblioteca)"
                  @change="alternar(biblioteca.id)"
                />
                <span class="min-w-0 flex-1 truncate text-sm text-slate-800">{{ biblioteca.name }}</span>
                <span
                  v-if="bloqueada(biblioteca)"
                  class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800"
                  title="El docente ha bloqueado los libros nuevos en esta biblioteca"
                >Bloqueada</span>
                <!-- Solo cuando se traslada importa cual es la primera -->
                <span
                  v-else-if="!conservar && elegidas.length > 1 && elegidas[0] === biblioteca.id"
                  class="shrink-0 rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white"
                >Original</span>
                <span
                  v-else-if="elegidas.includes(biblioteca.id) && (conservar || elegidas.length > 1)"
                  class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600"
                >Copia</span>
              </label>
            </li>
          </ul>

          <label class="mt-3 flex items-start gap-2 sm:mt-4">
            <input v-model="conservar" type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 rounded" />
            <span class="text-sm text-slate-700">
              Conservar también en Mis libros
              <span class="block text-xs text-slate-500">
                Si lo marcas, en cada biblioteca queda una copia y el original no se mueve.
              </span>
            </span>
          </label>

          <p v-if="resumen" class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:mt-4">
            {{ resumen }}
          </p>

          <!-- Entregar al alumnado en el mismo paso -->
          <div v-if="puedeEntregar" class="mt-3 rounded-lg border border-slate-200 p-3 sm:mt-4">
            <label class="flex items-start gap-2">
              <input v-model="entregar" type="checkbox" data-entregar class="mt-0.5 h-4 w-4 shrink-0 rounded" />
              <span class="text-sm text-slate-700">
                Entregarlo también a los alumnos
                <span class="block text-xs text-slate-500">
                  Cada alumno recibe su propia copia, como con «Entregar»: a toda la clase o solo a los que
                  marques.
                </span>
              </span>
            </label>

            <div v-if="entregar" class="mt-4 space-y-5">
              <!-- A quién -->
              <fieldset>
                <legend class="text-xs font-bold uppercase tracking-wide text-slate-500">A quién</legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <label
                    class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm"
                    :class="aQuien === 'todos' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
                  >
                    <input v-model="aQuien" type="radio" value="todos" class="h-4 w-4" />
                    Todos los alumnos
                  </label>
                  <label
                    class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm"
                    :class="aQuien === 'algunos' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
                  >
                    <input v-model="aQuien" type="radio" value="algunos" data-a-quien-algunos class="h-4 w-4" />
                    Solo algunos alumnos
                  </label>
                </div>

                <template v-if="aQuien === 'algunos'">
                  <p v-if="!elegidas.length" class="mt-3 text-sm text-slate-500">
                    Elige primero la biblioteca: aquí aparecerán sus alumnos.
                  </p>
                  <template v-else>
                    <input
                      v-model="filtro"
                      type="search"
                      data-filtro-alumnos
                      class="input mt-3 w-full"
                      placeholder="Buscar alumno..."
                    />
                    <div v-for="id in elegidas" :key="id" class="mt-3" :data-alumnos-de="id">
                      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p class="min-w-0 truncate text-sm font-semibold text-slate-700">
                          {{ nombreDe(id) }}
                          <span class="font-normal text-slate-500">· {{ marcadosEn(id) }} marcados</span>
                        </p>
                        <span v-if="visibles(id).length" class="flex gap-3 text-xs font-semibold">
                          <button type="button" class="text-brand-700 hover:underline" @click="marcarVisibles(id, true)">
                            Marcar todos
                          </button>
                          <button type="button" class="text-slate-500 hover:underline" @click="marcarVisibles(id, false)">
                            Ninguno
                          </button>
                        </span>
                      </div>
                      <p v-if="cargandoAlumnos.has(id) && !alumnosDe[id]" class="mt-1 text-sm text-slate-500">
                        Cargando alumnos...
                      </p>
                      <p v-else-if="!alumnosDe[id]?.length" class="mt-1 text-sm text-amber-700">
                        Esta biblioteca no tiene alumnos.
                      </p>
                      <p v-else-if="!visibles(id).length" class="mt-1 text-sm text-slate-500">Nadie coincide.</p>
                      <ul
                        v-else
                        class="mt-1 max-h-[min(14rem,35dvh)] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
                      >
                        <li v-for="alumno in visibles(id)" :key="alumno.id">
                          <label class="flex cursor-pointer items-center gap-3 px-2.5 py-2 text-sm hover:bg-slate-50">
                            <input
                              type="checkbox"
                              class="h-4 w-4 shrink-0 rounded"
                              :checked="marcados[id]?.includes(alumno.id)"
                              @change="alternarAlumno(id, alumno.id)"
                            />
                            <span class="min-w-0 flex-1 truncate text-slate-800">{{ nombreAlumno(alumno) }}</span>
                            <span v-if="alumno.course" class="shrink-0 text-xs text-slate-400">{{ alumno.course }}</span>
                          </label>
                        </li>
                      </ul>
                    </div>
                  </template>
                </template>
              </fieldset>

              <p v-if="!detalle" class="text-sm text-slate-500">Cargando las páginas...</p>
              <OpcionesEntregaForm
                v-else
                v-model="opciones"
                :pages="detalle.pages"
                :layout-format="detalle.layoutFormat"
              />
            </div>
          </div>
        </template>
      </div>

      <footer
        v-if="!cargando && bibliotecas.length"
        class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5"
      >
        <p v-if="faltaEntrega" class="mr-auto text-sm text-amber-700">{{ faltaEntrega }}</p>
        <p v-else-if="entregar && aQuien === 'algunos' && totalMarcados" class="mr-auto text-sm text-slate-500">
          {{ totalMarcados === 1 ? '1 alumno' : `${totalMarcados} alumnos` }}
        </p>
        <button type="button" class="btn-secondary" :disabled="enviando" @click="emit('close')">
          Cancelar
        </button>
        <button
          type="button"
          data-pasar
          class="btn-primary"
          :disabled="enviando || !elegidas.length || Boolean(faltaEntrega) || (entregar && !detalle)"
          @click="transferir"
        >{{
          enviando
            ? entregar ? 'Pasando y entregando...' : 'Pasando...'
            : `${conservar ? 'Copiar' : 'Pasar'}${entregar ? ' y entregar' : ''}`
        }}</button>
      </footer>
    </div>
  </div>
</template>
