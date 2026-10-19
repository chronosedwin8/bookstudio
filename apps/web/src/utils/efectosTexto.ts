import type { TextEffect } from '@/types/api';

/**
 * Efectos de los rotulos: sombra, neon, contorno...
 *
 * Se guardan por nombre (el servidor solo admite la lista cerrada) y aqui se
 * traducen a CSS. Todo va en `em`: el efecto crece con la letra, y se ve igual en
 * una miniatura que a pantalla completa. El lienzo y la pagina exportada usan esto
 * mismo, para que el libro descargado se vea como en BookStudio.
 */

export const EFECTOS: Array<{ id: TextEffect; label: string }> = [
  { id: 'ninguno', label: 'Ninguno' },
  { id: 'sombra', label: 'Sombra' },
  { id: 'elevado', label: 'Elevado' },
  { id: 'eco', label: 'Eco' },
  { id: 'contorno', label: 'Contorno' },
  { id: 'hueco', label: 'Hueco' },
  { id: 'neon', label: 'Neón' },
  { id: 'resplandor', label: 'Resplandor' },
];

const hex = (c: string | undefined, defecto: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : defecto);

/**
 * Propiedades CSS del efecto (en camelCase, para Vue). `color` es el del texto:
 * el efecto "hueco" lo vacia y lo pasa al contorno.
 */
export function estiloEfecto(effect: TextEffect | undefined, effectColor: string | undefined, color: string): Record<string, string> {
  const c = hex(effectColor, '#000000');
  switch (effect) {
    case 'sombra':
      return { textShadow: `0.05em 0.06em 0.12em ${c}99` };
    case 'elevado':
      return { textShadow: `0.06em 0.06em 0 ${c}` };
    case 'eco':
      return { textShadow: `0.06em 0.06em 0 ${c}99, 0.12em 0.12em 0 ${c}55` };
    case 'contorno':
      return { WebkitTextStroke: `0.035em ${c}`, paintOrder: 'stroke fill' };
    case 'hueco':
      return { color: 'transparent', WebkitTextStroke: `0.03em ${hex(color, '#000000')}` };
    case 'neon':
      return { textShadow: `0 0 0.04em #fff, 0 0 0.12em ${c}, 0 0 0.3em ${c}, 0 0 0.6em ${c}` };
    case 'resplandor':
      return { textShadow: `0 0 0.3em ${c}cc` };
    default:
      return {};
  }
}

/** Lo mismo en una cadena de estilo en linea, para la pagina exportada. */
export function estiloEfectoEnLinea(effect: TextEffect | undefined, effectColor: string | undefined, color: string): string {
  return Object.entries(estiloEfecto(effect, effectColor, color))
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^webkit/, '-webkit')}:${v}`)
    .join(';');
}
