/**
 * Donde se coloca cada cosa.
 *
 * Este modulo no dibuja: reparte el espacio. Recibe una escena y devuelve, para
 * cada personaje y cada objeto, un sitio y un tamano en el lienzo de 800x500.
 *
 * No se usan coordenadas fijas por escena, sino puntos de anclaje que se
 * reparten segun cuanta gente haya: con dos personas se separan mas, con cuatro
 * se juntan y encogen un poco. Asi cuatro distribuciones bastan para muchas
 * escenas distintas sin que ninguna quede amontonada.
 */
import type { Distribucion, Posicion } from './catalogo';
import type { Escena, ObjetoEscena, PersonajeEscena } from './escena';
import { ALTO_LIENZO, ANCHO_LIENZO } from './primitivas';

/** El suelo: donde apoyan los pies. */
export const LINEA_SUELO = 430;

export interface Sitio {
  x: number;
  /** Donde apoya: los pies de una persona, la base de un objeto. */
  base: number;
  escala: number;
  /** Mas alto se dibuja despues, y por tanto por delante. */
  profundidad: number;
}

export interface PersonajeColocado extends Sitio {
  personaje: PersonajeEscena;
  indice: number;
  /** Hacia donde mira: 1 a la derecha, -1 a la izquierda. */
  sentido: 1 | -1;
}

export interface ObjetoColocado extends Sitio {
  objeto: ObjetoEscena;
}

export interface Composicion {
  personajes: PersonajeColocado[];
  objetos: ObjetoColocado[];
}

/**
 * Reparto horizontal segun cuanta gente hay.
 *
 * Los valores son fracciones del ancho. Estan escritos a mano y no calculados
 * porque una escena de tres no es un reparto regular: la del centro va un poco
 * mas atras, que es lo que da sensacion de corro en vez de fila.
 */
const REPARTOS: Record<number, Array<{ x: number; escala: number; profundidad: number }>> = {
  1: [{ x: 0.5, escala: 1, profundidad: 2 }],
  2: [
    { x: 0.36, escala: 0.98, profundidad: 2 },
    { x: 0.64, escala: 1, profundidad: 3 },
  ],
  3: [
    { x: 0.26, escala: 0.95, profundidad: 3 },
    { x: 0.5, escala: 0.88, profundidad: 1 },
    { x: 0.74, escala: 0.97, profundidad: 3 },
  ],
  4: [
    { x: 0.2, escala: 0.9, profundidad: 3 },
    { x: 0.4, escala: 0.84, profundidad: 1 },
    { x: 0.6, escala: 0.86, profundidad: 2 },
    { x: 0.8, escala: 0.92, profundidad: 3 },
  ],
};

/** Cuanto se agranda todo segun la distribucion. Una sola persona luce mas grande. */
const TAMANO: Record<Distribucion, number> = {
  single: 1.15,
  pair: 1,
  group: 0.92,
  collaboration: 0.98,
};

/**
 * Si una persona pide un sitio concreto se respeta; si no, se toma del reparto.
 * Es lo que permite decir "el docente a la izquierda" sin descolocar al resto.
 */
const PEDIDO: Partial<Record<Posicion, number>> = {
  left: 0.22,
  center: 0.5,
  right: 0.78,
  'upper-left': 0.24,
  'upper-right': 0.76,
  foreground: 0.5,
};

export function componer(escena: Escena): Composicion {
  const gente = escena.personajes;
  const reparto = REPARTOS[Math.min(Math.max(gente.length, 1), 4)] ?? REPARTOS[1];
  const tamano = TAMANO[escena.distribucion] ?? 1;

  /*
   * Cuando varias personas piden el mismo sitio se ignora lo pedido y se usa el
   * reparto: es lo unico que evita que "tres estudiantes en el centro" acaben
   * dibujadas una encima de otra.
   */
  const pedidos = gente.map((p) => p.posicion);
  const hayChoque = new Set(pedidos).size < pedidos.length;

  const personajes: PersonajeColocado[] = gente.map((personaje, indice) => {
    const hueco = reparto[indice] ?? reparto[reparto.length - 1];
    const fraccion = !hayChoque && PEDIDO[personaje.posicion] !== undefined
      ? (PEDIDO[personaje.posicion] as number)
      : hueco.x;

    return {
      personaje,
      indice,
      x: fraccion * ANCHO_LIENZO,
      base: LINEA_SUELO,
      escala: hueco.escala * tamano,
      profundidad: hueco.profundidad,
      // Se miran entre si: quien esta a la izquierda mira a la derecha
      sentido: fraccion < 0.5 ? 1 : -1,
    };
  });

  // Con una sola persona no hay a quien mirar; que mire de frente al lector
  if (personajes.length === 1) personajes[0].sentido = 1;

  const objetos: ObjetoColocado[] = escena.objetos.map((objeto) => sitioDeObjeto(objeto, tamano, personajes));

  return { personajes, objetos };
}

/**
 * Los objetos sueltos se apartan de la gente.
 *
 * Un objeto en "foreground" va delante y abajo; uno arriba flota sobre la
 * escena, que es donde se entiende un globo de conversacion.
 */
function sitioDeObjeto(
  objeto: ObjetoEscena,
  tamano: number,
  personajes: PersonajeColocado[],
): ObjetoColocado {
  const centroGente = personajes.length
    ? personajes.reduce((suma, p) => suma + p.x, 0) / personajes.length
    : ANCHO_LIENZO / 2;

  switch (objeto.posicion) {
    case 'foreground':
      return { objeto, x: centroGente, base: ALTO_LIENZO - 24, escala: 1.1 * tamano, profundidad: 9 };
    case 'upper-left':
      return { objeto, x: ANCHO_LIENZO * 0.18, base: 150, escala: 0.9 * tamano, profundidad: 8 };
    case 'upper-right':
      return { objeto, x: ANCHO_LIENZO * 0.82, base: 150, escala: 0.9 * tamano, profundidad: 8 };
    case 'left':
      return { objeto, x: ANCHO_LIENZO * 0.12, base: LINEA_SUELO, escala: tamano, profundidad: 1 };
    case 'right':
      return { objeto, x: ANCHO_LIENZO * 0.88, base: LINEA_SUELO, escala: tamano, profundidad: 1 };
    case 'center':
    default:
      // En el centro estorbaria a la gente: se pone delante, a sus pies
      return { objeto, x: centroGente, base: ALTO_LIENZO - 40, escala: tamano, profundidad: 9 };
  }
}
