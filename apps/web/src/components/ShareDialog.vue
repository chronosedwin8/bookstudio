<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { booksApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { ShareVisibility } from '@/types/api';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  bookId: string;
  title: string;
  visibility: ShareVisibility;
  token: string | null;
  /** Un libro personal no tiene clase con la que compartirlo. */
  hasLibrary: boolean;
  collaborative: boolean;
}>();

const emit = defineEmits<{
  close: [];
  changed: [state: { visibility: ShareVisibility; token: string | null }];
  collaborative: [value: boolean];
}>();

const auth = useAuthStore();

/* --------------------------------------------------------------------------
 * Mural
 *
 * Es una decision distinta de la visibilidad del enlace, y por eso va aparte.
 * Un enlace publico lo tiene solo quien lo recibe; el mural lo ve cualquiera que
 * entre en la pagina. Que un libro se pueda abrir con enlace no significa que su
 * autor quiera verlo en el escaparate del colegio.
 * ------------------------------------------------------------------------ */

const enMural = ref(false);
const muralOcupado = ref(false);
/** El alumnado no publica en el mural: lo decide quien responde de la clase. */
const puedePublicar = computed(() => auth.user?.role === 'teacher' || auth.user?.role === 'admin');

onMounted(async () => {
  if (!puedePublicar.value) return;
  try {
    enMural.value = (await booksApi.muralState(props.bookId)).inMural;
  } catch {
    // Si no se puede consultar, el interruptor queda apagado: es lo prudente.
    enMural.value = false;
  }
});

async function cambiarMural(valor: boolean): Promise<void> {
  muralOcupado.value = true;
  error.value = null;
  try {
    const estado = valor
      ? await booksApi.publishToMural(props.bookId)
      : await booksApi.removeFromMural(props.bookId);
    enMural.value = estado.inMural;
    // Publicar en el mural vuelve el libro publico por enlace: sin eso el mural
    // ensenaria portadas que nadie puede abrir. Se refleja aqui para que no
    // parezca que el selector de arriba se quedo desfasado.
    if (estado.inMural) {
      visibility.value = 'public';
      token.value = estado.shareToken;
      emit('changed', { visibility: 'public', token: estado.shareToken });
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    muralOcupado.value = false;
  }
}

const visibility = ref<ShareVisibility>(props.visibility);
const token = ref<string | null>(props.token);
const busy = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

const OPTIONS: Array<{ id: ShareVisibility; label: string; hint: string }> = [
  { id: 'private', label: 'Privado', hint: 'Solo quien tenga permiso dentro de BookStudio.' },
  { id: 'library', label: 'Mi clase', hint: 'Cualquier miembro de la biblioteca, tras iniciar sesion.' },
  { id: 'public', label: 'Cualquiera con el enlace', hint: 'Se abre sin cuenta. Piensa si el libro lleva datos personales.' },
];

const available = computed(() => OPTIONS.filter((o) => o.id !== 'library' || props.hasLibrary));

/** URL absoluta, lista para pegar en el chat de clase. */
const shareUrl = computed(() => (token.value ? `${window.location.origin}/leer/${token.value}` : ''));

async function choose(next: ShareVisibility): Promise<void> {
  if (busy.value || next === visibility.value) return;
  busy.value = true;
  error.value = null;
  try {
    const state = await booksApi.setSharing(props.bookId, next);
    visibility.value = state.visibility;
    token.value = state.token;
    emit('changed', state);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function rotate(): Promise<void> {
  if (!window.confirm('Se invalidara el enlace anterior. Continuar?')) return;
  busy.value = true;
  error.value = null;
  try {
    const state = await booksApi.rotateShareLink(props.bookId);
    token.value = state.token;
    copied.value = false;
    emit('changed', state);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS): el campo queda para copiar a mano.
    error.value = 'No se pudo copiar. Selecciona el enlace y copialo manualmente.';
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card w-full max-w-lg overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div class="min-w-0">
          <h2 class="font-bold text-slate-900">Compartir libro</h2>
          <p class="truncate text-xs text-slate-500">{{ title }}</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="space-y-4 p-5">
        <AlertMessage :message="error" />

        <div class="space-y-2">
          <label
            v-for="option in available"
            :key="option.id"
            class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition"
            :class="visibility === option.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'"
          >
            <input
              type="radio"
              class="mt-1"
              :checked="visibility === option.id"
              :disabled="busy"
              @change="choose(option.id)"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-slate-800">{{ option.label }}</span>
              <span class="block text-xs text-slate-500">{{ option.hint }}</span>
            </span>
          </label>
        </div>

        <!-- Mural: escaparate publico, distinto de repartir un enlace -->
        <div v-if="puedePublicar" class="rounded-lg border border-slate-200 p-3">
          <label class="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-slate-300"
              :checked="enMural"
              :disabled="muralOcupado"
              @change="cambiarMural(($event.target as HTMLInputElement).checked)"
            />
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-slate-800">Publicar en el mural</span>
              <span class="block text-xs text-slate-500">
                Aparecerá en
                <RouterLink to="/mural" target="_blank" class="text-brand-600 underline">el mural</RouterLink>,
                que cualquiera puede ver sin tener cuenta. Al publicarlo, el libro pasa
                a abrirse con enlace público.
              </span>
            </span>
          </label>
          <p v-if="enMural" class="mt-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
            Está en el mural. Al quitarlo deja de aparecer, pero el enlace repartido
            sigue funcionando.
          </p>
        </div>

        <!-- Edición compartida: distinta de la visibilidad del enlace -->
        <label
          v-if="hasLibrary"
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition"
          :class="collaborative ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'"
        >
          <input
            type="checkbox"
            class="mt-1 h-4 w-4 rounded"
            :checked="collaborative"
            :disabled="busy"
            @change="emit('collaborative', ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="block text-sm font-semibold text-slate-800">Edición compartida con la clase</span>
            <span class="block text-xs text-slate-500">
              Cualquier miembro de la biblioteca podrá añadir contenido a este libro.
              Los cambios se ven al recargar; todavia no hay sincronizacion en vivo.
            </span>
          </span>
        </label>

        <p v-if="!hasLibrary" class="text-xs text-slate-400">
          Este libro es personal, así que no puede compartirse solo con una clase.
        </p>

        <div v-if="visibility !== 'private' && shareUrl" class="space-y-2">
          <label class="label" for="share-url">Enlace</label>
          <div class="flex gap-2">
            <input
              id="share-url"
              :value="shareUrl"
              readonly
              class="input font-mono text-xs"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button type="button" class="btn-primary shrink-0" :disabled="busy" @click="copy">
              {{ copied ? 'Copiado' : 'Copiar' }}
            </button>
          </div>

          <p v-if="visibility === 'library'" class="text-xs text-slate-500">
            Quien lo abra tendrá que iniciar sesión y pertenecer a la biblioteca.
          </p>

          <button
            type="button"
            class="text-xs text-slate-500 underline hover:text-slate-700"
            :disabled="busy"
            @click="rotate"
          >Generar un enlace nuevo e invalidar el anterior</button>
        </div>
      </div>
    </div>
  </div>
</template>
