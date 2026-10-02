<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import katex from 'katex';
import { compilar } from '@/utils/expresiones';
import { PALETA_LATEX, insertarSimbolo, latexAExpresion, type SimboloLatex } from '@/utils/latex';

/**
 * Editor de formulas en LaTeX.
 *
 * Quien da matematicas no tiene por que saberse los comandos: los botones los
 * escriben en el cursor (o alrededor de lo seleccionado), se ve el resultado
 * mientras se escribe y, si algo no cuadra, se dice que en vez de pintar la
 * formula en rojo sin mas.
 */
const props = defineProps<{ latex: string }>();
const emit = defineEmits<{
  /** Cada cambio, para verlo en la hoja al momento (quien escucha agrupa los guardados). */
  update: [latex: string];
  /** Pide una grafica de funciones con esta formula. */
  graficar: [expresion: string];
}>();

const texto = ref(props.latex);
const area = ref<HTMLTextAreaElement | null>(null);
const pestana = ref(0);

// Si cambia desde fuera (deshacer, una plantilla), se recoge.
watch(
  () => props.latex,
  (v) => {
    if (v !== texto.value) texto.value = v;
  },
);

function cambiar(v: string): void {
  texto.value = v;
  emit('update', v);
}

const vistaPrevia = computed(() => {
  try {
    return {
      html: katex.renderToString(texto.value || '\\square', { displayMode: true, throwOnError: true, trust: false, strict: 'ignore' }),
      error: null,
    };
  } catch (err) {
    const mensaje = (err as Error).message.replace(/^KaTeX parse error:\s*/, '');
    return { html: '', error: traducirError(mensaje) };
  }
});

/** Los mensajes de KaTeX vienen en ingles y en jerga; los mas comunes, en cristiano. */
function traducirError(m: string): string {
  if (/Expected '}'/.test(m) || /Expected group/.test(m)) return 'Falta cerrar una llave }';
  if (/Extra }/.test(m)) return 'Sobra una llave }';
  if (/Undefined control sequence: (\\\w+)/.test(m)) return `No existe el comando ${/Undefined control sequence: (\\\w+)/.exec(m)![1]}`;
  if (/Missing \\right|Expected '\\right'/.test(m)) return 'Falta el \\right que cierra el \\left';
  if (/Double superscript/.test(m)) return 'Hay dos potencias seguidas: agrúpalas entre llaves, x^{ab}';
  if (/Double subscript/.test(m)) return 'Hay dos subíndices seguidos: agrúpalos entre llaves';
  return m;
}

function insertar(simbolo: SimboloLatex): void {
  const el = area.value;
  const inicio = el?.selectionStart ?? texto.value.length;
  const fin = el?.selectionEnd ?? texto.value.length;
  const r = insertarSimbolo(texto.value, inicio, fin, simbolo.inserta);
  cambiar(r.texto);
  void nextTick(() => {
    el?.focus();
    el?.setSelectionRange(r.cursor, r.cursor);
  });
}

function vistaDe(simbolo: SimboloLatex): string {
  try {
    return katex.renderToString(simbolo.vista, { throwOnError: false, trust: false, strict: 'ignore' });
  } catch {
    return simbolo.titulo;
  }
}

/** La formula como funcion de x, si se puede dibujar. */
const comoFuncion = computed(() => {
  const expr = latexAExpresion(texto.value);
  if (!expr) return null;
  const c = compilar(expr, ['x']);
  return c.ok && c.variables.has('x') ? expr : null;
});
</script>

<template>
  <div class="space-y-2">
    <!-- Paleta -->
    <div class="rounded-lg border border-slate-200">
      <div class="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 p-1" role="tablist">
        <button
          v-for="(grupo, i) in PALETA_LATEX"
          :key="grupo.label"
          type="button"
          role="tab"
          class="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          :class="pestana === i ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
          :aria-selected="pestana === i"
          @click="pestana = i"
        >{{ grupo.label }}</button>
      </div>
      <div class="flex max-h-40 flex-wrap gap-1 overflow-y-auto p-1.5">
        <button
          v-for="simbolo in PALETA_LATEX[pestana].simbolos"
          :key="simbolo.inserta"
          type="button"
          class="simbolo grid h-9 min-w-[2.25rem] place-items-center rounded border border-slate-200 bg-white px-1 text-slate-800 transition hover:border-brand-400 hover:bg-brand-50"
          :title="simbolo.titulo"
          :aria-label="simbolo.titulo"
          @mousedown.prevent
          @click="insertar(simbolo)"
        >
          <span v-html="vistaDe(simbolo)" />
        </button>
      </div>
    </div>

    <!-- Código -->
    <textarea
      ref="area"
      class="input min-h-[4.5rem] resize-y font-mono text-xs"
      :class="vistaPrevia.error ? 'border-red-400' : ''"
      spellcheck="false"
      aria-label="Fórmula en LaTeX"
      :value="texto"
      @input="cambiar(($event.target as HTMLTextAreaElement).value)"
    />

    <!-- Vista previa -->
    <div class="rounded-lg border border-slate-200 bg-white p-2">
      <p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Vista previa</p>
      <div v-if="!vistaPrevia.error" class="overflow-x-auto text-slate-900" v-html="vistaPrevia.html" />
      <p v-else class="text-xs text-red-600">{{ vistaPrevia.error }}</p>
    </div>

    <button
      v-if="comoFuncion"
      type="button"
      class="btn-secondary w-full justify-center text-xs"
      :title="`Inserta una gráfica de y = ${comoFuncion}`"
      @click="emit('graficar', comoFuncion)"
    >📈 Graficar esta función</button>
  </div>
</template>

<style scoped>
.simbolo :deep(.katex) {
  font-size: 0.95em;
}
</style>
