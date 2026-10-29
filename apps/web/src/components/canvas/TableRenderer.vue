<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useEditorStore } from '@/stores/editor';
import { TAMANO_BASE, columnasDe, estiloDe, normalizarTabla, type Tabla } from '@/utils/tablas';

/**
 * Tabla del lienzo.
 *
 * Es una `<table>` de verdad, no una rejilla dibujada: asi el lector de pantalla
 * la anuncia como tabla, la cabecera se asocia a sus columnas y al exportar el
 * libro sigue siendo una tabla. El aspecto sale del diseno elegido, y el texto
 * crece con el recuadro como en los demas elementos.
 */
const props = defineProps<{
  tabla: Tabla | Record<string, unknown> | null | undefined;
  /** En el editor se puede escribir dentro; en la lectura no. */
  editable?: boolean;
  /** Para marcar la celda elegida y darle formato desde el inspector. */
  elementId?: string;
}>();

const editorStore = useEditorStore();

const emit = defineEmits<{ cambiar: [tabla: Tabla] }>();

const tabla = computed(() => normalizarTabla(props.tabla));
const columnas = computed(() => columnasDe(tabla.value));

/** Celda que se esta escribiendo, o null. */
const editando = ref<{ fila: number; columna: number } | null>(null);

/*
 * El campo se guarda con una referencia de funcion y no con `ref="campo"`.
 *
 * Dentro de un `v-for`, Vue recoge las referencias en un array aunque solo haya
 * un elemento pintado, y entonces `campo.value.focus()` no es una funcion: la
 * celda se abria pero no recibia el cursor.
 */
const campo = ref<HTMLInputElement | null>(null);
const guardarCampo = (el: unknown): void => {
  campo.value = el instanceof HTMLInputElement ? el : null;
};

const esCabecera = (fila: number, columna: number): boolean =>
  (tabla.value.filaCabecera && fila === 0) || (tabla.value.columnaCabecera && columna === 0);

/** La celda elegida para el formato, si es de esta tabla. */
function esElegida(fila: number, columna: number): boolean {
  const c = editorStore.celdaTabla;
  return Boolean(props.elementId && c && c.elementId === props.elementId && c.fila === fila && c.columna === columna);
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

/** Lo propio de cada celda, encima del diseno y del formato de la tabla. */
function estiloCelda(fila: number, columna: number): Record<string, string | number> {
  const e = estiloDe(tabla.value, { fila, columna });
  const r: Record<string, string | number> = { verticalAlign: tabla.value.alineacionVertical };
  if (e.negrita) r.fontWeight = 700;
  if (e.cursiva) r.fontStyle = 'italic';
  if (e.subrayado) r.textDecoration = 'underline';
  if (e.color) r.color = e.color;
  if (e.fondo) r.backgroundColor = e.fondo;
  if (e.escala) r.fontSize = `${e.escala}em`;
  if (e.alineacion) r.textAlign = e.alineacion;
  return r;
}

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

/** El sombreado alterno del diseno de rayas. */
function fondoFila(fila: number): string | undefined {
  if (tabla.value.diseno !== 'rayas') return undefined;
  const desplazado = tabla.value.filaCabecera ? fila - 1 : fila;
  return desplazado >= 0 && desplazado % 2 === 1 ? `${tabla.value.colorAcento}0f` : undefined;
}

/**
 * Abre una celda para escribir.
 *
 * Basta un clic porque a este modo se entra a proposito, con doble clic sobre la
 * tabla: una vez dentro, pedir otro doble clic por celda solo estorbaria.
 */
async function abrir(fila: number, columna: number): Promise<void> {
  if (!props.editable) return;
  if (props.elementId) editorStore.celdaTabla = { elementId: props.elementId, fila, columna };
  editando.value = { fila, columna };
  await nextTick();
  campo.value?.focus();
  campo.value?.select();
}

function guardar(valor: string): void {
  const donde = editando.value;
  if (!donde) return;
  const t = tabla.value;
  const celdas = t.celdas.map((fila, i) =>
    i === donde.fila ? fila.map((c, j) => (j === donde.columna ? valor : c)) : fila,
  );
  editando.value = null;
  emit('cambiar', { ...t, celdas });
}

/**
 * Tabulador para pasar a la celda siguiente, como en cualquier hoja de calculo.
 * Sin esto habria que ir picando celda por celda con el raton.
 */
function siguiente(evento: KeyboardEvent, valor: string): void {
  const donde = editando.value;
  if (!donde) return;
  evento.preventDefault();
  guardar(valor);

  const haciaAtras = evento.shiftKey;
  let { fila, columna } = donde;
  columna += haciaAtras ? -1 : 1;
  if (columna >= columnas.value) { columna = 0; fila += 1; }
  if (columna < 0) { columna = columnas.value - 1; fila -= 1; }
  if (fila < 0 || fila >= tabla.value.celdas.length) return;

  void abrir(fila, columna);
}
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
            v-for="(celda, j) in fila"
            :key="j"
            :scope="esCabecera(i, j) ? (i === 0 && tabla.filaCabecera ? 'col' : 'row') : undefined"
            class="tabla-celda"
            :class="[esCabecera(i, j) && 'font-bold', editable && 'cursor-text', esElegida(i, j) && 'tabla-elegida']"
            :style="{ ...estilos.celda, ...(esCabecera(i, j) ? estilos.cabecera : {}), ...estiloCelda(i, j) }"
            :data-celda="`${i},${j}`"
            @click="abrir(i, j)"
          >
            <input
              v-if="editando && editando.fila === i && editando.columna === j"
              :ref="guardarCampo"
              class="tabla-campo"
              :value="celda"
              :style="{ textAlign: estiloDe(tabla, { fila: i, columna: j }).alineacion ?? tabla.alineacion }"
              @blur="guardar(($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="guardar(($event.target as HTMLInputElement).value)"
              @keydown.esc.prevent="editando = null"
              @keydown.tab="siguiente($event, ($event.target as HTMLInputElement).value)"
              @pointerdown.stop
            />
            <span v-else>{{ celda }}</span>
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

/* La celda a la que se esta dando formato desde el inspector. */
.tabla-elegida {
  outline: 2px dashed #2563eb;
  outline-offset: -3px;
}

.tabla-celda {
  padding: 0.35em 0.5em;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.tabla-campo {
  width: 100%;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
