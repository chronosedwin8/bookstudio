import type { BrushStyle } from '@/stores/preferences';

export interface Point {
  x: number;
  y: number;
  /** Presion del lapiz optico (0-1); 0.5 cuando el dispositivo no la reporta. */
  pressure: number;
}

/** Lienzo de coordenadas del trazo; el SVG se reescala luego sin perder definicion. */
export const STROKE_VIEWBOX_SIZE = 1000;

export interface BrushPreset {
  label: string;
  icon: string;
  /** Multiplicador sobre el grosor elegido por el usuario. */
  widthFactor: number;
  opacity: number;
  linecap: 'round' | 'butt' | 'square';
  /** Repeticiones desplazadas que simulan cerdas o textura porosa. */
  passes: number;
  jitter: number;
  dash?: string;
}

export const BRUSH_PRESETS: Record<BrushStyle, BrushPreset> = {
  pen: { label: 'Pluma', icon: '🖊️', widthFactor: 1, opacity: 1, linecap: 'round', passes: 1, jitter: 0 },
  paintbrush: { label: 'Pincel', icon: '🖌️', widthFactor: 1.8, opacity: 0.85, linecap: 'round', passes: 3, jitter: 1.4 },
  crayon: { label: 'Crayon', icon: '🖍️', widthFactor: 1.4, opacity: 0.7, linecap: 'butt', passes: 2, jitter: 2.2, dash: '5 3' },
  highlighter: { label: 'Marcador', icon: '🖊', widthFactor: 3.2, opacity: 0.35, linecap: 'square', passes: 1, jitter: 0 },
};

/** Descarta puntos casi solapados para no inflar el path. */
export function simplify(points: Point[], tolerance = 2): Point[] {
  if (points.length < 3) return points;
  const result: Point[] = [points[0]];
  for (const point of points.slice(1, -1)) {
    const last = result[result.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= tolerance) result.push(point);
  }
  result.push(points[points.length - 1]);
  return result;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Curva de Catmull-Rom aproximada con cuadraticas entre puntos medios. */
export function toSvgPath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length === 1) {
    const { x, y } = points[0];
    return `M ${round(x)} ${round(y)} l 0.1 0`;
  }
  if (points.length === 2) {
    return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[1].x)} ${round(points[1].y)}`;
  }

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    path += ` Q ${round(points[i].x)} ${round(points[i].y)} ${round(midX)} ${round(midY)}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${round(last.x)} ${round(last.y)}`;
}

/** Desplaza el trazo de forma determinista para simular cerdas sin aleatoriedad por render. */
export function offsetPath(points: Point[], amount: number, seed: number): string {
  if (!amount) return toSvgPath(points);
  return toSvgPath(
    points.map((p, i) => ({
      ...p,
      x: p.x + Math.sin(i * 0.7 + seed * 2.3) * amount,
      y: p.y + Math.cos(i * 0.9 + seed * 1.7) * amount,
    })),
  );
}

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Point[], padding: number): StrokeBounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - padding,
    minY: Math.min(...ys) - padding,
    maxX: Math.max(...xs) + padding,
    maxY: Math.max(...ys) + padding,
  };
}
