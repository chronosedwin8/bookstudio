<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { booksApi, librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { Book, Library, TransferResult } from '@/types/api';

/**
 * Pasar un libro de "Mis libros" a una o varias bibliotecas.
 *
 * Por defecto se copia: cada biblioteca marcada recibe una copia y el original
 * sigue en Mis libros. Si se desmarca "conservar", el libro se MUEVE a la primera
 * biblioteca marcada (con su enlace, su sitio en el mural y su historial) y en las
 * demas queda una copia.
 */
const props = defineProps<{ book: Book }>();
const emit = defineEmits<{ close: []; done: [resultado: TransferResult] }>();
const cierre = useCierreExterior(() => emit('close'));
const auth = useAuthStore();

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

onMounted(async () => {
  try {
    // Las propias, no las de todo el colegio aunque la administracion las este
    // viendo: "a mis bibliotecas" es lo que se ha pedido.
    const todas = await librariesApi.list(false);
    // El alumnado solo puede llevar libros a las bibliotecas que le dejan crear.
    bibliotecas.value = auth.user?.role === 'student' ? todas.filter((l) => l.studentEditable) : todas;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});

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

async function transferir(): Promise<void> {
  if (!elegidas.value.length) return;
  enviando.value = true;
  error.value = null;
  try {
    const resultado = await booksApi.transfer(props.book.id, {
      libraryIds: elegidas.value,
      keepPersonal: conservar.value,
    });
    emit('done', resultado);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9400] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="transferir-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-lg rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="transferir-titulo" class="text-lg font-black text-slate-900">Pasar a biblioteca</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500" :title="book.title">{{ book.title }}</p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <p v-if="cargando" class="text-sm text-slate-500">Cargando tus bibliotecas...</p>

        <p v-else-if="!bibliotecas.length" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No tienes ninguna biblioteca donde dejar libros. Crea una o únete con un código y vuelve a
          intentarlo.
        </p>

        <template v-else>
          <p class="text-sm font-semibold text-slate-700">Elige una o varias</p>
          <ul class="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
            <li v-for="biblioteca in bibliotecas" :key="biblioteca.id">
              <label
                class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition"
                :class="elegidas.includes(biblioteca.id)
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:bg-slate-50'"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded"
                  :checked="elegidas.includes(biblioteca.id)"
                  @change="alternar(biblioteca.id)"
                />
                <span class="min-w-0 flex-1 truncate text-sm text-slate-800">{{ biblioteca.name }}</span>
                <!-- Solo cuando se traslada importa cual es la primera -->
                <span
                  v-if="!conservar && elegidas.length > 1 && elegidas[0] === biblioteca.id"
                  class="shrink-0 rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white"
                >Original</span>
                <span
                  v-else-if="elegidas.includes(biblioteca.id) && (conservar || elegidas.length > 1)"
                  class="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600"
                >Copia</span>
              </label>
            </li>
          </ul>

          <label class="mt-4 flex items-start gap-2">
            <input v-model="conservar" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
            <span class="text-sm text-slate-700">
              Conservar también en Mis libros
              <span class="block text-xs text-slate-500">
                Si lo marcas, en cada biblioteca queda una copia y el original no se mueve.
              </span>
            </span>
          </label>

          <p v-if="resumen" class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {{ resumen }}
          </p>

          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="btn-secondary" :disabled="enviando" @click="emit('close')">
              Cancelar
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="enviando || !elegidas.length"
              @click="transferir"
            >{{ enviando ? 'Pasando...' : conservar ? 'Copiar' : 'Pasar' }}</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
