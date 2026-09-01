<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useDictado } from '@/composables/useDictado';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import {
  NOTA_MAXIMA,
  NOTA_MINIMA,
  colorNota,
  etiquetaNota,
  fechaHora,
  formatoNota,
} from '@/utils/grades';
import type { Grade } from '@/types/api';

/**
 * Pone o corrige una valoracion.
 *
 * Con `grade` abre la ficha completa de una nota existente (con sus fechas) y permite
 * editarla; sin ella, crea una nueva.
 */
const props = defineProps<{
  bookId: string;
  bookTitle: string;
  studentName?: string;
  grade?: Grade | null;
  /** Sin permiso solo se lee: es la vista del alumno. */
  editable?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  saved: [grade: Grade];
  deleted: [gradeId: string];
}>();

const editando = ref(!props.grade);
const titulo = ref(props.grade?.title ?? '');
const nota = ref<string>(props.grade ? formatoNota(props.grade.score) : '');
const descripcion = ref(props.grade?.description ?? '');

const guardando = ref(false);
const error = ref<string | null>(null);
const campo = ref<HTMLInputElement | null>(null);

/**
 * Dictado del comentario. Se anade al final de lo ya escrito, separado por un
 * espacio, para poder combinar teclado y voz sin pisar nada.
 */
const dictado = useDictado((texto) => {
  const previo = descripcion.value.trimEnd();
  descripcion.value = previo ? `${previo} ${texto}` : texto;
});

onMounted(() => {
  if (editando.value) campo.value?.focus();
});

/** Se acepta la coma: es lo que tiene el teclado en espanol. */
const notaNumero = computed(() => Number(nota.value.trim().replace(',', '.')));
const notaValida = computed(
  () =>
    nota.value.trim() !== '' &&
    Number.isFinite(notaNumero.value) &&
    notaNumero.value >= NOTA_MINIMA &&
    notaNumero.value <= NOTA_MAXIMA,
);
const puedeGuardar = computed(() => titulo.value.trim().length >= 2 && notaValida.value && !guardando.value);

async function guardar(): Promise<void> {
  if (!puedeGuardar.value) return;
  guardando.value = true;
  error.value = null;
  const cuerpo = {
    title: titulo.value.trim(),
    score: Math.round(notaNumero.value * 10) / 10,
    description: descripcion.value.trim(),
  };
  try {
    const guardada = props.grade
      ? await booksApi.updateGrade(props.bookId, props.grade.id, cuerpo)
      : await booksApi.addGrade(props.bookId, cuerpo);
    emit('saved', guardada);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}

async function borrar(): Promise<void> {
  if (!props.grade) return;
  if (!window.confirm(`Borrar la valoración "${props.grade.title}"? No se puede deshacer.`)) return;
  guardando.value = true;
  error.value = null;
  try {
    await booksApi.removeGrade(props.bookId, props.grade.id);
    emit('deleted', props.grade.id);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9300] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="valoracion-titulo"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-lg rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="valoracion-titulo" class="text-lg font-black text-slate-900">
            {{ grade ? (editando ? 'Editar valoración' : 'Valoración') : 'Nueva valoración' }}
          </h2>
          <p class="mt-0.5 truncate text-sm text-slate-500">
            <span v-if="studentName">{{ studentName }} · </span>{{ bookTitle }}
          </p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <!-- Ficha de una nota ya puesta -->
        <template v-if="grade && !editando">
          <div class="flex items-center gap-4">
            <span
              class="grid h-16 w-16 shrink-0 place-items-center rounded-xl border-2 text-2xl font-black"
              :class="colorNota(grade.score)"
            >{{ formatoNota(grade.score) }}</span>
            <div class="min-w-0">
              <p class="font-bold text-slate-900">{{ grade.title }}</p>
              <p class="text-sm text-slate-500">{{ etiquetaNota(grade.score) }}</p>
            </div>
          </div>

          <dl class="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div class="flex flex-wrap gap-x-2">
              <dt class="font-semibold text-slate-600">Puesta el:</dt>
              <dd class="text-slate-700">{{ fechaHora(grade.createdAt) }}</dd>
            </div>
            <div v-if="grade.updatedAt !== grade.createdAt" class="flex flex-wrap gap-x-2">
              <dt class="font-semibold text-slate-600">Modificada el:</dt>
              <dd class="text-slate-700">{{ fechaHora(grade.updatedAt) }}</dd>
            </div>
            <div v-if="grade.teacherName" class="flex flex-wrap gap-x-2">
              <dt class="font-semibold text-slate-600">Docente:</dt>
              <dd class="text-slate-700">{{ grade.teacherName }}</dd>
            </div>
          </dl>

          <div class="mt-4 border-t border-slate-100 pt-4">
            <p class="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Por qué esta nota</p>
            <p v-if="grade.description" class="whitespace-pre-wrap text-sm text-slate-700">
              {{ grade.description }}
            </p>
            <p v-else class="text-sm italic text-slate-400">Sin comentario.</p>
          </div>
        </template>

        <!-- Formulario -->
        <form v-else class="space-y-4" @submit.prevent="guardar">
          <div>
            <label class="label" for="grade-titulo">Título</label>
            <input
              id="grade-titulo"
              ref="campo"
              v-model="titulo"
              type="text"
              required
              minlength="2"
              maxlength="120"
              class="input"
              placeholder="Revisión 1"
            />
          </div>

          <div>
            <label class="label" for="grade-nota">Nota</label>
            <div class="flex items-center gap-3">
              <!--
                Campo de texto, no type="number", y sin flechas.
                Con un campo numerico el navegador vacia el valor en los estados
                intermedios ("2." al escribir 2.5), rechaza la coma del teclado
                espanol y las flechas cambian el valor al pasar la rueda del raton.
                Aqui la validacion la hace notaValida, que acepta coma y punto.
              -->
              <input
                id="grade-nota"
                v-model="nota"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                maxlength="4"
                class="input w-28 text-center text-lg font-bold"
                placeholder="2.5"
              />
              <!--
                La etiqueta esta siempre montada y solo cambia su texto. Con v-if
                aparecia y desaparecia en cada tecla, y ese vaiven del DOM mientras
                se escribe es una fuente de problemas que no compensa.
              -->
              <span
                class="rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition"
                :class="notaValida ? colorNota(notaNumero) : 'border-transparent text-transparent'"
              >{{ notaValida ? etiquetaNota(notaNumero) : '—' }}</span>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              De 1.0 a 6.0, con un decimal. <strong>1.0 es la mejor nota</strong> y 6.0 la peor.
            </p>
          </div>

          <div>
            <div class="flex items-center justify-between gap-2">
              <label class="label mb-0" for="grade-descripcion">Por qué esta nota</label>

              <!--
                Donde no hay reconocimiento de voz se dice por que, en vez de
                esconder el boton sin mas: si no, parece que la funcion no existe.
              -->
              <span
                v-if="!dictado.soportado"
                class="text-xs text-slate-400"
                title="Firefox no incluye reconocimiento de voz. En Chrome, Edge o Safari aparece un botón para dictar."
              >Dictado no disponible en este navegador</span>

              <button
                v-else
                type="button"
                class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
                :class="dictado.escuchando.value
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700'"
                :aria-pressed="dictado.escuchando.value"
                :title="dictado.escuchando.value ? 'Dejar de dictar' : 'Dictar en voz alta'"
                @click="dictado.alternar"
              >
                <span
                  class="grid h-4 w-4 place-items-center"
                  :class="dictado.escuchando.value ? 'animate-pulse' : ''"
                  aria-hidden="true"
                >🎙️</span>
                {{ dictado.escuchando.value ? 'Escuchando...' : 'Dictar' }}
              </button>
            </div>

            <textarea
              id="grade-descripcion"
              v-model="descripcion"
              rows="5"
              maxlength="4000"
              class="input mt-1"
              :class="dictado.escuchando.value ? 'ring-2 ring-red-200' : ''"
              placeholder="Qué está bien, qué falta y qué conviene mejorar para la próxima."
            ></textarea>

            <!-- Lo que se esta oyendo pero aun no es definitivo -->
            <p v-if="dictado.provisional.value" class="mt-1 text-sm italic text-slate-400">
              {{ dictado.provisional.value }}
            </p>

            <p v-if="dictado.error.value" class="mt-1 text-xs font-semibold text-red-600">
              {{ dictado.error.value }}
            </p>

            <p class="mt-1 text-xs text-slate-500">
              Lo verá el alumno en su libro.<span v-if="dictado.soportado">
                Puedes dictarlo y corregirlo después con el teclado.</span>
            </p>
          </div>
        </form>
      </div>

      <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5">
        <button
          v-if="grade && editable"
          type="button"
          class="text-sm font-semibold text-red-600 hover:underline"
          :disabled="guardando"
          @click="borrar"
        >Borrar valoración</button>
        <span v-else></span>

        <div class="flex gap-2">
          <button
            v-if="grade && !editando && editable"
            type="button"
            class="btn-primary"
            @click="editando = true"
          >Editar</button>
          <button
            v-else-if="editando"
            type="button"
            class="btn-primary"
            :disabled="!puedeGuardar"
            @click="guardar"
          >{{ guardando ? 'Guardando...' : 'Guardar' }}</button>
        </div>
      </footer>
    </div>
  </div>
</template>
