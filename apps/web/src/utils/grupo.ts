import type { CanvasElement, TransformMatrix } from '@/types/api';

/**
 * Escalar varios elementos a la vez, como un solo objeto.
 *
 * Se estira la caja que los envuelve a todos desde un punto fijo (la esquina o
 * el lado contrario al que se arrastra) y cada elemento se recoloca y reescala
 * en la misma proporcion. Asi crecen "parejos": las distancias entre ellos y sus
 * tamanos relativos se conservan.
 */
export interface Escala {
  /** Punto que no se mueve, en % de pagina. */
  ax: number;
  ay: number;
  sx: number;
  sy: number;
}

const redondear = (v: number) => Math.round(v * 100) / 100;
const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La caja que envuelve a todos (sin contar el giro de cada uno). */
export function cajaDe(elementos: CanvasElement[]): { x: number; y: number; width: number; height: number } | null {
  if (!elementos.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const { transformMatrix: t } of elementos) {
    x1 = Math.min(x1, t.x);
    y1 = Math.min(y1, t.y);
    x2 = Math.max(x2, t.x + t.width);
    y2 = Math.max(y2, t.y + t.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function escalarCaja(t: TransformMatrix, e: Escala): TransformMatrix {
  return {
    ...t,
    x: redondear(entre(e.ax + (t.x - e.ax) * e.sx, -50, 150)),
    y: redondear(entre(e.ay + (t.y - e.ay) * e.sy, -50, 150)),
    width: redondear(entre(t.width * e.sx, 0.5, 200)),
    height: redondear(entre(t.height * e.sy, 0.5, 200)),
  };
}

/**
 * La letra crece con su caja cuando el escalado es proporcional (esquinas); al
 * estirar por un lado no, porque se deformaria. Devuelve null si no cambia.
 */
export function escalarLetra(el: CanvasElement, s: number): Record<string, unknown> | null {
  const p = el.properties as Record<string, unknown>;
  const cambiar = (clave: string, min: number, max: number, entero: boolean) => {
    const actual = Number(p[clave]);
    if (!Number.isFinite(actual)) return null;
    const nuevo = entre(entero ? Math.round(actual * s) : redondear(actual * s), min, max);
    return nuevo === actual ? null : { ...p, [clave]: nuevo };
  };
  if (el.type === 'text') return cambiar('fontSize', 24, 200, true);
  if (el.type === 'table') return cambiar('fontSize', 8, 48, false);
  if (el.type === 'shape' && p.text) return cambiar('textSize', 2, 40, false);
  return null;
}
