<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { booksApi, librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { Book, LayoutFormat } from '@/types/api';

/**
 * Un libro para cada alumno de la biblioteca, de una vez.
 *
 * Se ofrece nada mas crear la biblioteca desde Phidias, que es cuando ya hay
 * alumnado, y tambien desde la propia biblioteca para cualquier momento. Dos
 * formas: un libro en blanco, o una copia de uno de "Mis libros" del docente.
 * Repetirla no duplica: se salta a quien ya tiene su libro.
 */
const props = defineProps<{
  libraryId: string;
  libraryName: string;
  /** Cuantos alumnos hay, para decirlo antes de crear nada. */
  studentCount?: number;
  /** Texto de cabecera: tras crear la biblioteca se explica que es opcional. */
  recienCreada?: boolean;
}>();
const emit = defineEmits<{ close: []; done: [mensaje: string] }>();
const cierre = useCierreExterior(() => emit('close'));

const modo = ref<'blank' | 'copy'>('blank');
const titulo = ref(props.libraryName);
const formato = ref<LayoutFormat>('square');
const soloSinLibro = ref(true);

const misLibros = ref<Book[]>([]);
const fuente = ref('');
const cargandoLibros = ref(true);
const enviando = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    misLibros.value = await booksApi.list({ scope: 'personal' });
  } catch {
    // Sin la lista no se puede copiar, pero en blanco sigue funcionando.
  } finally {
    cargandoLibros.value = false;
  }
});

const listo = computed(() => (modo.value === 'blank' ? titulo.value.trim().length > 0 : Boolean(fuente.value)));

async function crear(): Promise<void> {
  if (!listo.value) return;
  enviando.value = true;
  error.value = null;
  try {
    const r = modo.value === 'blank'
      ? await librariesApi.studentBooks(props.libraryId, {
          mode: 'blank',
          title: titulo.value.trim(),
          layoutFormat: formato.value,
          onlyWithoutBook: soloSinLibro.value,
        })
      : await librariesApi.studentBooks(props.libraryId, { mode: 'copy', sourceBookId: fuente.value });

    const partes = [`${r.created} ${r.created === 1 ? 'libro creado' : 'libros creados'}`];
    if (r.skipped) partes.push(`${r.skipped} ya ${r.skipped === 1 ? 'tenía' : 'tenían'} el suyo`);
    emit('done', `Libros para el alumnado de «${props.libraryName}»: ${partes.join(' · ')}.`);
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
    aria-labelledby="libros-alumnado-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <form class="mx-auto w-full max-w-lg rounded-xl bg-white shadow-2xl" @submit.prevent="crear">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="libros-alumnado-titulo" class="text-lg font-black text-slate-900">Libros para el alumnado</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            <template v-if="recienCreada">Biblioteca «{{ libraryName }}» creada. </template>
            ¿Quieres que cada alumno<template v-if="studentCount"> ({{ studentCount }})</template> tenga ya su libro?
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">
          {{ recienCreada ? 'Ahora no' : 'Cerrar' }}
        </button>
      </header>

      <div class="space-y-4 p-5">
        <AlertMessage :message="error" />

        <fieldset class="space-y-2">
          <legend class="sr-only">Qué libro recibe cada alumno</legend>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            :class="modo === 'blank' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
          >
            <input v-model="modo" type="radio" value="blank" class="mt-1" />
            <span>
              <span class="block font-semibold text-slate-800">Un libro en blanco para cada uno</span>
              <span class="block text-xs text-slate-500">Con el mismo título y formato; cada alumno lo llena a su manera.</span>
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            :class="modo === 'copy' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'"
          >
            <input v-model="modo" type="radio" value="copy" class="mt-1" />
            <span>
              <span class="block font-semibold text-slate-800">Una copia de uno de mis libros</span>
              <span class="block text-xs text-slate-500">Cada alumno recibe su propia copia, editable y a su nombre.</span>
            </span>
          </label>
        </fieldset>

        <template v-if="modo === 'blank'">
          <label class="block">
            <span class="label">Título del libro</span>
            <input v-model="titulo" type="text" class="input" maxlength="255" required />
          </label>
          <label class="block">
            <span class="label">Formato</span>
            <select v-model="formato" class="input">
              <option value="square">Cuadrado 1:1</option>
              <option value="portrait">Vertical 3:4</option>
              <option value="landscape">Apaisado 4:3</option>
            </select>
          </label>
          <label class="flex items-start gap-2">
            <input v-model="soloSinLibro" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
            <span class="text-sm text-slate-700">
              Solo a quien todavía no tenga libro en esta biblioteca
              <span class="block text-xs text-slate-500">Así puedes repetirlo cuando entre alumnado nuevo sin duplicar.</span>
            </span>
          </label>
        </template>

        <template v-else>
          <p v-if="cargandoLibros" class="text-sm text-slate-500">Cargando tus libros...</p>
          <p v-else-if="!misLibros.length" class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            No tienes libros en «Mis libros». Crea uno allí y vuelve a intentarlo, o elige un libro en blanco.
          </p>
          <label v-else class="block">
            <span class="label">¿Qué libro copio?</span>
            <select v-model="fuente" class="input" required>
              <option value="" disabled>Elige uno de tus libros</option>
              <option v-for="libro in misLibros" :key="libro.id" :value="libro.id">
                {{ libro.title }} · {{ libro.pageCount ?? 0 }} págs.
              </option>
            </select>
            <span class="mt-1 block text-xs text-slate-500">Quien ya tenga su copia de ese libro se salta.</span>
          </label>
        </template>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" :disabled="enviando" @click="emit('close')">
            {{ recienCreada ? 'Ahora no' : 'Cancelar' }}
          </button>
          <button type="submit" class="btn-primary" :disabled="enviando || !listo">
            {{ enviando ? 'Creando...' : 'Crear los libros' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
