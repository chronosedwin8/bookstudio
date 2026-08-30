/**
 * Catalogo de formas. La geometria se define en una caja de 0-100 y el lienzo la
 * estira con preserveAspectRatio="none", asi que la forma se adapta al recuadro
 * que dibuje el usuario. El enum debe coincidir con canvas.schemas.ts del backend.
 */

/** Primitiva SVG; `component :is` permite renderizarlas con un unico v-for. */
export type ShapePrimitive =
  | { el: 'rect' }
  | { el: 'ellipse' }
  | { el: 'polygon'; points: string }
  | { el: 'polyline'; points: string }
  | { el: 'path'; d: string }
  | { el: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { el: 'circle'; cx: number; cy: number; r: number };

export interface ShapeDefinition {
  label: string;
  primitives: ShapePrimitive[];
  /**
   * Proporcion ancho/alto sugerida al insertarla. 1 = cuadrada. Sin esto, un
   * "cuadrado" sale rectangular: el ancho va en % del ancho de pagina y el alto
   * en % del alto, que no miden lo mismo.
   */
  ratio?: number;
  /** Se dibuja solo con trazo: el relleno no aplica (lineas y flechas finas). */
  strokeOnly?: boolean;
  /** Linea discontinua. */
  dashed?: boolean;
}

/** Puntos de una estrella o rafaga de n puntas dentro de la caja 0-100. */
function starPoints(points: number, outer: number, inner: number): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    // -90 grados para que la primera punta apunte hacia arriba.
    const angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${(50 + radius * Math.cos(angle)).toFixed(1)},${(50 + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return coords.join(' ');
}

/** Poligono regular de n lados. */
function polygonPoints(sides: number, rotation = -Math.PI / 2, radius = 47): string {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (2 * Math.PI * i) / sides + rotation;
    return `${(50 + radius * Math.cos(angle)).toFixed(1)},${(50 + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/** Flecha fina: linea mas punta rellena. */
const thinArrow = (): ShapePrimitive[] => [
  { el: 'line', x1: 3, y1: 50, x2: 82, y2: 50 },
  { el: 'polygon', points: '82,38 98,50 82,62' },
];

const CATALOGUE = {
  // --- Basicas ---
  rectangle: { label: 'Rectangulo', primitives: [{ el: 'rect' }], ratio: 1.5 },
  square: { label: 'Cuadrado', primitives: [{ el: 'rect' }], ratio: 1 },
  ellipse: { label: 'Circulo', primitives: [{ el: 'ellipse' }], ratio: 1 },
  oval: { label: 'Ovalo', primitives: [{ el: 'ellipse' }], ratio: 1.6 },
  triangle: { label: 'Triangulo', primitives: [{ el: 'polygon', points: '50,4 96,96 4,96' }] },
  'right-triangle': { label: 'Triangulo rectangulo', primitives: [{ el: 'polygon', points: '5,4 5,96 96,96' }] },
  diamond: { label: 'Rombo', primitives: [{ el: 'polygon', points: '50,3 97,50 50,97 3,50' }] },
  pentagon: { label: 'Pentagono', primitives: [{ el: 'polygon', points: polygonPoints(5) }] },
  hexagon: { label: 'Hexagono', primitives: [{ el: 'polygon', points: polygonPoints(6, 0) }] },
  octagon: { label: 'Octogono', primitives: [{ el: 'polygon', points: polygonPoints(8, Math.PI / 8) }] },

  // --- Lineas y flechas ---
  line: { ratio: 4, label: 'Linea', primitives: [{ el: 'line', x1: 3, y1: 50, x2: 97, y2: 50 }], strokeOnly: true },
  'dashed-line': {
    ratio: 4,
    label: 'Linea de puntos',
    primitives: [{ el: 'line', x1: 3, y1: 50, x2: 97, y2: 50 }],
    strokeOnly: true,
    dashed: true,
  },
  arrow: {
    label: 'Flecha gruesa',
    primitives: [{ el: 'polygon', points: '2,35 62,35 62,10 98,50 62,90 62,65 2,65' }],
  },
  'arrow-line': { label: 'Flecha fina', primitives: thinArrow(), strokeOnly: true },
  'dashed-arrow': { label: 'Flecha de puntos', primitives: thinArrow(), strokeOnly: true, dashed: true },
  'double-arrow': {
    ratio: 3,
    label: 'Flecha doble',
    primitives: [
      { el: 'line', x1: 18, y1: 50, x2: 82, y2: 50 },
      { el: 'polygon', points: '18,38 2,50 18,62' },
      { el: 'polygon', points: '82,38 98,50 82,62' },
    ],
    strokeOnly: true,
  },
  chevron: { label: 'Galon', primitives: [{ el: 'polygon', points: '3,8 45,8 82,50 45,92 3,92 40,50' }] },

  // --- Bocadillos ---
  'speech-bubble': {
    label: 'Bocadillo',
    primitives: [{ el: 'path', d: 'M6,6 H94 V70 H40 L22,94 V70 H6 Z' }],
  },
  'thought-bubble': {
    label: 'Bocadillo de pensamiento',
    primitives: [
      { el: 'path', d: 'M50,6 C74,6 94,19 94,38 C94,57 74,68 50,68 C26,68 6,57 6,38 C6,19 26,6 50,6 Z' },
      { el: 'circle', cx: 32, cy: 80, r: 8 },
      { el: 'circle', cx: 18, cy: 93, r: 5 },
    ],
  },

  // --- Decorativas ---
  star: { label: 'Estrella', primitives: [{ el: 'polygon', points: starPoints(5, 47, 20) }] },
  burst: { label: 'Rafaga', primitives: [{ el: 'polygon', points: starPoints(12, 48, 34) }] },
  heart: {
    label: 'Corazon',
    primitives: [
      {
        el: 'path',
        d: 'M50,92 C20,72 4,52 4,34 C4,18 16,8 29,8 C39,8 46,14 50,22 C54,14 61,8 71,8 C84,8 96,18 96,34 C96,52 80,72 50,92 Z',
      },
    ],
  },
  cloud: {
    label: 'Nube',
    primitives: [
      {
        el: 'path',
        d: 'M25,80 C11,80 3,69 3,57 C3,45 12,37 23,37 C25,23 37,13 51,13 C65,13 76,23 79,36 C90,37 97,46 97,57 C97,69 88,80 75,80 Z',
      },
    ],
  },
  moon: { label: 'Luna', primitives: [{ el: 'path', d: 'M64,4 A48,48 0 1 0 64,96 A38,38 0 1 1 64,4 Z' }] },
  lightning: { label: 'Rayo', primitives: [{ el: 'polygon', points: '58,3 22,55 45,55 38,97 78,42 54,42' }] },
  cross: {
    label: 'Cruz',
    primitives: [{ el: 'polygon', points: '35,3 65,3 65,35 97,35 97,65 65,65 65,97 35,97 35,65 3,65 3,35 35,35' }],
  },
  banner: { label: 'Banderin', primitives: [{ el: 'path', d: 'M8,10 H92 V90 L50,68 L8,90 Z' }] },
  bookmark: { label: 'Marcador', primitives: [{ el: 'polygon', points: '22,3 78,3 78,97 50,74 22,97' }] },
} satisfies Record<string, ShapeDefinition>;

export type ShapeName = keyof typeof CATALOGUE;

/**
 * `satisfies` conserva las claves literales pero estrecha los valores, y entonces
 * las formas sin `strokeOnly` no declaran la propiedad. El tipado explicito la
 * recupera para quien consuma el catalogo.
 */
export const SHAPES: Record<ShapeName, ShapeDefinition> = CATALOGUE;

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** Agrupacion mostrada en el selector de formas. */
export const SHAPE_GROUPS: Array<{ label: string; shapes: ShapeName[] }> = [
  {
    label: 'Basicas',
    shapes: [
      'rectangle', 'square', 'ellipse', 'oval', 'triangle', 'right-triangle',
      'diamond', 'pentagon', 'hexagon', 'octagon',
    ],
  },
  {
    label: 'Lineas y flechas',
    shapes: ['line', 'dashed-line', 'arrow', 'arrow-line', 'dashed-arrow', 'double-arrow', 'chevron'],
  },
  { label: 'Bocadillos', shapes: ['speech-bubble', 'thought-bubble'] },
  {
    label: 'Decorativas',
    shapes: ['star', 'burst', 'heart', 'cloud', 'moon', 'lightning', 'cross', 'banner', 'bookmark'],
  },
];

/** Proporcion ancho/alto con la que insertar una forma; 1.5 si no declara otra. */
export function ratioOf(name: ShapeName): number {
  return SHAPES[name].ratio ?? 1.5;
}
