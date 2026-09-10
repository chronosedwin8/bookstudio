/**
 * El dibujo: COMO se pinta cada cosa.
 *
 * Los personajes no son figuras cerradas, sino un esqueleto: cadera, hombros,
 * cabeza y unas manos que la pose coloca donde tienen que estar. El codo sale de
 * ahi resolviendo el triangulo brazo-antebrazo (cinematica inversa), igual que
 * se hace en animacion.
 *
 * Parece mas trabajo que recortar munecos ya dibujados, y lo es, pero es lo unico
 * que consigue que una tablet quede EN las manos y no al lado: la pose sabe donde
 * estan las manos, asi que el objeto se dibuja justo ahi. Ademas cada parte queda
 * identificada, que es lo que hara falta el dia que un brazo tenga que levantarse
 * solo.
 */
import type { Emocion, Fondo, Objeto, Papel, Pose } from './catalogo';
import { componer, LINEA_SUELO, type PersonajeColocado } from './composicion';
import type { Escena } from './escena';
import { colorRopa, PALETAS, pelo, piel, type Paleta } from './paleta';
import { ALTO_LIENZO, ANCHO_LIENZO, type Primitiva } from './primitivas';

// ---------------------------------------------------------------- medidas

/** Todo en unidades locales, con el suelo en 0 y creciendo hacia arriba. */
const CUERPO = {
  alturaCadera: 78,
  alturaHombro: 154,
  alturaCabeza: 186,
  radioCabeza: 27,
  medioHombro: 26,
  brazo: 34,
  antebrazo: 32,
  muslo: 42,
  pierna: 38,
  grosorBrazo: 11,
  grosorPierna: 14,
  anchoTorso: 58,
};

/** Donde pone las manos cada pose, en coordenadas locales (x hacia delante, y hacia arriba). */
const MANOS: Record<Pose, { delante: [number, number]; detras: [number, number] }> = {
  /*
   * Dos reglas detras de estos numeros:
   *
   * 1. Las manos van por fuera del torso (que mide 58 de ancho): pegadas al
   *    cuerpo los brazos desaparecen tras el y la figura parece no tenerlos.
   * 2. El brazo mide 66 estirado, asi que una mano a menos de 40 del hombro
   *    obliga a un codo muy doblado, que se lee como "en jarras" o como un brazo
   *    cruzandose la cara. Los gestos altos se llevan lejos para que el brazo
   *    salga casi recto.
   */
  standing: { delante: [30, 74], detras: [-32, 74] },
  sitting: { delante: [34, 46], detras: [-2, 50] },
  talking: { delante: [70, 186], detras: [-32, 76] },
  pointing: { delante: [84, 150], detras: [-32, 74] },
  // Sosteniendo algo las dos manos se juntan por delante del pecho, repartidas a
  // los dos lados del eje: asi el objeto queda centrado y no colgando de un lado.
  reading: { delante: [30, 116], detras: [-10, 116] },
  using_tablet: { delante: [32, 106], detras: [-8, 106] },
};

// ---------------------------------------------------------------- utiles

const distancia = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

/**
 * Donde cae el codo para que la mano llegue a su sitio.
 *
 * Es el punto donde se cruzan dos circunferencias: una en el hombro con el largo
 * del brazo y otra en la mano con el del antebrazo. `lado` elige cual de los dos
 * cruces se usa, que es lo que decide si el codo apunta hacia fuera o hacia dentro.
 */
function codo(
  hx: number, hy: number, mx: number, my: number,
  brazo: number, antebrazo: number, lado: 1 | -1,
): [number, number] {
  let d = distancia(hx, hy, mx, my);
  // Si la mano queda mas lejos de lo que el brazo da de si, se acerca: mejor un
  // brazo estirado del todo que un codo imposible.
  const alcance = brazo + antebrazo - 0.01;
  if (d > alcance) d = alcance;
  if (d < 0.01) return [hx, hy - brazo];

  const ux = (mx - hx) / d;
  const uy = (my - hy) / d;
  const a = (brazo * brazo - antebrazo * antebrazo + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, brazo * brazo - a * a));

  return [hx + a * ux - lado * h * uy, hy + a * uy + lado * h * ux];
}

// ---------------------------------------------------------------- personaje

interface Lienzo {
  /** Pasa de coordenadas locales del personaje a las del dibujo. */
  punto: (lx: number, ly: number) => [number, number];
  escala: number;
}

function lienzoDe(c: PersonajeColocado): Lienzo {
  return {
    escala: c.escala,
    punto: (lx, ly) => [c.x + c.sentido * lx * c.escala, c.base - ly * c.escala],
  };
}

function extremidad(
  lienzo: Lienzo,
  desde: [number, number],
  medio: [number, number],
  hasta: [number, number],
  grosor: number,
  color: string,
): Primitiva {
  const [x1, y1] = lienzo.punto(desde[0], desde[1]);
  const [x2, y2] = lienzo.punto(medio[0], medio[1]);
  const [x3, y3] = lienzo.punto(hasta[0], hasta[1]);
  return {
    tipo: 'ruta',
    d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)}`,
    trazo: color,
    grosor: grosor * lienzo.escala,
    redondo: true,
    relleno: 'none',
  };
}

/** La cara: ojos y boca segun el animo. */
function cara(lienzo: Lienzo, alturaCabeza: number, emocion: Emocion, tinta: string): Primitiva[] {
  const formas: Primitiva[] = [];
  const r = CUERPO.radioCabeza;
  const ojoY = alturaCabeza + r * 0.12;
  const grosor = 2.4 * lienzo.escala;

  const ojos: Array<[number, number]> = [[-r * 0.3, ojoY], [r * 0.34, ojoY]];

  for (const [ox, oy] of ojos) {
    const [x, y] = lienzo.punto(ox, oy);
    if (emocion === 'focused') {
      formas.push({ tipo: 'linea', x1: x - 3 * lienzo.escala, y1: y, x2: x + 3 * lienzo.escala, y2: y, trazo: tinta, grosor, redondo: true });
    } else if (emocion === 'happy') {
      const b = 4 * lienzo.escala;
      formas.push({ tipo: 'ruta', d: `M ${(x - b).toFixed(1)} ${y.toFixed(1)} Q ${x.toFixed(1)} ${(y - b * 1.3).toFixed(1)} ${(x + b).toFixed(1)} ${y.toFixed(1)}`, trazo: tinta, grosor, redondo: true, relleno: 'none' });
    } else {
      formas.push({ tipo: 'circulo', cx: x, cy: y, r: 2.7 * lienzo.escala, relleno: tinta });
    }
  }

  // Boca
  const bocaY = alturaCabeza - r * 0.42;
  const [bx, by] = lienzo.punto(r * 0.02, bocaY);
  const ancho = 8 * lienzo.escala;

  if (emocion === 'thinking') {
    formas.push({ tipo: 'circulo', cx: bx, cy: by, r: 2.6 * lienzo.escala, relleno: 'none', trazo: tinta, grosor });
    // Ceja levantada: es lo que se lee como "estoy dandole vueltas"
    const [cx, cy] = lienzo.punto(r * 0.34, alturaCabeza + r * 0.42);
    formas.push({ tipo: 'linea', x1: cx - 4 * lienzo.escala, y1: cy + 1.5 * lienzo.escala, x2: cx + 4 * lienzo.escala, y2: cy - 1.5 * lienzo.escala, trazo: tinta, grosor, redondo: true });
  } else if (emocion === 'focused') {
    formas.push({ tipo: 'linea', x1: bx - ancho * 0.5, y1: by, x2: bx + ancho * 0.5, y2: by, trazo: tinta, grosor, redondo: true });
  } else {
    const hondo = emocion === 'happy' ? 6 : 3.6;
    formas.push({
      tipo: 'ruta',
      d: `M ${(bx - ancho).toFixed(1)} ${by.toFixed(1)} Q ${bx.toFixed(1)} ${(by + hondo * lienzo.escala).toFixed(1)} ${(bx + ancho).toFixed(1)} ${by.toFixed(1)}`,
      trazo: tinta, grosor, redondo: true, relleno: 'none',
    });
  }

  return formas;
}

/** Tres cortes de pelo, repartidos por orden de aparicion. */
function cabello(lienzo: Lienzo, alturaCabeza: number, variante: number, color: string): Primitiva[] {
  const r = CUERPO.radioCabeza;
  const [cx, cy] = lienzo.punto(0, alturaCabeza);
  const R = r * lienzo.escala;

  if (variante === 1) {
    // Melena: cubre la coronilla y baja por detras
    return [
      { tipo: 'ruta', d: `M ${(cx - R * 1.06).toFixed(1)} ${(cy + R * 0.1).toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${(cx + R * 1.06).toFixed(1)} ${(cy + R * 0.1).toFixed(1)} L ${(cx + R * 0.98).toFixed(1)} ${(cy + R * 0.62).toFixed(1)} L ${(cx - R * 0.98).toFixed(1)} ${(cy + R * 0.62).toFixed(1)} Z`, relleno: color },
      { tipo: 'elipse', cx: cx - R * 0.86, cy: cy + R * 0.34, rx: R * 0.3, ry: R * 0.62, relleno: color },
      { tipo: 'elipse', cx: cx + R * 0.86, cy: cy + R * 0.34, rx: R * 0.3, ry: R * 0.62, relleno: color },
    ];
  }

  if (variante === 2) {
    // Rizado: bultos sobre la cabeza
    const bultos: Primitiva[] = [];
    for (const [dx, dy, rr] of [[-0.7, 0.42, 0.4], [-0.24, 0.72, 0.44], [0.28, 0.7, 0.42], [0.72, 0.38, 0.36]]) {
      bultos.push({ tipo: 'circulo', cx: cx + R * dx, cy: cy - R * dy, r: R * rr, relleno: color });
    }
    return bultos;
  }

  // Corto: un casquete
  return [
    { tipo: 'ruta', d: `M ${(cx - R * 1.02).toFixed(1)} ${(cy - R * 0.06).toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${(cx + R * 1.02).toFixed(1)} ${(cy - R * 0.06).toFixed(1)} L ${(cx + R * 0.9).toFixed(1)} ${(cy - R * 0.3).toFixed(1)} L ${(cx - R * 0.9).toFixed(1)} ${(cy - R * 0.3).toFixed(1)} Z`, relleno: color },
  ];
}

export interface PersonajeDibujado {
  formas: Primitiva[];
  /** Donde han quedado las manos, para poner ahi lo que sostenga. */
  manos: { x: number; y: number; escala: number };
  profundidad: number;
}

export function dibujarPersonaje(c: PersonajeColocado, paleta: Paleta): PersonajeDibujado {
  const { personaje, indice } = c;
  const sentado = personaje.pose === 'sitting';
  const esDocente = personaje.papel === 'teacher';

  // Sentado, todo el cuerpo baja: la cadera se apoya en el asiento
  const bajada = sentado ? 38 : 0;
  const alturaCadera = CUERPO.alturaCadera - bajada;
  const alturaHombro = CUERPO.alturaHombro - bajada;
  const alturaCabeza = CUERPO.alturaCabeza - bajada;

  const lienzo = lienzoDe({ ...c, escala: c.escala * (esDocente ? 1.06 : 1) });
  const formas: Primitiva[] = [];

  const tonoPiel = piel(indice + (esDocente ? 3 : 0));
  const tonoPelo = pelo(indice + (esDocente ? 1 : 0));
  const ropa = colorRopa(paleta, indice, esDocente);
  const manosPose = MANOS[personaje.pose];

  // --- El asiento, si esta sentado ---
  if (sentado) {
    /*
     * La silla va DETRAS de la cadera, no debajo de los muslos: puesta debajo,
     * la figura parecia de pie junto a un palo. El asiento llega justo hasta la
     * cadera y las patas caen desde sus esquinas.
     */
    const asiento = alturaCadera - 10;
    const [sx, sy] = lienzo.punto(-8, asiento);
    const ancho = 46 * lienzo.escala;
    formas.push({ tipo: 'rect', x: sx - ancho / 2, y: sy, ancho, alto: 7 * lienzo.escala, radio: 3 * lienzo.escala, relleno: '#94A3B8' });
    // Respaldo, que es lo que remata la lectura de "silla"
    const [rx, ry] = lienzo.punto(-28, asiento);
    formas.push({ tipo: 'rect', x: rx - 3 * lienzo.escala, y: ry - 46 * lienzo.escala, ancho: 6 * lienzo.escala, alto: 48 * lienzo.escala, radio: 3 * lienzo.escala, relleno: '#94A3B8' });
    for (const dx of [-26, 10]) {
      const [px, py] = lienzo.punto(dx, asiento);
      formas.push({ tipo: 'linea', x1: px, y1: py, x2: px, y2: c.base, trazo: '#94A3B8', grosor: 5 * lienzo.escala, redondo: true });
    }
  }

  // --- Piernas (detras del torso) ---
  if (sentado) {
    // Muslo hacia delante y casi horizontal, espinilla a plomo hasta el suelo:
    // es el angulo recto de la rodilla lo que se lee como "esta sentado".
    for (const lado of [-1, 1]) {
      const cadera: [number, number] = [lado * 7 - 10, alturaCadera];
      const rodilla: [number, number] = [lado * 3 + 34, alturaCadera - 2];
      const pie: [number, number] = [lado * 3 + 36, 2];
      formas.push(extremidad(lienzo, cadera, rodilla, pie, CUERPO.grosorPierna, paleta.tinta));
    }
  } else {
    for (const lado of [-1, 1]) {
      const cadera: [number, number] = [lado * 10, alturaCadera];
      const rodilla: [number, number] = [lado * 12, alturaCadera - CUERPO.muslo];
      const pie: [number, number] = [lado * 13, 2];
      formas.push(extremidad(lienzo, cadera, rodilla, pie, CUERPO.grosorPierna, paleta.tinta));
    }
  }

  // --- Brazo de detras ---
  const hombroDetras: [number, number] = [-CUERPO.medioHombro, alturaHombro - 8];
  const manoDetras = manosPose.detras;
  const codoDetras = codo(hombroDetras[0], hombroDetras[1], manoDetras[0], manoDetras[1], CUERPO.brazo, CUERPO.antebrazo, -1);
  formas.push(extremidad(lienzo, hombroDetras, codoDetras, manoDetras, CUERPO.grosorBrazo, sombra(ropa)));

  // --- Torso ---
  const [tx, ty] = lienzo.punto(0, alturaHombro);
  const anchoTorso = CUERPO.anchoTorso * lienzo.escala;
  const altoTorso = (alturaHombro - alturaCadera + (sentado ? 0 : 14)) * lienzo.escala;
  formas.push({
    tipo: 'rect',
    x: tx - anchoTorso / 2,
    y: ty,
    ancho: anchoTorso,
    alto: altoTorso,
    radio: 16 * lienzo.escala,
    relleno: ropa,
  });

  // El profesorado lleva cuello, que es lo que lo distingue de un vistazo
  if (esDocente) {
    const [cx, cy] = lienzo.punto(0, alturaHombro);
    const a = 13 * lienzo.escala;
    formas.push({
      tipo: 'ruta',
      d: `M ${(cx - a).toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${(cy + a * 1.15).toFixed(1)} L ${(cx + a).toFixed(1)} ${cy.toFixed(1)} Z`,
      relleno: '#FFFFFF',
      opacidad: 0.9,
    });
  }

  // --- Cabeza ---
  const [hx, hy] = lienzo.punto(0, alturaCabeza);
  formas.push({ tipo: 'circulo', cx: hx, cy: hy, r: CUERPO.radioCabeza * lienzo.escala, relleno: tonoPiel });
  formas.push(...cabello(lienzo, alturaCabeza, indice % 3, tonoPelo));
  formas.push(...cara(lienzo, alturaCabeza, personaje.emocion, paleta.tinta));

  // --- Brazo de delante (por encima del torso) ---
  const hombroDelante: [number, number] = [CUERPO.medioHombro, alturaHombro - 8];
  const manoDelante = manosPose.delante;
  const codoDelante = codo(hombroDelante[0], hombroDelante[1], manoDelante[0], manoDelante[1], CUERPO.brazo, CUERPO.antebrazo, 1);
  formas.push(extremidad(lienzo, hombroDelante, codoDelante, manoDelante, CUERPO.grosorBrazo, ropa));

  // Las manos, que rematan el brazo y dan el punto de agarre
  for (const mano of [manoDetras, manoDelante]) {
    const [mx, my] = lienzo.punto(mano[0], mano[1]);
    formas.push({ tipo: 'circulo', cx: mx, cy: my, r: 6 * lienzo.escala, relleno: tonoPiel });
  }

  // Punto medio entre las dos manos: ahi va lo que sostenga
  const [m1x, m1y] = lienzo.punto(manoDelante[0], manoDelante[1]);
  const [m2x, m2y] = lienzo.punto(manoDetras[0], manoDetras[1]);

  return {
    formas,
    manos: { x: (m1x + m2x) / 2, y: (m1y + m2y) / 2, escala: lienzo.escala },
    profundidad: c.profundidad,
  };
}

/** Un tono mas oscuro para lo que queda por detras: da profundidad sin dibujar sombras. */
function sombra(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const oscurecer = (v: number) => Math.max(0, Math.round(v * 0.76));
  const r = oscurecer((num >> 16) & 255);
  const g = oscurecer((num >> 8) & 255);
  const b = oscurecer(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- objetos

/**
 * Los objetos se dibujan centrados en (x, y) y con su tamano multiplicado por
 * `escala`, para que valgan igual sueltos en la escena o en las manos de alguien.
 */
export function dibujarObjeto(
  objeto: Objeto,
  x: number,
  y: number,
  escala: number,
  paleta: Paleta,
): Primitiva[] {
  const e = escala;

  switch (objeto) {
    case 'tablet':
      return [
        { tipo: 'rect', x: x - 26 * e, y: y - 18 * e, ancho: 52 * e, alto: 36 * e, radio: 5 * e, relleno: paleta.tinta },
        { tipo: 'rect', x: x - 22 * e, y: y - 14 * e, ancho: 44 * e, alto: 28 * e, radio: 2 * e, relleno: paleta.secundario },
        { tipo: 'rect', x: x - 16 * e, y: y - 8 * e, ancho: 20 * e, alto: 3 * e, radio: 1.5 * e, relleno: '#FFFFFF', opacidad: 0.75 },
        { tipo: 'rect', x: x - 16 * e, y: y - 1 * e, ancho: 28 * e, alto: 3 * e, radio: 1.5 * e, relleno: '#FFFFFF', opacidad: 0.55 },
      ];

    case 'laptop':
      return [
        { tipo: 'ruta', d: `M ${(x - 30 * e).toFixed(1)} ${(y + 14 * e).toFixed(1)} L ${(x + 30 * e).toFixed(1)} ${(y + 14 * e).toFixed(1)} L ${(x + 24 * e).toFixed(1)} ${(y + 18 * e).toFixed(1)} L ${(x - 24 * e).toFixed(1)} ${(y + 18 * e).toFixed(1)} Z`, relleno: paleta.tinta },
        { tipo: 'rect', x: x - 26 * e, y: y - 20 * e, ancho: 52 * e, alto: 34 * e, radio: 3 * e, relleno: paleta.tinta },
        { tipo: 'rect', x: x - 22 * e, y: y - 16 * e, ancho: 44 * e, alto: 26 * e, radio: 2 * e, relleno: paleta.secundario },
      ];

    case 'book':
      return [
        { tipo: 'ruta', d: `M ${(x - 28 * e).toFixed(1)} ${(y - 16 * e).toFixed(1)} Q ${x.toFixed(1)} ${(y - 22 * e).toFixed(1)} ${(x + 28 * e).toFixed(1)} ${(y - 16 * e).toFixed(1)} L ${(x + 28 * e).toFixed(1)} ${(y + 16 * e).toFixed(1)} Q ${x.toFixed(1)} ${(y + 10 * e).toFixed(1)} ${(x - 28 * e).toFixed(1)} ${(y + 16 * e).toFixed(1)} Z`, relleno: '#FFFFFF', trazo: paleta.tinta, grosor: 2 * e },
        { tipo: 'linea', x1: x, y1: y - 19 * e, x2: x, y2: y + 13 * e, trazo: paleta.tinta, grosor: 2 * e },
        { tipo: 'linea', x1: x - 20 * e, y1: y - 8 * e, x2: x - 8 * e, y2: y - 9 * e, trazo: paleta.tinta, grosor: 1.6 * e, opacidad: 0.4, redondo: true },
        { tipo: 'linea', x1: x + 8 * e, y1: y - 9 * e, x2: x + 20 * e, y2: y - 8 * e, trazo: paleta.tinta, grosor: 1.6 * e, opacidad: 0.4, redondo: true },
      ];

    case 'notebook':
      return [
        { tipo: 'rect', x: x - 18 * e, y: y - 22 * e, ancho: 36 * e, alto: 44 * e, radio: 3 * e, relleno: '#FFFFFF', trazo: paleta.tinta, grosor: 2 * e },
        { tipo: 'rect', x: x - 18 * e, y: y - 22 * e, ancho: 7 * e, alto: 44 * e, relleno: paleta.acento },
        { tipo: 'linea', x1: x - 6 * e, y1: y - 8 * e, x2: x + 12 * e, y2: y - 8 * e, trazo: paleta.tinta, grosor: 1.8 * e, opacidad: 0.35, redondo: true },
        { tipo: 'linea', x1: x - 6 * e, y1: y + 2 * e, x2: x + 12 * e, y2: y + 2 * e, trazo: paleta.tinta, grosor: 1.8 * e, opacidad: 0.35, redondo: true },
      ];

    case 'document':
      return [
        { tipo: 'rect', x: x - 16 * e, y: y - 22 * e, ancho: 32 * e, alto: 44 * e, radio: 2 * e, relleno: '#FFFFFF', trazo: paleta.tinta, grosor: 2 * e },
        ...[-12, -4, 4, 12].map((dy, i): Primitiva => ({
          tipo: 'linea',
          x1: x - 9 * e, y1: y + dy * e,
          x2: x + (i === 3 ? 2 : 9) * e, y2: y + dy * e,
          trazo: paleta.tinta, grosor: 1.8 * e, opacidad: 0.35, redondo: true,
        })),
      ];

    case 'pencil':
      return [
        { tipo: 'rect', x: x - 4 * e, y: y - 22 * e, ancho: 8 * e, alto: 34 * e, radio: 1.5 * e, relleno: paleta.acento },
        { tipo: 'ruta', d: `M ${(x - 4 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} L ${(x + 4 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} L ${x.toFixed(1)} ${(y + 22 * e).toFixed(1)} Z`, relleno: paleta.tinta },
        { tipo: 'rect', x: x - 4 * e, y: y - 22 * e, ancho: 8 * e, alto: 6 * e, radio: 1.5 * e, relleno: '#F472B6' },
      ];

    case 'chat':
      return [
        { tipo: 'ruta', d: `M ${(x - 32 * e).toFixed(1)} ${(y - 24 * e).toFixed(1)} L ${(x + 32 * e).toFixed(1)} ${(y - 24 * e).toFixed(1)} Q ${(x + 40 * e).toFixed(1)} ${(y - 24 * e).toFixed(1)} ${(x + 40 * e).toFixed(1)} ${(y - 16 * e).toFixed(1)} L ${(x + 40 * e).toFixed(1)} ${(y + 4 * e).toFixed(1)} Q ${(x + 40 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} ${(x + 32 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} L ${(x - 14 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} L ${(x - 24 * e).toFixed(1)} ${(y + 24 * e).toFixed(1)} L ${(x - 22 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} L ${(x - 32 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} Q ${(x - 40 * e).toFixed(1)} ${(y + 12 * e).toFixed(1)} ${(x - 40 * e).toFixed(1)} ${(y + 4 * e).toFixed(1)} L ${(x - 40 * e).toFixed(1)} ${(y - 16 * e).toFixed(1)} Q ${(x - 40 * e).toFixed(1)} ${(y - 24 * e).toFixed(1)} ${(x - 32 * e).toFixed(1)} ${(y - 24 * e).toFixed(1)} Z`, relleno: '#FFFFFF', trazo: paleta.principal, grosor: 2.5 * e },
        ...[-14, 0, 14].map((dx): Primitiva => ({ tipo: 'circulo', cx: x + dx * e, cy: y - 6 * e, r: 4 * e, relleno: paleta.principal, opacidad: 0.65 })),
      ];
  }
}

// ---------------------------------------------------------------- fondos

function dibujarFondo(fondo: Fondo, paleta: Paleta): Primitiva[] {
  const formas: Primitiva[] = [
    { tipo: 'rect', x: 0, y: 0, ancho: ANCHO_LIENZO, alto: ALTO_LIENZO, relleno: paleta.fondo },
  ];

  // Bultos suaves: dan aire sin competir con las figuras
  formas.push(
    { tipo: 'circulo', cx: 110, cy: 110, r: 92, relleno: paleta.bruma, opacidad: 0.7 },
    { tipo: 'circulo', cx: 700, cy: 90, r: 66, relleno: paleta.bruma, opacidad: 0.55 },
  );

  switch (fondo) {
    case 'classroom':
      formas.push(
        // Pizarra
        { tipo: 'rect', x: 250, y: 70, ancho: 320, alto: 180, radio: 8, relleno: '#1F3A34' },
        { tipo: 'rect', x: 262, y: 82, ancho: 296, alto: 156, radio: 4, relleno: '#2A4A42' },
        { tipo: 'rect', x: 250, y: 250, ancho: 320, alto: 10, radio: 4, relleno: paleta.tinta, opacidad: 0.5 },
        // Unos trazos de tiza
        { tipo: 'linea', x1: 290, y1: 120, x2: 430, y2: 120, trazo: '#FFFFFF', grosor: 4, opacidad: 0.55, redondo: true },
        { tipo: 'linea', x1: 290, y1: 150, x2: 500, y2: 150, trazo: '#FFFFFF', grosor: 4, opacidad: 0.4, redondo: true },
        { tipo: 'linea', x1: 290, y1: 180, x2: 380, y2: 180, trazo: '#FFFFFF', grosor: 4, opacidad: 0.4, redondo: true },
      );
      break;

    case 'library':
      // Estanterias a los dos lados
      for (const baseX of [40, 610]) {
        formas.push({ tipo: 'rect', x: baseX, y: 90, ancho: 150, alto: 240, radio: 6, relleno: '#A97142', opacidad: 0.35 });
        for (let fila = 0; fila < 3; fila += 1) {
          const y = 104 + fila * 78;
          formas.push({ tipo: 'rect', x: baseX + 8, y: y + 56, ancho: 134, alto: 8, radio: 3, relleno: '#8B5E3C' });
          for (let libro = 0; libro < 7; libro += 1) {
            const alto = 40 + ((fila * 7 + libro) % 4) * 5;
            formas.push({
              tipo: 'rect',
              x: baseX + 12 + libro * 18,
              y: y + 56 - alto,
              ancho: 13,
              alto,
              radio: 2,
              relleno: [paleta.principal, paleta.acento, paleta.secundario, '#DC2626'][(fila + libro) % 4],
              opacidad: 0.85,
            });
          }
        }
      }
      break;

    case 'technology':
      // Una pantalla grande y su circuiteria
      formas.push(
        { tipo: 'rect', x: 280, y: 80, ancho: 260, alto: 160, radio: 12, relleno: paleta.tinta },
        { tipo: 'rect', x: 294, y: 94, ancho: 232, alto: 132, radio: 6, relleno: paleta.secundario, opacidad: 0.85 },
        { tipo: 'rect', x: 316, y: 120, ancho: 90, alto: 8, radio: 4, relleno: '#FFFFFF', opacidad: 0.7 },
        { tipo: 'rect', x: 316, y: 142, ancho: 150, alto: 8, radio: 4, relleno: '#FFFFFF', opacidad: 0.5 },
        { tipo: 'rect', x: 316, y: 164, ancho: 120, alto: 8, radio: 4, relleno: '#FFFFFF', opacidad: 0.35 },
        { tipo: 'rect', x: 386, y: 240, ancho: 48, alto: 16, radio: 4, relleno: paleta.tinta, opacidad: 0.7 },
      );
      for (const [cx, cy] of [[130, 250], [690, 230], [150, 120]]) {
        formas.push(
          { tipo: 'circulo', cx, cy, r: 9, relleno: paleta.principal, opacidad: 0.5 },
          { tipo: 'circulo', cx, cy, r: 20, relleno: 'none', trazo: paleta.principal, grosor: 2.5, opacidad: 0.3 },
        );
      }
      break;

    case 'abstract':
      formas.push(
        { tipo: 'circulo', cx: 400, cy: 190, r: 130, relleno: paleta.bruma, opacidad: 0.3 },
        { tipo: 'circulo', cx: 250, cy: 260, r: 70, relleno: paleta.principal, opacidad: 0.12 },
        { tipo: 'circulo', cx: 560, cy: 170, r: 54, relleno: paleta.acento, opacidad: 0.16 },
      );
      break;
  }

  // El suelo va siempre, que es lo que sostiene a las figuras
  formas.push({
    tipo: 'ruta',
    d: `M 0 ${LINEA_SUELO} Q ${ANCHO_LIENZO / 2} ${LINEA_SUELO - 22} ${ANCHO_LIENZO} ${LINEA_SUELO} L ${ANCHO_LIENZO} ${ALTO_LIENZO} L 0 ${ALTO_LIENZO} Z`,
    relleno: paleta.suelo,
  });

  return formas;
}

// ---------------------------------------------------------------- escena

/**
 * La ilustracion entera, en orden de capas.
 *
 * El orden importa y es siempre el mismo: fondo, lo que queda lejos, la gente
 * por profundidad, lo que sostienen y por ultimo lo que va en primer plano.
 */
export function dibujarEscena(escena: Escena): Primitiva[] {
  const paleta = PALETAS[escena.tema] ?? PALETAS.educational;
  const { personajes, objetos } = componer(escena);

  const formas: Primitiva[] = dibujarFondo(escena.fondo, paleta);

  // Objetos del fondo (profundidad baja), antes que la gente
  for (const o of objetos.filter((x) => x.profundidad <= 2)) {
    formas.push(...dibujarObjeto(o.objeto.objeto, o.x, o.base - 30 * o.escala, o.escala, paleta));
  }

  // Sombra de apoyo: pega las figuras al suelo
  for (const c of personajes) {
    formas.push({ tipo: 'elipse', cx: c.x, cy: c.base + 4, rx: 40 * c.escala, ry: 8 * c.escala, relleno: paleta.tinta, opacidad: 0.12 });
  }

  // La gente, de atras hacia delante
  const ordenados = [...personajes].sort((a, b) => a.profundidad - b.profundidad);
  for (const c of ordenados) {
    const dibujado = dibujarPersonaje(c, paleta);
    formas.push(...dibujado.formas);

    if (c.personaje.sostiene) {
      formas.push(...dibujarObjeto(c.personaje.sostiene, dibujado.manos.x, dibujado.manos.y, dibujado.manos.escala * 0.85, paleta));
    }
  }

  // Y lo que va delante o flotando
  for (const o of objetos.filter((x) => x.profundidad > 2)) {
    formas.push(...dibujarObjeto(o.objeto.objeto, o.x, o.base - 30 * o.escala, o.escala, paleta));
  }

  return formas;
}

export type { Papel, Pose, Emocion };
