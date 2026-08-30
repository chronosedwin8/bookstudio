/**
 * Reconocimiento de trazo a mano alzada, en el navegador.
 *
 * Implementa el reconocedor "$1 Unistroke" (Wobbrock, Wilson y Li, 2007; codigo de
 * referencia en dominio publico): remuestrea el trazo a N puntos, lo rota al angulo
 * indicativo, lo escala a un cuadrado y busca la plantilla mas parecida por distancia
 * media entre puntos.
 *
 * Se hace en local a proposito: AutoDraw no tiene API publica y usar su endpoint
 * interno mandaria cada dibujo del alumnado a un servicio externo no documentado.
 */
import type { ShapeName } from './shapes';

export interface Point {
  x: number;
  y: number;
}

export interface Candidate {
  /** Forma del catalogo a la que se puede convertir el trazo. */
  shape: ShapeName;
  /** Iconos sugeridos para ese trazo, por nombre en el catalogo de Lucide. */
  icons: string[];
  label: string;
  /** 0-1; por encima de MIN_SCORE se considera un acierto. */
  score: number;
}

const SAMPLE_SIZE = 64;
const SQUARE_SIZE = 250;
const HALF_DIAGONAL = 0.5 * Math.sqrt(SQUARE_SIZE ** 2 + SQUARE_SIZE ** 2);
/**
 * El $1 original rota cada trazo a su "angulo indicativo" y busca en +-45 grados,
 * lo que lo vuelve invariante a la rotacion: util para gestos, nefasto para formas,
 * porque un cuadrado y un rombo pasan a ser el mismo dibujo girado 45 grados. Aqui
 * la orientacion es informacion, no ruido, asi que no se rota al angulo indicativo
 * y el margen se reduce a lo que da de si un pulso humano.
 */
const ANGLE_RANGE = (22 * Math.PI) / 180;
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));

/** Por debajo de esto no se propone nada: mas vale callar que sugerir un disparate. */
export const MIN_SCORE = 0.72;

// --- Geometria basica ---

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function boundingBox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Reparte N puntos equidistantes a lo largo del trazo. */
function resample(points: Point[], n: number): Point[] {
  const interval = pathLength(points) / (n - 1);
  if (!Number.isFinite(interval) || interval <= 0) return points.slice(0, n);

  const output: Point[] = [points[0]];
  let accumulated = 0;
  const working = [...points];

  for (let i = 1; i < working.length; i += 1) {
    const segment = distance(working[i - 1], working[i]);
    if (accumulated + segment >= interval) {
      const ratio = (interval - accumulated) / segment;
      const next = {
        x: working[i - 1].x + ratio * (working[i].x - working[i - 1].x),
        y: working[i - 1].y + ratio * (working[i].y - working[i - 1].y),
      };
      output.push(next);
      working.splice(i, 0, next);
      accumulated = 0;
    } else {
      accumulated += segment;
    }
  }

  // El redondeo puede dejar el ultimo punto fuera.
  while (output.length < n) output.push(points[points.length - 1]);
  return output.slice(0, n);
}

function rotateBy(points: Point[], radians: number): Point[] {
  const c = centroid(points);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function scaleToSquare(points: Point[], size: number): Point[] {
  const box = boundingBox(points);
  return points.map((p) => ({
    x: p.x * (size / (box.width || 1)),
    y: p.y * (size / (box.height || 1)),
  }));
}

function translateToOrigin(points: Point[]): Point[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

/**
 * Proporcion de la caja envolvente que cubre el trazo (formula del area de Gauss).
 * Es lo que separa de verdad un rectangulo (~1.0) de una elipse (~0.79), de un
 * triangulo (~0.5) o de una linea (~0): la distancia punto a punto sola los empata.
 */
function areaRatio(points: Point[]): number {
  const box = boundingBox(points);
  const boxArea = box.width * box.height;
  if (boxArea <= 0) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.min(1, Math.abs(area / 2) / boxArea);
}

function pathDistance(a: Point[], b: Point[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += distance(a[i], b[i]);
  return total / a.length;
}

function distanceAtAngle(points: Point[], template: Point[], radians: number): number {
  return pathDistance(rotateBy(points, radians), template);
}

/** Busqueda de la seccion aurea sobre el angulo, como en el articulo original. */
function distanceAtBestAngle(points: Point[], template: Point[]): number {
  let low = -ANGLE_RANGE;
  let high = ANGLE_RANGE;
  let x1 = PHI * low + (1 - PHI) * high;
  let f1 = distanceAtAngle(points, template, x1);
  let x2 = (1 - PHI) * low + PHI * high;
  let f2 = distanceAtAngle(points, template, x2);

  while (Math.abs(high - low) > ANGLE_PRECISION) {
    if (f1 < f2) {
      high = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * low + (1 - PHI) * high;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      low = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * low + PHI * high;
      f2 = distanceAtAngle(points, template, x2);
    }
  }
  return Math.min(f1, f2);
}

/**
 * Normaliza un trazo para compararlo con las plantillas.
 *
 * Se escala ANTES de remuestrear a proposito. Al reves, un rectangulo alargado
 * acumula casi todos sus puntos en los dos lados largos y, tras estirarlo a un
 * cuadrado, esa densidad desigual ya no casa con la plantilla cuadrada.
 */
function normalize(points: Point[]): Point[] {
  return translateToOrigin(resample(scaleToSquare(points, SQUARE_SIZE), SAMPLE_SIZE));
}

// --- Plantillas ---

/** Genera los puntos de un poligono regular cerrado. */
function polygon(sides: number, rotation = -Math.PI / 2): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides + rotation;
    pts.push({ x: 50 + 50 * Math.cos(angle), y: 50 + 50 * Math.sin(angle) });
  }
  return pts;
}

function circlePoints(steps = 32): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / steps;
    return { x: 50 + 50 * Math.cos(angle), y: 50 + 50 * Math.sin(angle) };
  });
}

function starOutline(points: number, outer: number, inner: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    pts.push({ x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) });
  }
  return pts;
}

function fromPolyline(coords: number[][]): Point[] {
  return coords.map(([x, y]) => ({ x, y }));
}

interface Template {
  shape: ShapeName;
  label: string;
  icons: string[];
  points: Point[];
}

/*
 * El bocadillo se deja fuera a proposito: su silueta es un rectangulo con rabito y
 * competia con el rectangulo en cada trazo cuadrado. Se inserta desde la paleta.
 */
const TEMPLATES: Template[] = [
  { shape: 'ellipse', label: 'Circulo', icons: ['circle', 'sun', 'smile'], points: circlePoints() },
  {
    shape: 'rectangle',
    label: 'Rectangulo',
    icons: ['square', 'image', 'book'],
    points: fromPolyline([
      [0, 0], [100, 0], [100, 100], [0, 100], [0, 0],
    ]),
  },
  { shape: 'triangle', label: 'Triangulo', icons: ['triangle', 'tent-tree'], points: polygon(3) },
  { shape: 'diamond', label: 'Rombo', icons: ['diamond', 'gem'], points: polygon(4, 0) },
  { shape: 'pentagon', label: 'Pentagono', icons: ['pentagon'], points: polygon(5) },
  { shape: 'hexagon', label: 'Hexagono', icons: ['hexagon'], points: polygon(6, 0) },
  { shape: 'star', label: 'Estrella', icons: ['star', 'sparkles'], points: starOutline(5, 50, 21) },
  {
    shape: 'line',
    label: 'Linea',
    icons: ['minus'],
    points: fromPolyline([[0, 50], [100, 50]]),
  },
  {
    shape: 'arrow-line',
    label: 'Flecha',
    icons: ['arrow-right', 'move-right'],
    points: fromPolyline([
      [0, 50], [80, 50], [60, 30], [80, 50], [60, 70],
    ]),
  },
  {
    shape: 'heart',
    label: 'Corazon',
    icons: ['heart'],
    points: fromPolyline([
      [50, 95], [18, 65], [5, 42], [12, 20], [32, 12], [50, 28],
      [68, 12], [88, 20], [95, 42], [82, 65], [50, 95],
    ]),
  },
  {
    shape: 'cloud',
    label: 'Nube',
    icons: ['cloud', 'cloud-rain'],
    points: fromPolyline([
      [25, 80], [10, 74], [4, 58], [14, 40], [30, 36], [40, 20],
      [60, 15], [76, 26], [82, 38], [94, 46], [96, 62], [82, 78], [25, 80],
    ]),
  },
  {
    shape: 'lightning',
    label: 'Rayo',
    icons: ['zap'],
    points: fromPolyline([
      [58, 3], [22, 55], [45, 55], [38, 97], [78, 42], [54, 42], [58, 3],
    ]),
  },
  {
    shape: 'moon',
    label: 'Luna',
    icons: ['moon', 'moon-star'],
    points: fromPolyline([
      [66, 6], [40, 14], [22, 36], [22, 64], [40, 86], [66, 94],
      [46, 74], [40, 50], [46, 26], [66, 6],
    ]),
  },
  {
    shape: 'cross',
    label: 'Cruz',
    icons: ['plus', 'cross'],
    points: fromPolyline([
      [35, 3], [65, 3], [65, 35], [97, 35], [97, 65], [65, 65],
      [65, 97], [35, 97], [35, 65], [3, 65], [3, 35], [35, 35], [35, 3],
    ]),
  },
];

/** Siluetas que se pueden trazar empezando por cualquier punto. */
const CLOSED_SHAPES = new Set<ShapeName>([
  'ellipse', 'rectangle', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'star', 'heart', 'cloud', 'lightning', 'moon', 'cross',
]);

/** Numero de puntos de inicio que se prueban en una silueta cerrada. */
const START_OFFSETS = 8;

const reversed = (points: Point[]): Point[] => [...points].reverse();

/** Mueve el punto de partida sin alterar el recorrido. */
const shifted = (points: Point[], offset: number): Point[] => [
  ...points.slice(offset),
  ...points.slice(0, offset),
];

/**
 * El $1 empareja punto a punto en orden, asi que le importa donde empieza el trazo
 * y en que sentido gira: un rombo empezado por arriba no casaba con la plantilla
 * empezada por la derecha. Se precalculan las variantes y se toma la mejor.
 */
function variantsOf(template: Template): Point[][] {
  const base = normalize(template.points);
  const directions = [base, reversed(base)];
  if (!CLOSED_SHAPES.has(template.shape)) return directions;

  const step = Math.max(1, Math.floor(base.length / START_OFFSETS));
  return directions.flatMap((points) =>
    Array.from({ length: START_OFFSETS }, (_, i) => shifted(points, i * step)),
  );
}

const NORMALIZED = TEMPLATES.map((template) => ({
  ...template,
  variants: variantsOf(template),
  areaRatio: areaRatio(normalize(template.points)),
}));

/** Cuanto puede penalizar la diferencia de area; suficiente para deshacer empates. */
const AREA_WEIGHT = 0.45;

/**
 * Devuelve las mejores coincidencias para un trazo, ordenadas por parecido.
 * Un trazo con menos de 8 puntos o sin recorrido no se intenta reconocer.
 */
export function recognize(points: Point[], limit = 3): Candidate[] {
  if (points.length < 8 || pathLength(points) < 24) return [];

  const candidate = normalize(points);
  const candidateArea = areaRatio(candidate);

  return NORMALIZED.map((template) => {
    const d = Math.min(...template.variants.map((v) => distanceAtBestAngle(candidate, v)));
    const shapeScore = Math.max(0, 1 - d / HALF_DIAGONAL);
    const areaPenalty = 1 - AREA_WEIGHT * Math.abs(candidateArea - template.areaRatio);
    return {
      shape: template.shape,
      icons: template.icons,
      label: template.label,
      score: Math.max(0, shapeScore * areaPenalty),
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Caja que ocupa el trazo, en las mismas unidades que los puntos recibidos. */
export function strokeBounds(points: Point[]) {
  return boundingBox(points);
}
