<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { bloquesADom, domABloques, enlaceValido } from '@/utils/richText';
import type { RichBlock } from '@/types/api';

/**
 * Campo de texto con formato.
 *
 * Usa `document.execCommand`, que esta marcado como obsoleto desde hace anos y
 * lo siguen soportando todos los navegadores. La alternativa es escribir a mano
 * la manipulacion de la seleccion, que son cientos de lineas para reproducir mal
 * algo que el navegador ya hace bien. Lo que se guarda no depende de esto: sea
 * cual sea el marcado que deje el navegador, `domABloques` solo lee lo que
 * reconoce.
 */
const props = defineProps<{
  blocks: RichBlock[];
  placeholder?: string;
  /** Alto minimo en filas aproximadas. */
  rows?: number;
}>();

const emit = defineEmits<{ update: [blocks: RichBlock[]] }>();

const campo = ref<HTMLElement | null>(null);
const vacio = ref(true);

/** Marca que el cambio viene de aqui, para no repintar mientras se escribe. */
let escribiendo = false;

function sincronizarDesdeFuera(): void {
  if (!campo.value || escribiendo) return;
  bloquesADom(props.blocks, campo.value);
  vacio.value = !campo.value.textContent?.trim();
}

onMounted(sincronizarDesdeFuera);
watch(() => props.blocks, sincronizarDesdeFuera);

function alEscribir(): void {
  if (!campo.value) return;
  escribiendo = true;
  vacio.value = !campo.value.textContent?.trim();
  emit('update', domABloques(campo.value));
  // Se libera en el mismo tic: el repintado solo debe evitarse durante el envio.
  queueMicrotask(() => { escribiendo = false; });
}

function mandar(orden: string, valor?: string): void {
  campo.value?.focus();
  document.execCommand(orden, false, valor);
  alEscribir();
}

/**
 * Pegar entra siempre como texto plano. Si se dejara pegar el marcado de origen,
 * una copia desde una web traeria su tipografia, sus colores y sus tablas, y el
 * lector solo pinta lo que reconoce: se veria distinto de lo que se pego.
 */
function alPegar(event: ClipboardEvent): void {
  event.preventDefault();
  const texto = event.clipboardData?.getData('text/plain') ?? '';
  document.execCommand('insertText', false, texto);
  alEscribir();
}

function ponerEnlace(): void {
  const actual = window.getSelection()?.toString() ?? '';
  if (!actual.trim()) {
    aviso.value = 'Selecciona antes el texto que quieres enlazar.';
    return;
  }
  const url = window.prompt('Dirección del enlace (https://...)', 'https://');
  if (url === null) return;
  const limpia = enlaceValido(url);
  if (!limpia) {
    aviso.value = 'El enlace debe empezar por https:// o http://';
    return;
  }
  aviso.value = null;
  mandar('createLink', limpia);
}

const aviso = ref<string | null>(null);

const BOTONES = [
  { orden: 'bold', etiqueta: 'N', titulo: 'Negrita', clase: 'font-bold' },
  { orden: 'italic', etiqueta: 'C', titulo: 'Cursiva', clase: 'italic font-serif' },
  { orden: 'underline', etiqueta: 'S', titulo: 'Subrayado', clase: 'underline' },
  { orden: 'strikeThrough', etiqueta: 'T', titulo: 'Tachado', clase: 'line-through' },
] as const;
</script>

<template>
  <div class="rounded-lg border border-slate-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
    <div class="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
      <button
        v-for="b in BOTONES"
        :key="b.orden"
        type="button"
        class="h-7 w-7 rounded text-sm text-slate-600 transition hover:bg-slate-200"
        :class="b.clase"
        :title="b.titulo"
        @mousedown.prevent
        @click="mandar(b.orden)"
      >{{ b.etiqueta }}</button>

      <span class="mx-1 h-4 w-px bg-slate-300"></span>

      <button
        type="button"
        class="h-7 rounded px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
        title="Título"
        @mousedown.prevent
        @click="mandar('formatBlock', 'h3')"
      >Título</button>
      <button
        type="button"
        class="h-7 rounded px-2 text-xs text-slate-600 transition hover:bg-slate-200"
        title="Texto normal"
        @mousedown.prevent
        @click="mandar('formatBlock', 'p')"
      >Normal</button>

      <span class="mx-1 h-4 w-px bg-slate-300"></span>

      <button
        type="button"
        class="h-7 w-7 rounded text-slate-600 transition hover:bg-slate-200"
        title="Lista con puntos"
        @mousedown.prevent
        @click="mandar('insertUnorderedList')"
      >•</button>
      <button
        type="button"
        class="h-7 w-7 rounded text-xs text-slate-600 transition hover:bg-slate-200"
        title="Lista numerada"
        @mousedown.prevent
        @click="mandar('insertOrderedList')"
      >1.</button>
      <button
        type="button"
        class="h-7 w-7 rounded text-slate-600 transition hover:bg-slate-200"
        title="Enlace"
        @mousedown.prevent
        @click="ponerEnlace()"
      >🔗</button>
      <button
        type="button"
        class="h-7 w-7 rounded text-slate-600 transition hover:bg-slate-200"
        title="Quitar el formato"
        @mousedown.prevent
        @click="mandar('removeFormat')"
      >✕</button>
    </div>

    <div class="relative">
      <div
        ref="campo"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        class="rich max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-slate-800 focus:outline-none"
        :style="{ minHeight: `${(rows ?? 4) * 1.6}rem` }"
        @input="alEscribir"
        @blur="alEscribir"
        @paste="alPegar"
      ></div>
      <p
        v-if="vacio && placeholder"
        class="pointer-events-none absolute left-3 top-2 text-sm text-slate-400"
      >{{ placeholder }}</p>
    </div>

    <p v-if="aviso" class="border-t border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
      {{ aviso }}
    </p>
  </div>
</template>

<style scoped>
/* El campo editable no hereda los estilos base, que Tailwind deja a cero. */
.rich :deep(h3) {
  @apply mb-1 mt-2 text-base font-semibold text-slate-800 first:mt-0;
}
.rich :deep(p) {
  @apply mb-1;
}
.rich :deep(ul) {
  @apply mb-1 list-disc pl-5;
}
.rich :deep(ol) {
  @apply mb-1 list-decimal pl-5;
}
.rich :deep(a) {
  @apply text-brand-600 underline;
}
</style>
