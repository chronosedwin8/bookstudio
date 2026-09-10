<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IllustrationRenderer from '@/components/canvas/IllustrationRenderer.vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { illustrationsApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { FONDOS, NOMBRES, TEMAS, type Fondo, type Tema } from '@/utils/ilustracion/catalogo';
import { normalizarEscena, type Escena } from '@/utils/ilustracion/escena';

/**
 * Crear una ilustracion describiendola con palabras.
 *
 * Quien la usa no tiene que saber que hay detras un catalogo, ni una escena, ni
 * un SVG: escribe lo que quiere ver, mira la vista previa y la inserta. Todo lo
 * demas es asunto del programa.
 */
const emit = defineEmits<{
  close: [];
  pick: [payload: { escena: Escena; prompt: string; illustrationId?: string }];
}>();

const EJEMPLOS = [
  'Tres estudiantes colaborando en un proyecto con tablets',
  'Una profesora explicando matemáticas a dos estudiantes',
  'Una estudiante leyendo un libro en la biblioteca',
  'Dos estudiantes escribiendo en sus cuadernos',
];

const texto = ref('');
const tema = ref<Tema | ''>('');
const fondo = ref<Fondo | ''>('');
const cargando = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);
const escena = ref<Escena | null>(null);
const illustrationId = ref<string | undefined>(undefined);
const conIA = ref(false);
const campo = ref<HTMLTextAreaElement | null>(null);

onMounted(async () => {
  campo.value?.focus();
  try {
    conIA.value = (await illustrationsApi.estado()).iaActiva;
  } catch {
    // Si no se puede preguntar, se calla: no cambia lo que se puede hacer.
  }
});

const puedeGenerar = computed(() => texto.value.trim().length >= 3 && !cargando.value);

async function generar(): Promise<void> {
  if (!puedeGenerar.value) return;
  cargando.value = true;
  error.value = null;
  aviso.value = null;

  try {
    const respuesta = await illustrationsApi.analizar({
      texto: texto.value.trim(),
      tema: tema.value || undefined,
      fondo: fondo.value || undefined,
    });
    escena.value = normalizarEscena(respuesta.ilustracion.escena, texto.value.trim());
    illustrationId.value = respuesta.ilustracion.id;
    aviso.value = respuesta.aviso ?? null;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

function usarEjemplo(ejemplo: string): void {
  texto.value = ejemplo;
  void generar();
}

function insertar(): void {
  if (!escena.value) return;
  emit('pick', {
    escena: escena.value,
    prompt: texto.value.trim(),
    illustrationId: illustrationId.value,
  });
}

/** Cambiar el aire de una escena ya compuesta no necesita volver a analizarla. */
function cambiarTema(nuevo: Tema): void {
  tema.value = nuevo;
  if (escena.value) escena.value = { ...escena.value, tema: nuevo };
}

function cambiarFondo(nuevo: Fondo): void {
  fondo.value = nuevo;
  if (escena.value) escena.value = { ...escena.value, fondo: nuevo };
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Ilustración educativa</h2>
          <p class="text-xs text-slate-500">
            Describe la escena y se dibuja. Es un dibujo vectorial: no pierde nitidez al agrandarlo.
          </p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <label class="label" for="ilus-texto">¿Qué quieres que aparezca?</label>
        <div class="flex gap-2">
          <textarea
            id="ilus-texto"
            ref="campo"
            v-model="texto"
            rows="2"
            maxlength="500"
            class="input flex-1"
            placeholder="Tres estudiantes colaborando con tablets en el salón de clases"
            @keydown.enter.exact.prevent="generar"
          />
          <button type="button" class="btn-primary shrink-0" :disabled="!puedeGenerar" @click="generar">
            {{ cargando ? 'Dibujando...' : 'Dibujar' }}
          </button>
        </div>

        <div v-if="!escena" class="mt-3">
          <p class="label">O empieza por uno de estos</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="ejemplo in EJEMPLOS"
              :key="ejemplo"
              type="button"
              class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
              @click="usarEjemplo(ejemplo)"
            >{{ ejemplo }}</button>
          </div>
        </div>

        <AlertMessage v-if="error" :message="error" class="mt-3" />
        <p v-if="aviso" class="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{{ aviso }}</p>

        <template v-if="escena">
          <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <IllustrationRenderer :escena="escena" :prompt="texto" />
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p class="label">Ambiente</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="f in FONDOS"
                  :key="f"
                  type="button"
                  class="rounded-lg border px-2.5 py-1 text-xs transition"
                  :class="escena.fondo === f
                    ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                  @click="cambiarFondo(f)"
                >{{ NOMBRES.fondo[f] }}</button>
              </div>
            </div>

            <div>
              <p class="label">Colores</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="t in TEMAS"
                  :key="t"
                  type="button"
                  class="rounded-lg border px-2.5 py-1 text-xs transition"
                  :class="escena.tema === t
                    ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                  @click="cambiarTema(t)"
                >{{ NOMBRES.tema[t] }}</button>
              </div>
            </div>
          </div>

          <p class="mt-3 text-[11px] leading-tight text-slate-400">
            {{ conIA
              ? 'La escena la interpretó la IA; el dibujo lo compone BookStudio.'
              : 'La escena se compuso aquí mismo, leyendo tu descripción.' }}
            Podrás cambiarla después en el panel derecho.
          </p>
        </template>
      </div>

      <footer class="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="!escena" @click="insertar">
          Insertar en la página
        </button>
      </footer>
    </div>
  </div>
</template>
