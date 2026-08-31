/**
 * Escala de notas alemana: de 1.0 a 6.0, donde **1.0 es la mejor** y 6.0 la peor.
 *
 * Va al reves de lo que sugiere la intuicion, y es justo el tipo de detalle que se
 * pinta mal sin darse cuenta: un verde en el 6.0 le diria a una familia que su hijo
 * va bien cuando va mal. Por eso el color vive aqui, en un solo sitio, y no repartido
 * por las plantillas.
 */

export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 6;

export interface EscalonNota {
  hasta: number;
  etiqueta: string;
  clase: string;
}

/** Tramos de la escala, de mejor a peor. */
export const ESCALA: EscalonNota[] = [
  { hasta: 1.5, etiqueta: 'Muy bien', clase: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { hasta: 2.5, etiqueta: 'Bien', clase: 'bg-lime-100 text-lime-800 border-lime-300' },
  { hasta: 3.5, etiqueta: 'Satisfactorio', clase: 'bg-amber-100 text-amber-800 border-amber-300' },
  { hasta: 4.5, etiqueta: 'Suficiente', clase: 'bg-orange-100 text-orange-800 border-orange-300' },
  { hasta: 5.5, etiqueta: 'Deficiente', clase: 'bg-red-100 text-red-800 border-red-300' },
  { hasta: 6.0, etiqueta: 'Insuficiente', clase: 'bg-red-200 text-red-900 border-red-400' },
];

function escalon(nota: number): EscalonNota {
  return ESCALA.find((e) => nota <= e.hasta) ?? ESCALA[ESCALA.length - 1];
}

/** Clases de color del tramo al que pertenece la nota. */
export const colorNota = (nota: number): string => escalon(nota).clase;

/** Nombre del tramo: "Bien", "Deficiente"... */
export const etiquetaNota = (nota: number): string => escalon(nota).etiqueta;

/** Siempre con un decimal: 2 se lee "2.0", que es como se escribe una nota. */
export const formatoNota = (nota: number): string => nota.toFixed(1);

/** Fecha y hora completas, que es lo que hace falta al revisar una valoracion. */
export const fechaHora = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' });
