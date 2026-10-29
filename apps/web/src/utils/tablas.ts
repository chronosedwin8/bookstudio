/**
 * Tablas del lienzo.
 *
 * Una tabla es una rejilla de texto mas unas cuantas decisiones de aspecto. No
 * se guarda ningun marcado: las celdas, el nombre de un diseno y, si alguien da
 * formato a una parte del texto, esa parte como tramos con sus marcas, igual que
 * una ilustracion guarda su escena. Asi no hay nada que sanear al pintarla y el
 * diseno puede mejorar sin tocar lo que ya escribio nadie.
 *
 * El formato va en tres capas, de mas general a mas concreta, y gana la ultima:
 *   tabla  -> todo el texto (tipografia, tamano, color, negrita...)
 *   celda  -> `estilos`: relleno, alineacion y el texto entero de la celda
 *   tramo  -> `ricos`: un trozo del texto de una celda
 */

import { FONT_FAMILIES, type FontFamily } from '../types/api';

export const DISENOS = ['lineas', 'rayas', 'cuadricula', 'minimal', 'tarjeta'] as const;
export type Diseno = (typeof DISENOS)[number];

export const ALINEACIONES = ['left', 'center', 'right'] as const;
export type Alineacion = (typeof ALINEACIONES)[number];

export const ALINEACIONES_VERTICALES = ['top', 'middle', 'bottom'] as const;
export type AlineacionVertical = (typeof ALINEACIONES_VERTICALES)[number];

/** Tamano de referencia: con `fontSize` 14 el texto queda como siempre. */
export const TAMANO_BASE = 14;
/** Escala de una celda o un tramo respecto al texto de la tabla. */
export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 3;

/** Formato de un trozo de texto. Solo lleva lo que cambia. */
export interface FormatoTexto {
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  color?: string;
  /** Respecto al tamano de la tabla: 1 = igual, 2 = el doble. */
  escala?: number;
  fuente?: FontFamily;
}

/** Un trozo del texto de una celda con su formato. */
export interface Tramo extends FormatoTexto {
  t: string;
}

/**
 * Formato propio de una celda, encima del de la tabla: el de todo su texto,
 * mas lo que solo tiene sentido por celda. Una celda sin formato es `null`.
 */
export interface EstiloCelda extends FormatoTexto {
  fondo?: string;
  alineacion?: Alineacion;
}

/** Cualquier cambio de formato que se puede pedir desde el inspector. */
export type CambioFormato = { [K in keyof EstiloCelda]?: EstiloCelda[K] | undefined };

/** Las claves que van con el texto (tramo) y no con la celda. */
export const CLAVES_TEXTO = ['negrita', 'cursiva', 'subrayado', 'color', 'escala', 'fuente'] as const;

/** Topes: mas alla de esto una tabla no se lee en una pagina. */
export const MAX_FILAS = 20;
export const MAX_COLUMNAS = 10;
export const MAX_CELDA = 300;
/** Tramos por celda: de sobra para 300 caracteres con formato salpicado. */
export const MAX_TRAMOS = 60;

export interface Tabla {
  /** Filas por columnas. La primera fila es la cabecera si `filaCabecera`. */
  celdas: string[][];
  filaCabecera: boolean;
  columnaCabecera: boolean;
  diseno: Diseno;
  colorAcento: string;
  colorTexto: string;
  /**
   * Tamano del texto. El texto crece y encoge con el recuadro; esto lo agranda o
   * lo achica sobre eso, con 14 como tamano de siempre.
   */
  fontSize: number;
  alineacion: Alineacion;
  alineacionVertical: AlineacionVertical;
  fuente: FontFamily;
  /** Formato de todo el cuerpo; la cabecera va siempre en negrita. */
  negrita: boolean;
  cursiva: boolean;
  subrayado: boolean;
  /** Formato por celda, con la misma forma que `celdas`. */
  estilos: (EstiloCelda | null)[][];
  /**
   * El texto de la celda en tramos, cuando parte de el tiene formato propio; null
   * si no. Al unirlos da exactamente `celdas[f][c]`, que sigue siendo el texto
   * (para buscar, leer en voz alta o exportar sin formato).
   */
  ricos: (Tramo[] | null)[][];
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

const rejillaVacia = <T>(celdas: string[][]): (T | null)[][] => celdas.map((fila) => fila.map(() => null));

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
    fontSize: TAMANO_BASE,
    alineacion: 'left',
    alineacionVertical: 'middle',
    fuente: 'Lato',
    negrita: false,
    cursiva: false,
    subrayado: false,
    estilos: rejillaVacia(celdas),
    ricos: rejillaVacia(celdas),
  };
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.slice(0, MAX_CELDA) : '');

const color = (v: unknown, siNo: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : siNo;

/** El formato de texto valido que trae un objeto cualquiera. */
function normalizarFormato(d: Record<string, unknown>): FormatoTexto {
  const e: FormatoTexto = {};
  if (d.negrita === true) e.negrita = true;
  if (d.cursiva === true) e.cursiva = true;
  if (d.subrayado === true) e.subrayado = true;
  const c = color(d.color, '');
  if (c) e.color = c;
  if (typeof d.escala === 'number' && Number.isFinite(d.escala) && d.escala !== 1) {
    e.escala = Math.round(Math.min(Math.max(d.escala, ESCALA_MIN), ESCALA_MAX) * 100) / 100;
  }
  if (FONT_FAMILIES.includes(d.fuente as FontFamily)) e.fuente = d.fuente as FontFamily;
  return e;
}

/** Deja un formato de celda valido, o null si no cambia nada. */
function normalizarEstilo(bruto: unknown): EstiloCelda | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const d = bruto as Record<string, unknown>;
  const e: EstiloCelda = normalizarFormato(d);
  const f = color(d.fondo, '');
  if (f) e.fondo = f;
  if (ALINEACIONES.includes(d.alineacion as Alineacion)) e.alineacion = d.alineacion as Alineacion;
  return Object.keys(e).length ? e : null;
}

const mismoFormato = (a: FormatoTexto, b: FormatoTexto): boolean =>
  CLAVES_TEXTO.every((k) => a[k] === b[k]);

const sinFormato = (f: FormatoTexto): boolean => CLAVES_TEXTO.every((k) => f[k] === undefined);

/**
 * Tramos validos, juntos los contiguos con el mismo formato. Devuelve null si no
 * queda formato que guardar (el texto plano basta) o si no casan con `textoCelda`:
 * entonces manda el texto, que es lo que se ve en todas partes.
 */
export function normalizarTramos(bruto: unknown, textoCelda: string): Tramo[] | null {
  if (!Array.isArray(bruto)) return null;
  const tramos: Tramo[] = [];
  for (const b of bruto.slice(0, MAX_TRAMOS)) {
    if (!b || typeof b !== 'object' || typeof (b as Tramo).t !== 'string' || !(b as Tramo).t) continue;
    const formato = normalizarFormato(b as Record<string, unknown>);
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && mismoFormato(ultimo, formato)) ultimo.t += (b as Tramo).t;
    else tramos.push({ t: (b as Tramo).t, ...formato });
  }
  if (tramos.map((x) => x.t).join('') !== textoCelda) return null;
  return tramos.some((x) => !sinFormato(x)) ? tramos : null;
}

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

  const rejilla = <T>(clave: string, fn: (v: unknown, i: number, j: number) => T | null): (T | null)[][] => {
    const brutos = Array.isArray(d[clave]) ? (d[clave] as unknown[]) : [];
    return celdas.map((fila, i) => {
      const filaBruta = Array.isArray(brutos[i]) ? (brutos[i] as unknown[]) : [];
      return fila.map((_, j) => fn(filaBruta[j], i, j));
    });
  };

  return {
    celdas,
    filaCabecera: d.filaCabecera !== false,
    columnaCabecera: d.columnaCabecera === true,
    diseno: DISENOS.includes(d.diseno as Diseno) ? (d.diseno as Diseno) : 'lineas',
    colorAcento: color(d.colorAcento, base.colorAcento),
    colorTexto: color(d.colorTexto, base.colorTexto),
    fontSize: typeof d.fontSize === 'number' && d.fontSize >= 8 && d.fontSize <= 48 ? d.fontSize : 14,
    alineacion: ALINEACIONES.includes(d.alineacion as Alineacion) ? (d.alineacion as Alineacion) : 'left',
    alineacionVertical: ALINEACIONES_VERTICALES.includes(d.alineacionVertical as AlineacionVertical)
      ? (d.alineacionVertical as AlineacionVertical)
      : 'middle',
    fuente: FONT_FAMILIES.includes(d.fuente as FontFamily) ? (d.fuente as FontFamily) : 'Lato',
    negrita: d.negrita === true,
    cursiva: d.cursiva === true,
    subrayado: d.subrayado === true,
    estilos: rejilla('estilos', (v) => normalizarEstilo(v)),
    ricos: rejilla('ricos', (v, i, j) => normalizarTramos(v, celdas[i][j])),
  };
}

// ---------------------------------------------------------------- editar

export const filasDe = (t: Tabla): number => t.celdas.length;
export const columnasDe = (t: Tabla): number => t.celdas[0]?.length ?? 0;

/** Cambia una celda de cada rejilla paralela (`estilos`, `ricos`). */
function enRejilla<T>(rejilla: T[][], fila: number, columna: number, valor: T): T[][] {
  return rejilla.map((f, i) => (i === fila ? f.map((v, j) => (j === columna ? valor : v)) : f));
}

/** Texto plano en una celda: pierde el formato por tramos. Devuelve una tabla nueva. */
export function conCelda(t: Tabla, fila: number, columna: number, valor: string): Tabla {
  if (!t.celdas[fila] || t.celdas[fila][columna] === undefined) return t;
  return {
    ...t,
    celdas: enRejilla(t.celdas, fila, columna, valor.slice(0, MAX_CELDA)),
    ricos: enRejilla(t.ricos, fila, columna, null),
  };
}

/** El texto de una celda con su formato por tramos, como sale del editor. */
export function conTramos(t: Tabla, fila: number, columna: number, tramos: Tramo[]): Tabla {
  if (!t.celdas[fila] || t.celdas[fila][columna] === undefined) return t;
  // Se recorta por caracteres, no por tramos: el ultimo puede quedarse a medias.
  let quedan = MAX_CELDA;
  const recortados: Tramo[] = [];
  for (const tr of tramos) {
    if (quedan <= 0) break;
    const trozo = tr.t.slice(0, quedan);
    quedan -= trozo.length;
    if (trozo) recortados.push({ ...tr, t: trozo });
  }
  const textoCelda = recortados.map((x) => x.t).join('');
  return {
    ...t,
    celdas: enRejilla(t.celdas, fila, columna, textoCelda),
    ricos: enRejilla(t.ricos, fila, columna, normalizarTramos(recortados, textoCelda)),
  };
}

export function anadirFila(t: Tabla, donde = filasDe(t)): Tabla {
  if (filasDe(t) >= MAX_FILAS) return t;
  const vacia = Array.from({ length: columnasDe(t) }, () => '');
  const pos = Math.min(Math.max(donde, 0), t.celdas.length);
  const insertar = <T>(rejilla: T[], fila: T): T[] => {
    const nueva = [...rejilla];
    nueva.splice(pos, 0, fila);
    return nueva;
  };
  return {
    ...t,
    celdas: insertar(t.celdas, vacia),
    estilos: insertar(t.estilos, vacia.map(() => null)),
    ricos: insertar(t.ricos, vacia.map(() => null)),
  };
}

export function quitarFila(t: Tabla, fila: number): Tabla {
  // Una tabla sin filas no es una tabla
  if (filasDe(t) <= 1) return t;
  return {
    ...t,
    celdas: t.celdas.filter((_, i) => i !== fila),
    estilos: t.estilos.filter((_, i) => i !== fila),
    ricos: t.ricos.filter((_, i) => i !== fila),
  };
}

export function anadirColumna(t: Tabla, donde = columnasDe(t)): Tabla {
  if (columnasDe(t) >= MAX_COLUMNAS) return t;
  const pos = Math.min(Math.max(donde, 0), columnasDe(t));
  const insertar = <T>(rejilla: T[][], valor: (i: number) => T): T[][] =>
    rejilla.map((fila, i) => {
      const nueva = [...fila];
      nueva.splice(pos, 0, valor(i));
      return nueva;
    });
  return {
    ...t,
    celdas: insertar(t.celdas, (i) => (i === 0 && t.filaCabecera ? `Columna ${pos + 1}` : '')),
    estilos: insertar(t.estilos, () => null),
    ricos: insertar(t.ricos, () => null),
  };
}

export function quitarColumna(t: Tabla, columna: number): Tabla {
  if (columnasDe(t) <= 1) return t;
  const quitar = <T>(rejilla: T[][]): T[][] => rejilla.map((fila) => fila.filter((_, j) => j !== columna));
  return { ...t, celdas: quitar(t.celdas), estilos: quitar(t.estilos), ricos: quitar(t.ricos) };
}

// ---------------------------------------------------------------- formato

/** Una celda, por fila y columna. */
export interface Celda {
  fila: number;
  columna: number;
}

/** Un trozo del texto de una celda, por posicion de caracteres [inicio, fin). */
export interface RangoTexto {
  inicio: number;
  fin: number;
}

export const existeCelda = (t: Tabla, c: Celda): boolean => t.celdas[c.fila]?.[c.columna] !== undefined;

export const estiloDe = (t: Tabla, c: Celda): EstiloCelda => t.estilos[c.fila]?.[c.columna] ?? {};

/** Los tramos de una celda; sin formato propio, uno solo con todo el texto. */
export function tramosDe(t: Tabla, c: Celda): Tramo[] {
  const ricos = t.ricos[c.fila]?.[c.columna];
  if (ricos) return ricos;
  const textoCelda = t.celdas[c.fila]?.[c.columna] ?? '';
  return textoCelda ? [{ t: textoCelda }] : [];
}

/** Las celdas del rectangulo entre dos, ambas incluidas. */
export function rectangulo(a: Celda, b: Celda): Celda[] {
  const celdas: Celda[] = [];
  for (let fila = Math.min(a.fila, b.fila); fila <= Math.max(a.fila, b.fila); fila++) {
    for (let columna = Math.min(a.columna, b.columna); columna <= Math.max(a.columna, b.columna); columna++) {
      celdas.push({ fila, columna });
    }
  }
  return celdas;
}

export const filaEntera = (t: Tabla, fila: number): Celda[] =>
  (t.celdas[fila] ?? []).map((_, columna) => ({ fila, columna }));
export const columnaEntera = (t: Tabla, columna: number): Celda[] => t.celdas.map((_, fila) => ({ fila, columna }));

/** Aplica un cambio a un formato: `undefined` quita la marca. */
function aplicar<T extends object>(base: T, cambio: CambioFormato): T {
  const nuevo = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(cambio)) {
    if (v === undefined) delete nuevo[k];
    else nuevo[k] = v;
  }
  return nuevo as T;
}

/** Solo las claves de `cambio` que van con el texto. */
function parteTexto(cambio: CambioFormato): CambioFormato {
  const r: CambioFormato = {};
  for (const k of CLAVES_TEXTO) if (k in cambio) (r as Record<string, unknown>)[k] = cambio[k];
  return r;
}

/**
 * Da formato a un trozo del texto de una celda. Lo de texto (negrita, color,
 * tamano...) va a ese trozo; lo que es de la celda (relleno, alineacion), a la
 * celda, porque no tiene sentido para medio texto.
 */
export function formatearTexto(t: Tabla, c: Celda, rango: RangoTexto, cambio: CambioFormato): Tabla {
  if (!existeCelda(t, c)) return t;
  const textoCambio = parteTexto(cambio);
  const deCelda: CambioFormato = {};
  if ('fondo' in cambio) deCelda.fondo = cambio.fondo;
  if ('alineacion' in cambio) deCelda.alineacion = cambio.alineacion;

  const inicio = Math.max(0, Math.min(rango.inicio, rango.fin));
  const fin = Math.max(rango.inicio, rango.fin);

  let resultado = t;
  if (Object.keys(textoCambio).length && fin > inicio) {
    const nuevos: Tramo[] = [];
    let pos = 0;
    for (const tr of tramosDe(t, c)) {
      const a = pos;
      const b = pos + tr.t.length;
      pos = b;
      // Partes del tramo antes, dentro y despues del rango.
      const cortes = [a, Math.min(Math.max(inicio, a), b), Math.min(Math.max(fin, a), b), b];
      for (let k = 0; k < 3; k++) {
        const trozo = tr.t.slice(cortes[k] - a, cortes[k + 1] - a);
        if (!trozo) continue;
        nuevos.push(k === 1 ? { ...aplicar(tr, textoCambio), t: trozo } : { ...tr, t: trozo });
      }
    }
    resultado = conTramos(t, c.fila, c.columna, nuevos);
  }
  if (Object.keys(deCelda).length) resultado = formatearCeldas(resultado, [c], deCelda);
  return resultado;
}

/**
 * Da formato a celdas enteras. El de texto pisa el que tuvieran sus trozos (si
 * se pone en rojo la celda, se pone en rojo todo lo que hay dentro), como en
 * cualquier procesador de textos al seleccionar el parrafo entero.
 */
export function formatearCeldas(t: Tabla, celdas: Celda[], cambio: CambioFormato | null): Tabla {
  const tocadas = new Set(celdas.map((c) => `${c.fila},${c.columna}`));
  const deTexto = cambio ? (Object.keys(parteTexto(cambio)) as (keyof FormatoTexto)[]) : [...CLAVES_TEXTO];
  return {
    ...t,
    estilos: t.estilos.map((fila, i) =>
      fila.map((actual, j) => {
        if (!tocadas.has(`${i},${j}`)) return actual;
        if (cambio === null) return null;
        return normalizarEstilo(aplicar(actual ?? {}, cambio));
      }),
    ),
    ricos: t.ricos.map((fila, i) =>
      fila.map((tramos, j) => {
        if (!tramos || !tocadas.has(`${i},${j}`) || !deTexto.length) return tramos;
        const limpios = tramos.map((tr) => {
          const copia = { ...tr };
          for (const k of deTexto) delete copia[k];
          return copia;
        });
        return normalizarTramos(limpios, t.celdas[i][j]);
      }),
    ),
  };
}

/**
 * Lo que tienen en comun los trozos de un rango: una marca sale solo si la
 * lleva todo el rango (para encender o no el boton de negrita, por ejemplo).
 */
export function formatoComun(t: Tabla, c: Celda, rango: RangoTexto | null): FormatoTexto {
  const celda = estiloDe(t, c);
  const tramos = tramosDe(t, c);
  const inicio = rango ? Math.min(rango.inicio, rango.fin) : 0;
  const fin = rango ? Math.max(rango.inicio, rango.fin) : Number.POSITIVE_INFINITY;
  const tocados: FormatoTexto[] = [];
  let pos = 0;
  for (const tr of tramos) {
    const a = pos;
    pos += tr.t.length;
    if (pos > inicio && a < fin) tocados.push({ ...pickTexto(celda), ...tr });
  }
  if (!tocados.length) return pickTexto(celda);
  const comun: FormatoTexto = {};
  for (const k of CLAVES_TEXTO) {
    const v = tocados[0][k];
    if (v !== undefined && tocados.every((x) => x[k] === v)) (comun as Record<string, unknown>)[k] = v;
  }
  return comun;
}

function pickTexto(e: EstiloCelda): FormatoTexto {
  const r: FormatoTexto = {};
  for (const k of CLAVES_TEXTO) if (e[k] !== undefined) (r as Record<string, unknown>)[k] = e[k];
  return r;
}

/** Texto plano de la tabla, para el texto alternativo y la busqueda. */
export function resumirTabla(t: Tabla): string {
  return `Tabla de ${filasDe(t)} filas por ${columnasDe(t)} columnas`;
}
