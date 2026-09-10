/**
 * Las piezas con las que se dibuja: rectangulos, circulos y trazos.
 *
 * El dibujo no produce texto SVG, produce esta lista de formas. De ahi salen dos
 * caminos con el mismo contenido: el lienzo las pinta con Vue, elemento a
 * elemento, y la exportacion las convierte en SVG.
 *
 * Se hace asi por seguridad, y no por gusto: nunca hay una cadena de SVG venida
 * de la IA ni de nadie que haya que sanear, porque no existe tal cadena. Lo
 * unico que puede llegar de fuera son numeros y valores de una lista cerrada.
 */

export interface Trazado {
  relleno?: string;
  trazo?: string;
  grosor?: number;
  opacidad?: number;
  /** Extremos redondeados, que es lo que da el aire amable a brazos y piernas. */
  redondo?: boolean;
}

export type Primitiva =
  | ({ tipo: 'rect'; x: number; y: number; ancho: number; alto: number; radio?: number } & Trazado)
  | ({ tipo: 'circulo'; cx: number; cy: number; r: number } & Trazado)
  | ({ tipo: 'elipse'; cx: number; cy: number; rx: number; ry: number; giro?: number } & Trazado)
  | ({ tipo: 'ruta'; d: string } & Trazado)
  | ({ tipo: 'linea'; x1: number; y1: number; x2: number; y2: number } & Trazado)
  | { tipo: 'grupo'; hijos: Primitiva[]; opacidad?: number };

/** Redondea a dos decimales: el SVG no necesita mas y pesa menos. */
const n = (valor: number): string => {
  const r = Math.round(valor * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Solo se dejan pasar colores con forma de color. Nada de `url(...)` ni expresiones. */
const COLOR_VALIDO = /^(#[0-9a-fA-F]{3,8}|none|transparent|currentColor)$/;
const color = (valor: string | undefined, siNo: string): string =>
  valor && COLOR_VALIDO.test(valor) ? valor : siNo;

function atributos(p: Trazado): string {
  const partes = [
    `fill="${color(p.relleno, 'none')}"`,
    p.trazo ? `stroke="${color(p.trazo, 'none')}"` : '',
    p.grosor !== undefined ? `stroke-width="${n(p.grosor)}"` : '',
    p.redondo ? 'stroke-linecap="round" stroke-linejoin="round"' : '',
    p.opacidad !== undefined && p.opacidad !== 1 ? `opacity="${n(p.opacidad)}"` : '',
  ];
  return partes.filter(Boolean).join(' ');
}

/** Solo comandos de ruta: letras, numeros y separadores. Nada mas puede colarse. */
const RUTA_VALIDA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,+-]*$/;

/** Convierte una forma en su etiqueta SVG. */
export function primitivaASvg(p: Primitiva): string {
  switch (p.tipo) {
    case 'grupo': {
      const dentro = p.hijos.map(primitivaASvg).join('');
      const op = p.opacidad !== undefined && p.opacidad !== 1 ? ` opacity="${n(p.opacidad)}"` : '';
      return `<g${op}>${dentro}</g>`;
    }
    case 'rect': {
      const radio = p.radio ? ` rx="${n(p.radio)}"` : '';
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.ancho)}" height="${n(p.alto)}"${radio} ${atributos(p)}/>`;
    }
    case 'circulo':
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" ${atributos(p)}/>`;
    case 'elipse': {
      const giro = p.giro ? ` transform="rotate(${n(p.giro)} ${n(p.cx)} ${n(p.cy)})"` : '';
      return `<ellipse cx="${n(p.cx)}" cy="${n(p.cy)}" rx="${n(p.rx)}" ry="${n(p.ry)}"${giro} ${atributos(p)}/>`;
    }
    case 'ruta':
      return RUTA_VALIDA.test(p.d) ? `<path d="${p.d}" ${atributos(p)}/>` : '';
    case 'linea':
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" ${atributos(p)}/>`;
  }
}

/**
 * Deja la lista sin grupos anidados.
 *
 * Quien pinta en el navegador recorre formas sueltas; asi no hace falta un
 * componente que se llame a si mismo para bajar por el arbol. La opacidad del
 * grupo se multiplica en cada hijo, que es lo que hace el SVG de todos modos.
 */
export function aplanar(formas: Primitiva[], opacidadHeredada = 1): Exclude<Primitiva, { tipo: 'grupo' }>[] {
  const salida: Exclude<Primitiva, { tipo: 'grupo' }>[] = [];
  for (const forma of formas) {
    if (forma.tipo === 'grupo') {
      salida.push(...aplanar(forma.hijos, opacidadHeredada * (forma.opacidad ?? 1)));
    } else if (opacidadHeredada === 1) {
      salida.push(forma);
    } else {
      salida.push({ ...forma, opacidad: (forma.opacidad ?? 1) * opacidadHeredada });
    }
  }
  return salida;
}

/** El texto que va dentro de `<title>` y `<desc>`: sin marcado posible. */
export function escaparTexto(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ANCHO_LIENZO = 800;
export const ALTO_LIENZO = 500;

/**
 * SVG completo y autonomo, para la exportacion.
 *
 * Lleva `<title>` y `<desc>` para quien navegue con lector de pantalla, y
 * `role="img"` para que se anuncie como una sola imagen y no como un monton de
 * formas sueltas.
 */
export function svgCompleto(formas: Primitiva[], titulo: string, descripcion: string): string {
  const idT = 'ilus-t';
  const idD = 'ilus-d';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO_LIENZO} ${ALTO_LIENZO}" ` +
    `role="img" aria-labelledby="${idT} ${idD}" preserveAspectRatio="xMidYMid meet" ` +
    `width="100%" height="100%">` +
    `<title id="${idT}">${escaparTexto(titulo)}</title>` +
    `<desc id="${idD}">${escaparTexto(descripcion)}</desc>` +
    formas.map(primitivaASvg).join('') +
    `</svg>`
  );
}
