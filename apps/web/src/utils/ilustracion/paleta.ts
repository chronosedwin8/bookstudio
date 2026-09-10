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
