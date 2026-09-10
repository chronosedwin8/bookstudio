/**
 * Tablas del lienzo.
 *
 * Una tabla es una rejilla de texto plano mas unas cuantas decisiones de aspecto.
 * No se guarda ningun marcado: solo las celdas y el nombre de un diseno, igual
 * que una ilustracion guarda su escena. Asi no hay nada que sanear al pintarla y
 * el diseno puede mejorar sin tocar lo que ya escribio nadie.
 */

export const DISENOS = ['lineas', 'rayas', 'cuadricula', 'minimal', 'tarjeta'] as const;
export type Diseno = (typeof DISENOS)[number];

export const ALINEACIONES = ['left', 'center', 'right'] as const;
export type Alineacion = (typeof ALINEACIONES)[number];

/** Topes: mas alla de esto una tabla no se lee en una pagina. */
export const MAX_FILAS = 20;
export const MAX_COLUMNAS = 10;
export const MAX_CELDA = 300;

export interface Tabla {
  /** Filas por columnas. La primera fila es la cabecera si `filaCabecera`. */
  celdas: string[][];
  filaCabecera: boolean;
  columnaCabecera: boolean;
  diseno: Diseno;
  colorAcento: string;
  colorTexto: string;
  /** Tamano base; el texto crece con el recuadro a partir de aqui. */
  fontSize: number;
  alineacion: Alineacion;
}

export const NOMBRES_DISENO: Record<Diseno, string> = {
  lineas: 'Lineas',
  rayas: 'Filas alternas',
  cuadricula: 'Cuadricula',
  minimal: 'Sin bordes',
  tarjeta: 'Tarjeta',
};

export const DESCRIPCION_DISENO: Record<Diseno, string> = {
  lineas: 'Una linea bajo cada fila. Sobria y facil de leer.',
  rayas: 'Filas alternas sombreadas. Va bien con muchos datos.',
  cuadricula: 'Todas las lineas. La de siempre para cuadros de doble entrada.',
  minimal: 'Sin lineas, solo la cabecera. Para listas cortas.',
  tarjeta: 'Marco redondeado con cabecera de color.',
};

/** Una tabla nueva, con la cabecera puesta y el resto vacio. */
export function crearTabla(filas: number, columnas: number, diseno: Diseno = 'lineas'): Tabla {
  const f = Math.min(Math.max(filas, 1), MAX_FILAS);
  const c = Math.min(Math.max(columnas, 1), MAX_COLUMNAS);

  const celdas = Array.from({ length: f }, (_, fila) =>
    Array.from({ length: c }, (_, col) => (fila === 0 ? `Columna ${col + 1}` : '')),
  );

  return {
    celdas,
    filaCabecera: true,
    columnaCabecera: false,
    diseno,
    colorAcento: '#2563EB',
    colorTexto: '#1E293B',
    fontSize: 14,
    alineacion: 'left',
  };
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.slice(0, MAX_CELDA) : '');

const color = (v: unknown, siNo: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : siNo;

/**
 * Deja una tabla en condiciones de dibujarse.
 *
 * Nunca falla: rellena lo que falte y recorta lo que sobre. Hace falta porque la
 * tabla viaja como JSON y puede llegar de una version anterior, de una plantilla
 * o de alguien trasteando con la API.
 */
export function normalizarTabla(bruto: unknown): Tabla {
  const d = (bruto ?? {}) as Record<string, unknown>;
  const base = crearTabla(2, 2);

  const filasBrutas = Array.isArray(d.celdas) ? d.celdas : [];
  let celdas = filasBrutas
    .slice(0, MAX_FILAS)
    .map((fila) => (Array.isArray(fila) ? fila.slice(0, MAX_COLUMNAS).map(texto) : []));

  if (celdas.length === 0) celdas = base.celdas;

  // Todas las filas con el mismo numero de columnas: una fila corta descuadraria
  // la rejilla entera al pintarla.
  const columnas = Math.max(1, ...celdas.map((f) => f.length));
  celdas = celdas.map((fila) => {
    const completa = [...fila];
    while (completa.length < columnas) completa.push('');
    return completa;
  });

  return {
    celdas,
    filaCabecera: d.filaCabecera !== false,
    columnaCabecera: d.columnaCabecera === true,
    diseno: DISENOS.includes(d.diseno as Diseno) ? (d.diseno as Diseno) : 'lineas',
    colorAcento: color(d.colorAcento, base.colorAcento),
    colorTexto: color(d.colorTexto, base.colorTexto),
    fontSize: typeof d.fontSize === 'number' && d.fontSize >= 8 && d.fontSize <= 48 ? d.fontSize : 14,
    alineacion: ALINEACIONES.includes(d.alineacion as Alineacion) ? (d.alineacion as Alineacion) : 'left',
  };
}

// ---------------------------------------------------------------- editar

export const filasDe = (t: Tabla): number => t.celdas.length;
export const columnasDe = (t: Tabla): number => t.celdas[0]?.length ?? 0;

/** Devuelve una tabla nueva; no toca la original. */
export function conCelda(t: Tabla, fila: number, columna: number, valor: string): Tabla {
  if (!t.celdas[fila] || t.celdas[fila][columna] === undefined) return t;
  const celdas = t.celdas.map((f, i) =>
    i === fila ? f.map((c, j) => (j === columna ? valor.slice(0, MAX_CELDA) : c)) : f,
  );
  return { ...t, celdas };
}

export function anadirFila(t: Tabla, donde = filasDe(t)): Tabla {
  if (filasDe(t) >= MAX_FILAS) return t;
  const vacia = Array.from({ length: columnasDe(t) }, () => '');
  const celdas = [...t.celdas];
  celdas.splice(Math.min(Math.max(donde, 0), celdas.length), 0, vacia);
  return { ...t, celdas };
}

export function quitarFila(t: Tabla, fila: number): Tabla {
  // Una tabla sin filas no es una tabla
  if (filasDe(t) <= 1) return t;
  return { ...t, celdas: t.celdas.filter((_, i) => i !== fila) };
}

export function anadirColumna(t: Tabla, donde = columnasDe(t)): Tabla {
  if (columnasDe(t) >= MAX_COLUMNAS) return t;
  const pos = Math.min(Math.max(donde, 0), columnasDe(t));
  const celdas = t.celdas.map((fila, i) => {
    const nueva = [...fila];
    nueva.splice(pos, 0, i === 0 && t.filaCabecera ? `Columna ${pos + 1}` : '');
    return nueva;
  });
  return { ...t, celdas };
}

export function quitarColumna(t: Tabla, columna: number): Tabla {
  if (columnasDe(t) <= 1) return t;
  return { ...t, celdas: t.celdas.map((fila) => fila.filter((_, j) => j !== columna)) };
}

/** Texto plano de la tabla, para el texto alternativo y la busqueda. */
export function resumirTabla(t: Tabla): string {
  return `Tabla de ${filasDe(t)} filas por ${columnasDe(t)} columnas`;
}
