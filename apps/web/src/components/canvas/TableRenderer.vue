<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEditorStore } from '@/stores/editor';
import {
  TAMANO_BASE,
  columnasDe,
  conTramos,
  estiloDe,
  normalizarTabla,
  rectangulo,
  tramosDe,
  type Celda,
  type FormatoTexto,
  type Tabla,
  type Tramo,
} from '@/utils/tablas';

/**
 * Tabla del lienzo.
 *
 * Es una `<table>` de verdad, no una rejilla dibujada: asi el lector de pantalla
 * la anuncia como tabla, la cabecera se asocia a sus columnas y al exportar el
 * libro sigue siendo una tabla. El aspecto sale del diseno elegido, y el texto
 * crece con el recuadro como en los demas elementos.
 *
 * En el editor (doble clic sobre la tabla) se escribe en las celdas y se elige a
 * que dar formato: el texto seleccionado dentro de una celda, una celda, o
 * varias con Mayus+clic (un rectangulo) y Ctrl+clic (sueltas). Lo elegido queda
 * en el editor y el inspector le aplica el formato.
 */
const props = defineProps<{
  tabla: Tabla | Record<string, unknown> | null | undefined;
  /** En el editor se puede escribir dentro; en la lectura no. */
  editable?: boolean;
  /** Para marcar lo elegido y darle formato desde el inspector. */
  elementId?: string;
}>();

const editorStore = useEditorStore();

const emit = defineEmits<{ cambiar: [tabla: Tabla] }>();

const tabla = computed(() => normalizarTabla(props.tabla));
const columnas = computed(() => columnasDe(tabla.value));

/** Celda que se esta escribiendo, o null. */
const editando = ref<Celda | null>(null);

/*
 * El campo se guarda con una referencia de funcion y no con `ref="campo"`.
 *
 * Dentro de un `v-for`, Vue recoge las referencias en un array aunque solo haya
 * un elemento pintado, y entonces `campo.value.focus()` no es una funcion: la
 * celda se abria pero no recibia el cursor.
 */
const campo = ref<HTMLElement | null>(null);
const guardarCampo = (el: unknown): void => {
  campo.value = el instanceof HTMLElement ? el : null;
};

const esCabecera = (fila: number, columna: number): boolean =>
  (tabla.value.filaCabecera && fila === 0) || (tabla.value.columnaCabecera && columna === 0);

/** Cada diseno decide lineas y fondos; el color lo pone quien la usa. */
const estilos = computed(() => {
  const t = tabla.value;
  const linea = `1px solid ${t.colorAcento}33`;

  switch (t.diseno) {
    case 'cuadricula':
      return { tabla: {}, celda: { border: `1px solid ${t.colorAcento}55` }, cabecera: { backgroundColor: `${t.colorAcento}1a` } };
    case 'rayas':
      return { tabla: {}, celda: { borderBottom: linea }, cabecera: { backgroundColor: `${t.colorAcento}22` } };
    case 'minimal':
      return { tabla: {}, celda: {}, cabecera: { borderBottom: `2px solid ${t.colorAcento}` } };
    case 'tarjeta':
      return {
        tabla: { border: `1px solid ${t.colorAcento}44`, borderRadius: '0.6em', overflow: 'hidden' },
        celda: { borderBottom: linea },
        cabecera: { backgroundColor: t.colorAcento, color: '#FFFFFF' },
      };
    case 'lineas':
    default:
      return { tabla: {}, celda: { borderBottom: linea }, cabecera: { borderBottom: `2px solid ${t.colorAcento}` } };
  }
});

const esEditada = (fila: number, columna: number): boolean =>
  editando.value?.fila === fila && editando.value?.columna === columna;

/** Lo elegido en esta tabla, si es de esta tabla. */
const seleccion = computed(() => {
  const s = editorStore.seleccionTabla;
  return props.elementId && s?.elementId === props.elementId ? s : null;
});

function esElegida(fila: number, columna: number): boolean {
  return Boolean(seleccion.value?.celdas.some((c) => c.fila === fila && c.columna === columna));
}

/** Formato de toda la tabla: tipografia, tamano y el del cuerpo. */
const estiloTabla = computed(() => {
  const t = tabla.value;
  return {
    color: t.colorTexto,
    textAlign: t.alineacion,
    fontFamily: `"${t.fuente}", sans-serif`,
    fontWeight: t.negrita ? 700 : 400,
    fontStyle: t.cursiva ? 'italic' : 'normal',
    textDecoration: t.subrayado ? 'underline' : 'none',
    '--escala-tabla': String(t.fontSize / TAMANO_BASE),
  };
});

/** Estilo CSS de un formato de texto (de celda o de tramo). */
function estiloTexto(f: FormatoTexto): Record<string, string | number> {
  const r: Record<string, string | number> = {};
  if (f.negrita) r.fontWeight = 700;
  if (f.cursiva) r.fontStyle = 'italic';
  if (f.subrayado) r.textDecoration = 'underline';
  if (f.color) r.color = f.color;
  if (f.escala) r.fontSize = `${f.escala}em`;
  if (f.fuente) r.fontFamily = `"${f.fuente}", sans-serif`;
  return r;
}

/** Lo propio de cada celda, encima del diseno y del formato de la tabla. */
function estiloCelda(fila: number, columna: number): Record<string, string | number> {
  const e = estiloDe(tabla.value, { fila, columna });
  const r = { verticalAlign: tabla.value.alineacionVertical, ...estiloTexto(e) } as Record<string, string | number>;
  if (e.fondo) r.backgroundColor = e.fondo;
  if (e.alineacion) r.textAlign = e.alineacion;
  return r;
}

/**
 * Los trozos que se pintan en una celda: sus tramos, partidos donde empieza y
 * acaba el texto seleccionado para marcarlo. Asi, tras pulsar un boton del
 * inspector, se sigue viendo a que se le esta dando formato.
 */
function segmentos(fila: number, columna: number): { t: string; estilo: Record<string, string | number>; marcado: boolean }[] {
  const s = seleccion.value;
  const rango = s?.rango && s.celdas.length === 1 && s.celdas[0].fila === fila && s.celdas[0].columna === columna
    ? s.rango
    : null;
  const trozos: { t: string; estilo: Record<string, string | number>; marcado: boolean }[] = [];
  let pos = 0;
  for (const tr of tramosDe(tabla.value, { fila, columna })) {
    const a = pos;
    pos += tr.t.length;
    const cortes = rango
      ? [a, Math.min(Math.max(rango.inicio, a), pos), Math.min(Math.max(rango.fin, a), pos), pos]
      : [a, a, pos, pos];
    for (let k = 0; k < 3; k++) {
      const t = tr.t.slice(cortes[k] - a, cortes[k + 1] - a);
      if (t) trozos.push({ t, estilo: estiloTexto(tr), marcado: Boolean(rango) && k === 1 });
    }
  }
  return trozos;
}

/** El sombreado alterno del diseno de rayas. */
function fondoFila(fila: number): string | undefined {
  if (tabla.value.diseno !== 'rayas') return undefined;
  const desplazado = tabla.value.filaCabecera ? fila - 1 : fila;
  return desplazado >= 0 && desplazado % 2 === 1 ? `${tabla.value.colorAcento}0f` : undefined;
}

/* ------------------------------------------------------------ escribir
 * La celda se escribe en un campo editable que se rellena a mano con un <span>
 * por tramo (con su formato en `data-f`) y se lee de vuelta siguiendo el texto.
 * No se lee ni se escribe HTML: lo que no sea texto dentro de un tramo se ignora.
 */
function rellenarCampo(el: HTMLElement, tramos: Tramo[]): void {
  el.textContent = '';
  for (const { t, ...formato } of tramos) {
    const span = document.createElement('span');
    span.dataset.f = JSON.stringify(formato);
    Object.assign(span.style, estiloTexto(formato));
    span.textContent = t;
    el.append(span);
  }
}

function leerCampo(el: HTMLElement): Tramo[] {
  const tramos: Tramo[] = [];
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
    const t = (nodo.nodeValue ?? '').replace(/[\r\n]+/g, ' ');
    if (!t) continue;
    const span = nodo.parentElement?.closest<HTMLElement>('[data-f]');
    let formato: FormatoTexto = {};
    if (span && el.contains(span)) {
      try {
        formato = JSON.parse(span.dataset.f ?? '{}') as FormatoTexto;
      } catch {
        formato = {};
      }
    }
    tramos.push({ t, ...formato });
  }
  return tramos;
}

/** Posicion en caracteres de un punto (nodo + desplazamiento) dentro del campo. */
function posicionEn(el: HTMLElement, nodo: Node, desplazamiento: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(nodo, desplazamiento);
  return r.toString().length;
}

/**
 * Mientras se escribe, lo seleccionado dentro de la celda pasa al editor. Solo
 * se mira la seleccion si esta dentro del campo: al pulsar un boton del
 * inspector la seleccion se va de aqui, y entonces vale la ultima que hubo.
 */
function alCambiarSeleccion(): void {
  const el = campo.value;
  const s = seleccion.value;
  const sel = window.getSelection();
  if (!el || !s || !editando.value || !sel?.rangeCount) return;
  if (!sel.anchorNode || !sel.focusNode || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return;
  const a = posicionEn(el, sel.anchorNode, sel.anchorOffset);
  const b = posicionEn(el, sel.focusNode, sel.focusOffset);
  editorStore.seleccionTabla = { ...s, rango: a === b ? null : { inicio: Math.min(a, b), fin: Math.max(a, b) } };
}

onMounted(() => document.addEventListener('selectionchange', alCambiarSeleccion));
onBeforeUnmount(() => document.removeEventListener('selectionchange', alCambiarSeleccion));

/**
 * Pulsar una celda.
 *
 * Basta un clic porque a este modo se entra a proposito, con doble clic sobre la
 * tabla: una vez dentro, pedir otro doble clic por celda solo estorbaria. Con
 * Mayus se elige el rectangulo hasta la anterior y con Ctrl se suma o se quita
 * una celda suelta; en esos casos no se abre para escribir.
 */
function alPulsar(evento: MouseEvent, fila: number, columna: number): void {
  if (!props.editable || !props.elementId) return;
  if (esEditada(fila, columna)) return;
  const celda = { fila, columna };
  const s = seleccion.value;

  if (s && (evento.shiftKey || evento.ctrlKey || evento.metaKey)) {
    guardar();
    window.getSelection()?.removeAllRanges();
    const celdas = evento.shiftKey
      ? rectangulo(s.ancla, celda)
      : esElegida(fila, columna)
        ? s.celdas.filter((c) => c.fila !== fila || c.columna !== columna)
        : [...s.celdas, celda];
    editorStore.seleccionTabla = {
      ...s,
      celdas: celdas.length ? celdas : [celda],
      ancla: evento.shiftKey ? s.ancla : celda,
      rango: null,
    };
    return;
  }
  void abrir(fila, columna);
}

async function abrir(fila: number, columna: number): Promise<void> {
  if (!props.editable || !props.elementId) return;
  guardar();
  const celda = { fila, columna };
  editorStore.seleccionTabla = { elementId: props.elementId, celdas: [celda], ancla: celda, rango: null };
  editando.value = celda;
  await nextTick();
  const el = campo.value;
  if (!el) return;
  rellenarCampo(el, tramosDe(tabla.value, celda));
  el.focus();
  // Todo seleccionado al entrar: escribir lo sustituye y el formato va a todo.
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

/** Guarda lo escrito en la celda abierta, si cambio, y la cierra. */
function guardar(): void {
  const donde = editando.value;
  const el = campo.value;
  if (!donde) return;
  editando.value = null;
  if (!el) return;
  const nuevos = leerCampo(el);
  const antes = tramosDe(tabla.value, donde);
  if (JSON.stringify(nuevos) === JSON.stringify(antes)) return;
  emit('cambiar', conTramos(tabla.value, donde.fila, donde.columna, nuevos));
}

function cancelar(): void {
  editando.value = null;
}

/** Solo texto al pegar: lo copiado de una web traeria su propio marcado. */
function alPegar(evento: ClipboardEvent): void {
  evento.preventDefault();
  const texto = (evento.clipboardData?.getData('text/plain') ?? '').replace(/[\r\n]+/g, ' ');
  // execCommand esta en desuso, pero es lo unico que inserta respetando el deshacer del navegador.
  document.execCommand('insertText', false, texto);
}

/**
 * Tabulador para pasar a la celda siguiente, como en cualquier hoja de calculo.
 * Sin esto habria que ir picando celda por celda con el raton.
 */
function siguiente(evento: KeyboardEvent): void {
  const donde = editando.value;
  if (!donde) return;
  evento.preventDefault();
  guardar();

  const haciaAtras = evento.shiftKey;
  let { fila, columna } = donde;
  columna += haciaAtras ? -1 : 1;
  if (columna >= columnas.value) { columna = 0; fila += 1; }
  if (columna < 0) { columna = columnas.value - 1; fila -= 1; }
  if (fila < 0 || fila >= tabla.value.celdas.length) return;

  void abrir(fila, columna);
}

// Al salir del modo escritura de la tabla, lo que hubiera a medias se guarda.
watch(
  () => props.editable,
  (si) => {
    if (!si) guardar();
  },
);
</script>

<template>
  <div class="tabla-caja h-full w-full overflow-hidden p-1">
    <table
      class="tabla h-full w-full border-collapse"
      :style="{ ...estilos.tabla, ...estiloTabla }"
    >
      <tbody>
        <tr v-for="(fila, i) in tabla.celdas" :key="i" :style="{ backgroundColor: fondoFila(i) }">
          <component
            :is="esCabecera(i, j) ? 'th' : 'td'"
            v-for="(_celda, j) in fila"
            :key="j"
            :scope="esCabecera(i, j) ? (i === 0 && tabla.filaCabecera ? 'col' : 'row') : undefined"
            class="tabla-celda"
            :class="[esCabecera(i, j) && 'font-bold', editable && 'cursor-text', esElegida(i, j) && 'tabla-elegida']"
            :style="{ ...estilos.celda, ...(esCabecera(i, j) ? estilos.cabecera : {}), ...estiloCelda(i, j) }"
            :data-celda="`${i},${j}`"
            @click="alPulsar($event, i, j)"
          >
            <!-- El contenido lo pone y lo lee `rellenarCampo` / `leerCampo`, no Vue. -->
            <div
              v-if="esEditada(i, j)"
              :ref="guardarCampo"
              class="tabla-campo"
              contenteditable="true"
              spellcheck="true"
              role="textbox"
              :aria-label="`Celda fila ${i + 1}, columna ${j + 1}`"
              @blur="guardar"
              @keydown.enter.prevent="guardar"
              @keydown.esc.prevent="cancelar"
              @keydown.tab="siguiente"
              @paste="alPegar"
              @pointerdown.stop
            />
            <template v-else>
              <span
                v-for="(s, k) in segmentos(i, j)"
                :key="k"
                :style="s.estilo"
                :class="s.marcado && 'tabla-marcado'"
              >{{ s.t }}</span>
            </template>
          </component>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Igual que el resto de elementos: el texto crece con el recuadro. */
.tabla-caja {
  container-type: size;
}

.tabla {
  /*
   * El texto crece y encoge con el recuadro; el tamano que elige quien edita lo
   * agranda o lo achica sobre eso (14 = 1, el de siempre).
   */
  font-size: calc(clamp(6px, 7cqmin, 40px) * var(--escala-tabla, 1));
  table-layout: fixed;
}

.tabla-celda {
  padding: 0.35em 0.5em;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.tabla-campo {
  min-height: 1.2em;
  white-space: pre-wrap;
  outline: 2px solid currentColor;
  outline-offset: 2px;
  cursor: text;
}

/* Las celdas elegidas para darles formato desde el inspector. */
.tabla-elegida {
  outline: 2px dashed #2563eb;
  outline-offset: -3px;
}

/* El texto seleccionado al que se esta dando formato. */
.tabla-marcado {
  background-color: rgb(37 99 235 / 0.22);
  border-radius: 2px;
}
</style>
