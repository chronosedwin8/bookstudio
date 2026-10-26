import type { Hecho } from '@/types/api';

/** "1 h 24 min", "7 min", "menos de 1 min". */
export function duracion(segundos: number): string {
  if (segundos < 60) return 'menos de 1 min';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Desde cuando se cuenta lo realizado; las sesiones anteriores solo tienen el tiempo. */
const DESDE = '2026-10-26';

/**
 * Lo realizado en una frase: "3 elementos nuevos · 12 cambios · 1 página nueva".
 * Con la fecha de la sesion, una anterior al recuento no se da por "sin cambios".
 */
export function resumenHecho(h: Hecho | undefined, inicio?: string): string {
  if (!h) return '—';
  const partes = [
    h.elementsCreated && plural(h.elementsCreated, 'elemento nuevo', 'elementos nuevos'),
    h.elementsEdited && plural(h.elementsEdited, 'cambio', 'cambios'),
    h.elementsDeleted && plural(h.elementsDeleted, 'elemento borrado', 'elementos borrados'),
    h.pagesAdded && plural(h.pagesAdded, 'página nueva', 'páginas nuevas'),
    h.pagesDeleted && plural(h.pagesDeleted, 'página borrada', 'páginas borradas'),
  ].filter(Boolean);
  if (partes.length) return partes.join(' · ');
  return inicio && inicio < DESDE ? 'Sin detalle (antes del 26-10-2026)' : 'Solo lo miró, sin cambios';
}
