<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { magnificApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { MagnificAspect, MagnificModel } from '@/types/api';

/**
 * Generar una imagen describiendola.
 *
 * La espera es de unos quince segundos, asi que se pregunta al servidor cada dos
 * hasta que esta. La imagen que llega ya vive en nuestro almacenamiento: la
 * direccion que da Magnific caduca en una hora y no serviria para un libro.
 */
const emit = defineEmits<{
  close: [];
  pick: [payload: { fileUrl: string; altText: string }];
}>();

const prompt = ref('');
const aspecto = ref<MagnificAspect>('square_1_1');
const modelo = ref<MagnificModel>('fluid');
const resolucion = ref<'1k' | '2k'>('1k');

const generando = ref(false);
const error = ref<string | null>(null);
const resultado = ref<string | null>(null);
const segundos = ref(0);

let sonda: ReturnType<typeof setInterval> | undefined;
let reloj: ReturnType<typeof setInterval> | undefined;
let cancelado = false;

const ASPECTOS: Array<{ id: MagnificAspect; label: string; caja: string }> = [
  { id: 'square_1_1', label: 'Cuadrada', caja: 'h-8 w-8' },
  { id: 'classic_4_3', label: 'Horizontal', caja: 'h-6 w-8' },
  { id: 'traditional_3_4', label: 'Vertical', caja: 'h-8 w-6' },
  { id: 'widescreen_16_9', label: 'Panorámica', caja: 'h-[18px] w-8' },
  { id: 'social_story_9_16', label: 'Historia', caja: 'h-8 w-[18px]' },
];

const MODELOS: Array<{ id: MagnificModel; label: string; pista: string }> = [
  { id: 'fluid', label: 'Ilustración', pista: 'Dibujo y estilo libre; lo habitual para un libro.' },
  { id: 'realism', label: 'Realista', pista: 'Fotografía creíble.' },
  { id: 'zen', label: 'Limpia', pista: 'Formas simples y fondos despejados.' },
  { id: 'flexible', label: 'Versátil', pista: 'A medio camino entre las anteriores.' },
];

function detener(): void {
  clearInterval(sonda);
  clearInterval(reloj);
  sonda = undefined;
  reloj = undefined;
}

onBeforeUnmount(() => {
  cancelado = true;
  detener();
});

async function generar(): Promise<void> {
  if (!prompt.value.trim() || generando.value) return;
  generando.value = true;
  error.value = null;
  resultado.value = null;
  segundos.value = 0;

  try {
    const tarea = await magnificApi.generar({
      prompt: prompt.value.trim(),
      aspectRatio: aspecto.value,
      model: modelo.value,
      resolution: resolucion.value,
    });

    reloj = setInterval(() => (segundos.value += 1), 1000);
    sonda = setInterval(async () => {
      if (cancelado) return;
      try {
        const estado = await magnificApi.consultar(tarea.taskId);
        if (estado.status === 'COMPLETED' && estado.fileUrl) {
          detener();
          resultado.value = estado.fileUrl;
          generando.value = false;
        } else if (estado.status === 'FAILED') {
          detener();
          error.value = estado.error ?? 'No se pudo generar la imagen.';
          generando.value = false;
        } else if (segundos.value > 180) {
          // Algo se atasco al otro lado; mejor decirlo que dejar la rueda girando.
          detener();
          error.value = 'La generación está tardando demasiado. Vuelve a intentarlo.';
          generando.value = false;
        }
      } catch (err) {
        detener();
        error.value = errorMessage(err);
        generando.value = false;
      }
    }, 2000);
  } catch (err) {
    error.value = errorMessage(err);
    generando.value = false;
  }
}

function insertar(): void {
  if (!resultado.value) return;
  emit('pick', { fileUrl: resultado.value, altText: prompt.value.trim().slice(0, 200) });
}

function cerrar(): void {
  cancelado = true;
  detener();
  emit('close');
}

const puedeGenerar = computed(() => prompt.value.trim().length >= 3 && !generando.value);

const EJEMPLOS = [
  'Un volcán en erupción visto desde lejos, ilustración para clase de ciencias',
  'Retrato de Simón Bolívar en acuarela, fondo claro',
  'Una célula vegetal con sus partes, dibujo limpio sobre fondo blanco',
];
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="cerrar">
    <div class="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 class="font-bold text-slate-900">Crear una imagen describiéndola</h2>
        <button type="button" class="btn-secondary" @click="cerrar">Cerrar</button>
      </header>

      <div class="flex-1 space-y-4 overflow-y-auto p-5">
        <AlertMessage :message="error" />

        <div>
          <label class="label" for="magnific-prompt">¿Qué quieres ver?</label>
          <textarea
            id="magnific-prompt"
            v-model="prompt"
            class="input min-h-[4.5rem] resize-y"
            maxlength="1000"
            placeholder="Describe la imagen con detalle: qué aparece, cómo es y con qué estilo."
            :disabled="generando"
          />
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <button
              v-for="ejemplo in EJEMPLOS"
              :key="ejemplo"
              type="button"
              class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:border-brand-300 hover:text-brand-700"
              :disabled="generando"
              @click="prompt = ejemplo"
            >{{ ejemplo.slice(0, 42) }}…</button>
          </div>
        </div>

        <div>
          <label class="label">Forma</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opcion in ASPECTOS"
              :key="opcion.id"
              type="button"
              class="flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 transition"
              :class="aspecto === opcion.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'"
              :disabled="generando"
              @click="aspecto = opcion.id"
            >
              <span class="rounded-sm bg-slate-300" :class="opcion.caja" />
              <span class="text-[11px] text-slate-600">{{ opcion.label }}</span>
            </button>
          </div>
        </div>

        <div>
          <label class="label">Estilo</label>
          <div class="grid gap-1.5 sm:grid-cols-2">
            <button
              v-for="opcion in MODELOS"
              :key="opcion.id"
              type="button"
              class="rounded-lg border-2 px-3 py-2 text-left transition"
              :class="modelo === opcion.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'"
              :disabled="generando"
              @click="modelo = opcion.id"
            >
              <span class="block text-sm font-semibold text-slate-800">{{ opcion.label }}</span>
              <span class="block text-[11px] leading-tight text-slate-500">{{ opcion.pista }}</span>
            </button>
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="resolucion" type="checkbox" true-value="2k" false-value="1k" class="h-4 w-4 rounded" :disabled="generando" />
          Más resolución (tarda más; útil si la imagen va a ocupar la página entera)
        </label>

        <!-- Resultado -->
        <div v-if="generando" class="grid h-56 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <div class="text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
            <p class="mt-2 text-sm text-slate-600">Dibujando... {{ segundos }}s</p>
            <p class="text-[11px] text-slate-400">Suele tardar entre 15 y 40 segundos.</p>
          </div>
        </div>

        <figure v-else-if="resultado" class="overflow-hidden rounded-lg border border-slate-200">
          <img :src="resultado" :alt="prompt" class="w-full" />
        </figure>
      </div>

      <footer class="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3">
        <p class="text-[11px] leading-tight text-slate-400">
          Las imágenes se guardan en BookStudio, no en Magnific.
        </p>
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn-secondary" :disabled="!puedeGenerar" @click="generar">
            {{ resultado ? 'Probar otra' : 'Crear imagen' }}
          </button>
          <button type="button" class="btn-primary" :disabled="!resultado" @click="insertar">
            Insertar en la página
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
