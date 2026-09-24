/** Los colores de cada tema, y los tonos que varian de una persona a otra. */
import type { Tema } from './catalogo';

export interface Paleta {
  /** Color principal: ropa del profesorado, pizarra, acentos grandes. */
  principal: string;
  /** Segundo color, para alternar la ropa y que un grupo no parezca uniformado. */
  secundario: string;
  /** Detalles pequenos: lomos de libros, botones, la punta del lapiz. */
  acento: string;
  /** Fondo de la escena. */
  fondo: string;
  /** Suelo o superficie. */
  suelo: string;
  /** Trazos y siluetas. */
  tinta: string;
  /** Bultos suaves del fondo. */
  bruma: string;
}

export const PALETAS: Record<Tema, Paleta> = {
  educational: {
    principal: '#2563EB',
    secundario: '#0EA5E9',
    acento: '#F59E0B',
    fondo: '#EFF6FF',
    suelo: '#DBEAFE',
    tinta: '#1E293B',
    bruma: '#DCEAFE',
  },
  technology: {
    principal: '#7C3AED',
    secundario: '#06B6D4',
    acento: '#F472B6',
    fondo: '#F5F3FF',
    suelo: '#EDE9FE',
    tinta: '#1E1B4B',
    bruma: '#E9D5FF',
  },
  nature: {
    principal: '#16A34A',
    secundario: '#65A30D',
    acento: '#F59E0B',
    fondo: '#F0FDF4',
    suelo: '#DCFCE7',
    tinta: '#14532D',
    bruma: '#BBF7D0',
  },
  warm: {
    principal: '#EA580C',
    secundario: '#DB2777',
    acento: '#FACC15',
    fondo: '#FFF7ED',
    suelo: '#FFEDD5',
    tinta: '#431407',
    bruma: '#FED7AA',
  },
};

/**
 * Tonos de piel y de pelo.
 *
 * Se reparten por el orden en que aparece cada persona, no al azar: la misma
 * escena tiene que dibujarse siempre igual, y un aula donde todo el mundo es
 * identico no se parece a ninguna aula.
 */
export const PIELES = ['#F1C89B', '#D8A374', '#A9714B', '#7A4B29', '#F7DCC0', '#B77C50'];
export const PELOS = ['#2F2A28', '#6B4423', '#B45309', '#111827', '#8B5E3C', '#4B5563'];

/** Ropa: se alterna para que dos personas seguidas no vayan iguales. */
export function colorRopa(paleta: Paleta, indice: number, esDocente: boolean): string {
  if (esDocente) return paleta.principal;
  const opciones = [paleta.secundario, paleta.acento, paleta.principal, '#64748B'];
  return opciones[indice % opciones.length];
}

export const piel = (indice: number): string => PIELES[indice % PIELES.length];
export const pelo = (indice: number): string => PELOS[indice % PELOS.length];

/** Cuantos cortes de pelo sabe dibujar `cabello()`. */
export const PEINADOS = 3;

/** Lo que distingue a una persona de otra en el dibujo. Son indices, no colores. */
export interface Rasgos {
  piel: number;
  pelo: number;
  ropa: number;
  peinado: number;
}

/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 *
 * Aleatorio pero repetible: la misma semilla da siempre la misma persona, asi que
 * una ilustracion guardada se sigue dibujando igual al reabrir el libro.
 */
function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar(n: number, azar: () => number): number[] {
  const lista = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(azar() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

/**
 * Los rasgos de cada persona de la escena.
 *
 * Con semilla 0 se reparten por orden de aparicion, como siempre: asi las
 * ilustraciones que ya estan en los libros no cambian de aspecto. Con cualquier
 * otra semilla se reparten al azar (repetible), y dos personas de la misma escena
 * nunca comparten piel ni pelo mientras haya tonos para todas.
 *
 * Antes solo existia el reparto por orden, y por eso toda escena de dos alumnos
 * salia con los mismos dos niños, con la misma ropa y el mismo peinado.
 */
export function rasgosDe(semilla: number, cuantos: number, esDocente: (i: number) => boolean): Rasgos[] {
  if (!semilla) {
    return Array.from({ length: cuantos }, (_, i) => ({
      piel: i + (esDocente(i) ? 3 : 0),
      pelo: i + (esDocente(i) ? 1 : 0),
      ropa: i,
      peinado: i % PEINADOS,
    }));
  }
  const azar = generador(semilla);
  const pieles = barajar(PIELES.length, azar);
  const pelos = barajar(PELOS.length, azar);
  const desfaseRopa = Math.floor(azar() * 4);
  return Array.from({ length: cuantos }, (_, i) => ({
    piel: pieles[i % pieles.length],
    pelo: pelos[i % pelos.length],
    ropa: i + desfaseRopa,
    peinado: Math.floor(azar() * PEINADOS),
  }));
}

/** Una semilla nueva para "Otra version". Nunca 0, que es el reparto de siempre. */
export const semillaNueva = (): number => 1 + Math.floor(Math.random() * 999_998);
