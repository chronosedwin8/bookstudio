<script setup lang="ts">
import { computed, ref } from 'vue';
import RichContent from './RichContent.vue';
import RichTextEditor from './RichTextEditor.vue';
import MagnificDialog from '@/components/media/MagnificDialog.vue';
import MediaSearchDialog from '@/components/media/MediaSearchDialog.vue';
import { mediaApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { bloquesATexto, contarImagenes, enlaceValido, longitudVisible } from '@/utils/richText';
import { TOPES_INTERACCION, type ElementInteraction, type MediaResult, type RichBlock } from '@/types/api';

/**
 * Editor del contenido de la informacion ampliada.
 *
 * Va en un dialogo y no en el inspector porque el inspector es una columna de
 * 288 px: redactar una ficha con parrafos, listas e imagenes ahi dentro es pelear
 * con el sitio. Ademas, aqui cabe la vista previa al lado, que es lo que evita
 * tener que salir a leer el libro para ver como queda.
 */
const props = defineProps<{ interaction: ElementInteraction }>();

const emit = defineEmits<{
  close: [];
  save: [interaction: ElementInteraction];
}>();

/**
 * Secciones de trabajo. El modelo guardado es una lista plana de bloques; aqui se
 * agrupan los de texto seguidos en una sola seccion editable, que es como se
 * redacta de verdad: se escribe un rato, se mete una imagen, se sigue escribiendo.
 */
type Seccion =
  | { tipo: 'texto'; bloques: RichBlock[] }
  | { tipo: 'imagen'; bloque: Extract<RichBlock, { type: 'image' }> };

function aSecciones(bloques: RichBlock[]): Seccion[] {
  const salida: Seccion[] = [];
  for (const bloque of bloques) {
    if (bloque.type === 'image') {
      salida.push({ tipo: 'imagen', bloque });
      continue;
    }
    const ultima = salida[salida.length - 1];
    if (ultima?.tipo === 'texto') ultima.bloques.push(bloque);
    else salida.push({ tipo: 'texto', bloques: [bloque] });
  }
  return salida;
}

const titulo = ref(props.interaction.title ?? '');
const imagenCabecera = ref(props.interaction.imageUrl ?? '');
const secciones = ref<Seccion[]>(
  props.interaction.content?.length
    ? aSecciones(props.interaction.content)
    // Un contenido que solo tenia texto plano se convierte en su primer parrafo.
    : [{
        tipo: 'texto',
        bloques: props.interaction.text
          ? [{ type: 'paragraph', spans: [{ text: props.interaction.text }] }]
          : [],
      }],
);

const bloques = computed<RichBlock[]>(() =>
  secciones.value.flatMap((s) => (s.tipo === 'texto' ? s.bloques : [s.bloque])),
);

const tope = computed(() => TOPES_INTERACCION[props.interaction.kind]);
const largo = computed(() => longitudVisible(bloques.value));
const imagenes = computed(() => contarImagenes(bloques.value) + (imagenCabecera.value ? 1 : 0));

const problema = computed(() => {
  const nombre = props.interaction.kind === 'tooltip' ? 'globo' : 'ventana';
  if (largo.value > tope.value.texto) {
    return `Un ${nombre} admite hasta ${tope.value.texto} caracteres y llevas ${largo.value}.`;
  }
  if (imagenes.value > tope.value.imagenes) {
    return `Un ${nombre} admite hasta ${tope.value.imagenes} imagen(es) y llevas ${imagenes.value}.`;
  }
  if (bloques.value.length > tope.value.bloques) {
    return `Un ${nombre} admite hasta ${tope.value.bloques} bloques.`;
  }
  if (!largo.value && !imagenes.value) return 'Escribe un texto o añade una imagen.';
  return null;
});

/** La vista previa se arma con lo que hay ahora mismo, sin guardar nada. */
const previa = computed<ElementInteraction>(() => ({
  ...props.interaction,
  title: titulo.value.trim(),
  text: bloquesATexto(bloques.value),
  content: bloques.value,
  imageUrl: imagenCabecera.value.trim() || undefined,
}));

// --- Secciones ---

function anadirTexto(): void {
  secciones.value = [...secciones.value, { tipo: 'texto', bloques: [] }];
}

function quitar(indice: number): void {
  secciones.value = secciones.value.filter((_, i) => i !== indice);
}

function mover(indice: number, salto: number): void {
  const destino = indice + salto;
  if (destino < 0 || destino >= secciones.value.length) return;
  const copia = [...secciones.value];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  secciones.value = copia;
}

function actualizarTexto(indice: number, nuevos: RichBlock[]): void {
  const copia = [...secciones.value];
  copia[indice] = { tipo: 'texto', bloques: nuevos };
  secciones.value = copia;
}

// --- Imagenes ---

const dialogo = ref<'ninguno' | 'buscar' | 'ia'>('ninguno');
/** Cuando se pide una imagen, adonde va: al cuerpo o a la cabecera. */
const destinoImagen = ref<'cuerpo' | 'cabecera'>('cuerpo');
const subiendo = ref(false);
const error = ref<string | null>(null);
const archivo = ref<HTMLInputElement | null>(null);

function colocarImagen(url: string, alt = ''): void {
  if (destinoImagen.value === 'cabecera') {
    imagenCabecera.value = url;
    return;
  }
  secciones.value = [...secciones.value, { tipo: 'imagen', bloque: { type: 'image', url, alt, caption: '' } }];
}

function pedirImagen(origen: 'archivo' | 'buscar' | 'ia', destino: 'cuerpo' | 'cabecera'): void {
  destinoImagen.value = destino;
  error.value = null;
  if (origen === 'archivo') archivo.value?.click();
  else dialogo.value = origen === 'buscar' ? 'buscar' : 'ia';
}

const MAX_BYTES = 8 * 1024 * 1024;

async function alElegirArchivo(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // para poder volver a elegir el mismo
  if (!file) return;

  if (file.size > MAX_BYTES) {
    error.value = `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el límite es 8 MB.`;
    return;
  }

  subiendo.value = true;
  error.value = null;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
      lector.readAsDataURL(file);
    });
    const subida = await mediaApi.upload(dataUrl);
    colocarImagen(subida.fileUrl, file.name.replace(/\.[^.]+$/, ''));
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    subiendo.value = false;
  }
}

function alBuscar(resultado: MediaResult): void {
  dialogo.value = 'ninguno';
  colocarImagen(resultado.url, resultado.title);
}

function alGenerar(payload: { fileUrl: string; altText: string }): void {
  dialogo.value = 'ninguno';
  colocarImagen(payload.fileUrl, payload.altText);
}

function pegarDireccion(destino: 'cuerpo' | 'cabecera'): void {
  const url = window.prompt('Dirección de la imagen (https://...)', 'https://');
  if (url === null) return;
  const limpia = enlaceValido(url);
  if (!limpia) {
    error.value = 'La dirección debe empezar por https:// o http://';
    return;
  }
  error.value = null;
  destinoImagen.value = destino;
  colocarImagen(limpia);
}

function guardar(): void {
  if (problema.value) return;
  emit('save', previa.value);
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header class="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="text-base font-semibold text-slate-800">
            Contenido {{ interaction.kind === 'tooltip' ? 'del globo' : 'de la ventana' }}
          </h2>
          <p class="text-xs text-slate-500">
            Se muestra {{ interaction.trigger === 'hover' ? 'al pasar el ratón' : 'al pulsar' }} sobre el elemento.
          </p>
        </div>
        <button
          type="button"
          class="rounded-full px-2 text-2xl leading-none text-slate-400 hover:text-slate-700"
          aria-label="Cerrar"
          @click="emit('close')"
        >&times;</button>
      </header>

      <div class="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1fr_22rem]">
        <!-- Edicion -->
        <div class="min-h-0 space-y-4 overflow-y-auto p-5">
          <div>
            <label class="label" for="int-titulo">Título</label>
            <input
              id="int-titulo"
              v-model="titulo"
              type="text"
              class="input"
              maxlength="120"
              placeholder="Encabeza la ventana; se puede dejar vacío"
            />
          </div>

          <!-- Imagen de cabecera -->
          <div>
            <span class="label">Imagen de cabecera</span>
            <div v-if="imagenCabecera" class="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
              <img :src="imagenCabecera" alt="" class="h-16 w-24 rounded object-cover" />
              <button
                type="button"
                class="text-xs font-medium text-red-600 hover:underline"
                @click="imagenCabecera = ''"
              >Quitar</button>
            </div>
            <div v-else class="flex flex-wrap gap-1">
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('archivo', 'cabecera')">
                Subir
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('buscar', 'cabecera')">
                Buscar
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('ia', 'cabecera')">
                Generar con IA
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pegarDireccion('cabecera')">
                Pegar dirección
              </button>
            </div>
          </div>

          <!-- Secciones del cuerpo -->
          <div class="space-y-3">
            <span class="label">Contenido</span>

            <div
              v-for="(seccion, i) in secciones"
              :key="i"
              class="rounded-lg border border-slate-200 p-2"
            >
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {{ seccion.tipo === 'texto' ? 'Texto' : 'Imagen' }}
                </span>
                <div class="flex items-center gap-1">
                  <button
                    type="button" class="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Subir" :disabled="i === 0" @click="mover(i, -1)"
                  >↑</button>
                  <button
                    type="button" class="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Bajar" :disabled="i === secciones.length - 1" @click="mover(i, 1)"
                  >↓</button>
                  <button
                    type="button" class="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Quitar" @click="quitar(i)"
                  >✕</button>
                </div>
              </div>

              <RichTextEditor
                v-if="seccion.tipo === 'texto'"
                :blocks="seccion.bloques"
                placeholder="Escribe aquí. Puedes poner negrita, listas y enlaces."
                :rows="3"
                @update="actualizarTexto(i, $event)"
              />

              <div v-else class="flex gap-3">
                <img :src="seccion.bloque.url" alt="" class="h-24 w-32 shrink-0 rounded object-cover" />
                <div class="min-w-0 flex-1 space-y-1.5">
                  <input
                    v-model="seccion.bloque.caption"
                    type="text"
                    class="input py-1 text-xs"
                    maxlength="300"
                    placeholder="Pie de imagen (opcional)"
                  />
                  <input
                    v-model="seccion.bloque.alt"
                    type="text"
                    class="input py-1 text-xs"
                    maxlength="300"
                    placeholder="Descripción para quien no puede verla"
                  />
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-1">
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="anadirTexto()">
                + Texto
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('archivo', 'cuerpo')">
                + Imagen (subir)
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('buscar', 'cuerpo')">
                + Imagen (buscar)
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pedirImagen('ia', 'cuerpo')">
                + Imagen (IA)
              </button>
              <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="pegarDireccion('cuerpo')">
                + Imagen (dirección)
              </button>
            </div>
          </div>

          <p v-if="subiendo" class="text-xs text-slate-500">Subiendo la imagen…</p>
          <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{{ error }}</p>
        </div>

        <!-- Vista previa -->
        <aside class="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-100 p-4 lg:border-l lg:border-t-0">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Así se verá
          </p>

          <div
            v-if="interaction.kind === 'tooltip'"
            class="overflow-hidden rounded-xl bg-slate-900/95 text-white shadow-lg ring-1 ring-white/10"
          >
            <img v-if="previa.imageUrl" :src="previa.imageUrl" alt="" class="max-h-32 w-full object-cover" />
            <div class="px-3 py-2">
              <p v-if="previa.title" class="mb-1 text-[13px] font-semibold leading-tight">{{ previa.title }}</p>
              <RichContent :blocks="previa.content" :fallback="previa.text" compact />
            </div>
          </div>

          <div v-else class="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/10">
            <div class="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 class="text-sm font-semibold text-slate-800">{{ previa.title || 'Más información' }}</h3>
            </div>
            <img v-if="previa.imageUrl" :src="previa.imageUrl" alt="" class="max-h-40 w-full object-cover" />
            <div class="px-4 py-3 text-slate-700">
              <RichContent :blocks="previa.content" :fallback="previa.text" />
            </div>
          </div>

          <p class="mt-3 text-[11px] leading-tight text-slate-500">
            {{ largo }}/{{ tope.texto }} caracteres · {{ imagenes }}/{{ tope.imagenes }}
            {{ tope.imagenes === 1 ? 'imagen' : 'imágenes' }}
          </p>
        </aside>
      </div>

      <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
        <p class="text-xs text-amber-600">{{ problema ?? '' }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="Boolean(problema)" @click="guardar()">
            Guardar
          </button>
        </div>
      </footer>
    </div>

    <input ref="archivo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" @change="alElegirArchivo" />

    <MediaSearchDialog v-if="dialogo === 'buscar'" @close="dialogo = 'ninguno'" @pick="alBuscar" />
    <MagnificDialog v-else-if="dialogo === 'ia'" @close="dialogo = 'ninguno'" @pick="alGenerar" />
  </div>
</template>
