/**
 * Catalogo de formas. La geometria se define en una caja de 0-100 y el lienzo la
 * estira con preserveAspectRatio="none", asi que la forma se adapta al recuadro
 * que dibuje el usuario. El enum debe coincidir con canvas.schemas.ts del backend.
 */

/**
 * Tono de una cara respecto al color elegido: 1 lo deja igual, 0.7 lo oscurece,
 * 1.25 lo aclara.
 *
 * Existe por las figuras en 3D. Un cubo con todas las caras del mismo color no
 * se lee como un cubo, se lee como un hexagono con rayas dentro. Con esto se
 * dibujan las tres caras con el mismo color del usuario y distinta luz, que es
 * como se representa el volumen de toda la vida. Tambien sirve para el tejado de
 * una casa o la tapa de un cilindro.
 */
export type Tono = number;

/** Primitiva SVG; `component :is` permite renderizarlas con un unico v-for. */
export type ShapePrimitive =
  | { el: 'rect'; tono?: Tono }
  | { el: 'ellipse'; tono?: Tono }
  | { el: 'polygon'; points: string; tono?: Tono }
  | { el: 'polyline'; points: string; tono?: Tono }
  | { el: 'path'; d: string; tono?: Tono; sinRelleno?: boolean }
  | { el: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { el: 'circle'; cx: number; cy: number; r: number; tono?: Tono };

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

  // --- Diagramas de flujo ---
  //
  // Las de siempre, con la forma que significa cada cosa: un rombo es una
  // decision y un romboide es una entrada de datos. Se dibujan un poco metidas
  // hacia dentro para que el trazo no se coma en el borde de la caja.
  'flujo-proceso': { label: 'Proceso', primitives: [{ el: 'path', d: 'M4,10 H96 V90 H4 Z' }], ratio: 1.7 },
  'flujo-subproceso': {
    label: 'Subproceso',
    primitives: [
      { el: 'path', d: 'M4,10 H96 V90 H4 Z' },
      { el: 'line', x1: 16, y1: 10, x2: 16, y2: 90 },
      { el: 'line', x1: 84, y1: 10, x2: 84, y2: 90 },
    ],
    ratio: 1.7,
  },
  'flujo-decision': { label: 'Decision', primitives: [{ el: 'polygon', points: '50,4 96,50 50,96 4,50' }], ratio: 1.4 },
  'flujo-inicio': {
    label: 'Inicio / Fin',
    primitives: [{ el: 'path', d: 'M22,8 H78 A42,42 0 0 1 78,92 H22 A42,42 0 0 1 22,8 Z' }],
    ratio: 2,
  },
  'flujo-datos': { label: 'Datos', primitives: [{ el: 'polygon', points: '22,10 98,10 78,90 2,90' }], ratio: 1.8 },
  'flujo-documento': {
    label: 'Documento',
    primitives: [{ el: 'path', d: 'M5,10 H95 V74 C79,92 63,60 50,72 C37,84 21,62 5,74 Z' }],
    ratio: 1.5,
  },
  'flujo-multidocumento': {
    label: 'Varios documentos',
    primitives: [
      { el: 'path', d: 'M18,4 H96 V60 H18 Z', tono: 0.82 },
      { el: 'path', d: 'M11,14 H89 V70 H11 Z', tono: 0.91 },
      { el: 'path', d: 'M4,24 H82 V78 C68,94 54,66 43,77 C32,88 18,68 4,78 Z' },
    ],
    ratio: 1.5,
  },
  'flujo-base-datos': {
    label: 'Base de datos',
    primitives: [
      { el: 'path', d: 'M12,18 V82 C12,90 88,90 88,82 V18 Z' },
      // Elipse dibujada a mano: la primitiva `ellipse` llena la caja entera y
      // taparia el cilindro con un circulo.
      { el: 'path', d: 'M12,18 A38,12 0 1 0 88,18 A38,12 0 1 0 12,18 Z', tono: 1.25 },
      { el: 'path', d: 'M12,34 A38,12 0 0 0 88,34', sinRelleno: true },
    ],
    ratio: 1,
  },
  'flujo-almacenamiento': {
    label: 'Almacenamiento',
    primitives: [{ el: 'path', d: 'M20,8 H96 C84,30 84,70 96,92 H20 C8,70 8,30 20,8 Z' }],
    ratio: 1.5,
  },
  'flujo-entrada-manual': {
    label: 'Entrada manual',
    primitives: [{ el: 'polygon', points: '6,28 94,8 94,92 6,92' }],
    ratio: 1.6,
  },
  'flujo-operacion-manual': {
    label: 'Operacion manual',
    primitives: [{ el: 'polygon', points: '6,10 94,10 78,90 22,90' }],
    ratio: 1.6,
  },
  'flujo-preparacion': {
    label: 'Preparacion',
    primitives: [{ el: 'polygon', points: '22,8 78,8 98,50 78,92 22,92 2,50' }],
    ratio: 1.8,
  },
  'flujo-pantalla': {
    label: 'Presentacion',
    primitives: [{ el: 'path', d: 'M20,8 H84 L98,50 L84,92 H20 C4,74 4,26 20,8 Z' }],
    ratio: 1.7,
  },
  'flujo-retardo': { label: 'Retardo', primitives: [{ el: 'path', d: 'M6,10 H56 A42,40 0 0 1 56,90 H6 Z' }], ratio: 1.6 },
  'flujo-conector': { label: 'Conector', primitives: [{ el: 'circle', cx: 50, cy: 50, r: 44 }], ratio: 1 },
  'flujo-fuera-pagina': {
    label: 'Fuera de pagina',
    primitives: [{ el: 'polygon', points: '6,8 94,8 94,60 50,94 6,60' }],
    ratio: 1.1,
  },

  // --- Dispositivos de computo ---
  'disp-monitor': {
    label: 'Monitor',
    primitives: [
      { el: 'path', d: 'M4,8 H96 V66 H4 Z' },
      { el: 'path', d: 'M12,16 H88 V58 H12 Z', tono: 1.35 },
      { el: 'polygon', points: '42,66 58,66 62,84 38,84', tono: 0.8 },
      { el: 'path', d: 'M26,84 H74 V94 H26 Z', tono: 0.8 },
    ],
    ratio: 1.3,
  },
  'disp-portatil': {
    label: 'Portatil',
    primitives: [
      { el: 'path', d: 'M16,10 H84 V62 H16 Z' },
      { el: 'path', d: 'M22,17 H78 V55 H22 Z', tono: 1.35 },
      { el: 'polygon', points: '6,62 94,62 100,82 0,82', tono: 0.85 },
      { el: 'path', d: 'M0,82 H100 V88 H0 Z', tono: 0.7 },
    ],
    ratio: 1.5,
  },
  'disp-tablet': {
    label: 'Tablet',
    primitives: [
      { el: 'path', d: 'M14,4 H86 A8,10 0 0 1 94,14 V86 A8,10 0 0 1 86,96 H14 A8,10 0 0 1 6,86 V14 A8,10 0 0 1 14,4 Z' },
      { el: 'path', d: 'M14,14 H86 V80 H14 Z', tono: 1.35 },
    ],
    ratio: 0.78,
  },
  'disp-movil': {
    label: 'Movil',
    primitives: [
      { el: 'path', d: 'M22,3 H78 A8,7 0 0 1 86,10 V90 A8,7 0 0 1 78,97 H22 A8,7 0 0 1 14,90 V10 A8,7 0 0 1 22,3 Z' },
      { el: 'path', d: 'M22,14 H78 V82 H22 Z', tono: 1.35 },
      { el: 'circle', cx: 50, cy: 90, r: 3.4, tono: 1.35 },
    ],
    ratio: 0.52,
  },
  'disp-torre': {
    label: 'Torre',
    primitives: [
      { el: 'path', d: 'M18,4 H82 V96 H18 Z' },
      { el: 'path', d: 'M28,14 H72 V24 H28 Z', tono: 1.35 },
      { el: 'path', d: 'M28,32 H72 V38 H28 Z', tono: 0.75 },
      { el: 'circle', cx: 34, cy: 82, r: 6, tono: 1.35 },
    ],
    ratio: 0.55,
  },
  'disp-teclado': {
    label: 'Teclado',
    primitives: [
      { el: 'path', d: 'M3,24 H97 A6,8 0 0 1 97,76 H3 A6,8 0 0 1 3,24 Z' },
      { el: 'line', x1: 14, y1: 40, x2: 86, y2: 40 },
      { el: 'line', x1: 14, y1: 52, x2: 86, y2: 52 },
      { el: 'path', d: 'M30,62 H70 V70 H30 Z', tono: 1.35 },
    ],
    ratio: 2.6,
  },
  'disp-raton': {
    label: 'Raton',
    primitives: [
      { el: 'path', d: 'M50,4 C76,4 88,24 88,52 C88,80 74,96 50,96 C26,96 12,80 12,52 C12,24 24,4 50,4 Z' },
      { el: 'line', x1: 50, y1: 8, x2: 50, y2: 40 },
      { el: 'path', d: 'M44,16 H56 V32 H44 Z', tono: 1.35 },
    ],
    ratio: 0.62,
  },
  'disp-impresora': {
    label: 'Impresora',
    primitives: [
      { el: 'path', d: 'M22,4 H78 V26 H22 Z', tono: 1.3 },
      { el: 'path', d: 'M6,26 H94 V66 H6 Z' },
      { el: 'path', d: 'M22,58 H78 V96 H22 Z', tono: 1.3 },
      { el: 'circle', cx: 82, cy: 38, r: 4, tono: 0.7 },
    ],
    ratio: 1.2,
  },
  'disp-servidor': {
    label: 'Servidor',
    primitives: [
      { el: 'path', d: 'M12,4 H88 V96 H12 Z' },
      { el: 'line', x1: 12, y1: 35, x2: 88, y2: 35 },
      { el: 'line', x1: 12, y1: 66, x2: 88, y2: 66 },
      { el: 'circle', cx: 24, cy: 19, r: 4, tono: 1.4 },
      { el: 'circle', cx: 24, cy: 50, r: 4, tono: 1.4 },
      { el: 'circle', cx: 24, cy: 81, r: 4, tono: 1.4 },
    ],
    ratio: 0.62,
  },
  'disp-disco': {
    label: 'Disco duro',
    primitives: [
      { el: 'path', d: 'M6,20 H94 V80 H6 Z' },
      { el: 'circle', cx: 44, cy: 50, r: 22, tono: 1.35 },
      { el: 'circle', cx: 44, cy: 50, r: 6, tono: 0.75 },
    ],
    ratio: 1.4,
  },
  'disp-usb': {
    label: 'Memoria USB',
    primitives: [
      { el: 'path', d: 'M4,32 H62 V68 H4 Z' },
      { el: 'path', d: 'M62,38 H96 V62 H62 Z', tono: 1.3 },
      { el: 'path', d: 'M14,42 H30 V58 H14 Z', tono: 1.4 },
    ],
    ratio: 2.4,
  },
  'disp-camara': {
    label: 'Camara web',
    primitives: [
      { el: 'circle', cx: 50, cy: 42, r: 34 },
      { el: 'circle', cx: 50, cy: 42, r: 15, tono: 1.4 },
      { el: 'circle', cx: 50, cy: 42, r: 6, tono: 0.6 },
      { el: 'path', d: 'M30,84 H70 V94 H30 Z', tono: 0.8 },
    ],
    ratio: 1,
  },

  // --- Diagramas de red ---
  'red-router': {
    label: 'Router',
    primitives: [
      { el: 'path', d: 'M6,52 H94 A8,8 0 0 1 94,86 H6 A8,8 0 0 1 6,52 Z' },
      { el: 'line', x1: 30, y1: 52, x2: 20, y2: 12 },
      { el: 'line', x1: 70, y1: 52, x2: 80, y2: 12 },
      { el: 'circle', cx: 30, cy: 69, r: 4, tono: 1.4 },
      { el: 'circle', cx: 50, cy: 69, r: 4, tono: 1.4 },
      { el: 'circle', cx: 70, cy: 69, r: 4, tono: 1.4 },
    ],
    ratio: 1.5,
  },
  'red-switch': {
    label: 'Conmutador',
    primitives: [
      { el: 'path', d: 'M4,28 H96 V72 H4 Z' },
      { el: 'path', d: 'M14,42 H26 V58 H14 Z', tono: 1.4 },
      { el: 'path', d: 'M34,42 H46 V58 H34 Z', tono: 1.4 },
      { el: 'path', d: 'M54,42 H66 V58 H54 Z', tono: 1.4 },
      { el: 'path', d: 'M74,42 H86 V58 H74 Z', tono: 1.4 },
    ],
    ratio: 2.2,
  },
  'red-cortafuegos': {
    label: 'Cortafuegos',
    primitives: [
      { el: 'path', d: 'M4,10 H96 V90 H4 Z' },
      { el: 'line', x1: 4, y1: 36, x2: 96, y2: 36 },
      { el: 'line', x1: 4, y1: 63, x2: 96, y2: 63 },
      { el: 'line', x1: 36, y1: 10, x2: 36, y2: 36 },
      { el: 'line', x1: 64, y1: 36, x2: 64, y2: 63 },
      { el: 'line', x1: 36, y1: 63, x2: 36, y2: 90 },
    ],
    ratio: 1.4,
  },
  'red-wifi': {
    label: 'Wifi',
    primitives: [
      { el: 'path', d: 'M6,42 C30,14 70,14 94,42', sinRelleno: true },
      { el: 'path', d: 'M22,58 C38,42 62,42 78,58', sinRelleno: true },
      { el: 'path', d: 'M36,74 C44,66 56,66 64,74', sinRelleno: true },
      { el: 'circle', cx: 50, cy: 88, r: 6 },
    ],
    strokeOnly: true,
    ratio: 1.4,
  },
  'red-antena': {
    label: 'Antena',
    primitives: [
      { el: 'polygon', points: '50,20 66,92 34,92' },
      { el: 'circle', cx: 50, cy: 14, r: 8, tono: 1.3 },
      { el: 'path', d: 'M24,30 C16,20 16,10 22,2', sinRelleno: true },
      { el: 'path', d: 'M76,30 C84,20 84,10 78,2', sinRelleno: true },
    ],
    ratio: 0.9,
  },
  'red-globo': {
    label: 'Internet',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 45 },
      { el: 'line', x1: 5, y1: 50, x2: 95, y2: 50 },
      { el: 'path', d: 'M50,5 C26,26 26,74 50,95', sinRelleno: true },
      { el: 'path', d: 'M50,5 C74,26 74,74 50,95', sinRelleno: true },
    ],
    ratio: 1,
  },
  'red-escudo': {
    label: 'Seguridad',
    primitives: [
      { el: 'path', d: 'M50,4 L92,18 V50 C92,74 74,90 50,97 C26,90 8,74 8,50 V18 Z' },
      { el: 'path', d: 'M50,18 L78,27 V50 C78,66 66,78 50,84 Z', tono: 1.3 },
    ],
    ratio: 0.85,
  },
  'red-enlace': {
    label: 'Enlace',
    primitives: [
      { el: 'path', d: 'M40,26 H22 A24,24 0 0 0 22,74 H40', sinRelleno: true },
      { el: 'path', d: 'M60,26 H78 A24,24 0 0 1 78,74 H60', sinRelleno: true },
      { el: 'line', x1: 32, y1: 50, x2: 68, y2: 50 },
    ],
    strokeOnly: true,
    ratio: 1.6,
  },

  // --- Mapas mentales ---
  'mental-central': {
    label: 'Idea central',
    primitives: [
      { el: 'ellipse' },
      { el: 'circle', cx: 50, cy: 50, r: 38, tono: 1.3 },
    ],
    ratio: 1.7,
  },
  'mental-nodo': {
    label: 'Nodo',
    primitives: [{ el: 'path', d: 'M16,18 H84 A18,32 0 0 1 84,82 H16 A18,32 0 0 1 16,18 Z' }],
    ratio: 2.2,
  },
  'mental-rama': {
    label: 'Rama',
    primitives: [{ el: 'path', d: 'M4,90 C34,90 42,18 96,10', sinRelleno: true }],
    strokeOnly: true,
    ratio: 1.8,
  },
  'mental-rama-punteada': {
    label: 'Rama punteada',
    primitives: [{ el: 'path', d: 'M4,90 C34,90 42,18 96,10', sinRelleno: true }],
    strokeOnly: true,
    dashed: true,
    ratio: 1.8,
  },

  // --- Figuras en 3D ---
  //
  // Cada cara lleva el mismo color con distinta luz. Sin eso un cubo parece un
  // hexagono con rayas: el volumen se lee por el contraste entre caras, no por
  // las lineas.
  cubo: {
    label: 'Cubo',
    primitives: [
      { el: 'polygon', points: '50,6 94,28 50,50 6,28', tono: 1.28 },
      { el: 'polygon', points: '6,28 50,50 50,94 6,72' },
      { el: 'polygon', points: '94,28 50,50 50,94 94,72', tono: 0.74 },
    ],
    ratio: 1,
  },
  ortoedro: {
    label: 'Ortoedro',
    primitives: [
      { el: 'polygon', points: '6,30 28,10 96,10 74,30', tono: 1.28 },
      { el: 'polygon', points: '6,30 74,30 74,90 6,90' },
      { el: 'polygon', points: '74,30 96,10 96,70 74,90', tono: 0.74 },
    ],
    ratio: 1.5,
  },
  piramide: {
    label: 'Piramide',
    primitives: [
      { el: 'polygon', points: '50,6 6,74 50,96' },
      { el: 'polygon', points: '50,6 50,96 94,74', tono: 0.74 },
    ],
    ratio: 1.1,
  },
  cilindro: {
    label: 'Cilindro',
    primitives: [
      { el: 'path', d: 'M8,20 V80 C8,90 92,90 92,80 V20 Z' },
      { el: 'path', d: 'M8,20 A42,14 0 1 0 92,20 A42,14 0 1 0 8,20 Z', tono: 1.28 },
    ],
    ratio: 0.9,
  },
  cono: {
    label: 'Cono',
    primitives: [{ el: 'path', d: 'M50,4 L91,80 A41,13 0 0 1 9,80 Z' }],
    ratio: 0.95,
  },
  esfera: {
    label: 'Esfera',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      // El brillo arriba a la izquierda: sin el, una esfera es un circulo
      { el: 'path', d: 'M18,36 A18,12 0 1 0 54,36 A18,12 0 1 0 18,36 Z', tono: 1.45 },
    ],
    ratio: 1,
  },
  prisma: {
    label: 'Prisma',
    primitives: [
      { el: 'polygon', points: '22,88 50,28 78,88' },
      { el: 'polygon', points: '50,28 72,12 98,72 78,88', tono: 0.74 },
      { el: 'polygon', points: '22,88 50,28 72,12 44,72', tono: 1.2 },
    ],
    ratio: 1.2,
  },

  // --- Senales ---
  //
  // El simbolo de dentro va en tono 2, que es blanco: es lo que hace que se lea
  // desde lejos, igual que en las senales de verdad.
  'senal-stop': {
    label: 'Stop',
    primitives: [
      { el: 'polygon', points: '31,3 69,3 97,31 97,69 69,97 31,97 3,69 3,31' },
      { el: 'polygon', points: '35,11 65,11 89,35 89,65 65,89 35,89 11,65 11,35', tono: 2 },
      { el: 'polygon', points: '38,16 62,16 84,38 84,62 62,84 38,84 16,62 16,38' },
    ],
    ratio: 1,
  },
  'senal-precaucion': {
    label: 'Precaucion',
    primitives: [
      { el: 'path', d: 'M50,4 L98,92 H2 Z' },
      { el: 'path', d: 'M45,36 H55 L53,66 H47 Z', tono: 2 },
      { el: 'circle', cx: 50, cy: 78, r: 5, tono: 2 },
    ],
    ratio: 1.15,
  },
  'senal-peligro-electrico': {
    label: 'Peligro electrico',
    primitives: [
      { el: 'path', d: 'M50,4 L98,92 H2 Z' },
      { el: 'polygon', points: '56,28 34,62 47,62 42,86 66,50 52,50', tono: 2 },
    ],
    ratio: 1.15,
  },
  'senal-prohibido': {
    label: 'Prohibido',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      { el: 'circle', cx: 50, cy: 50, r: 34, tono: 2 },
      { el: 'polygon', points: '22,32 32,22 78,68 68,78' },
    ],
    ratio: 1,
  },
  'senal-informacion': {
    label: 'Informacion',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      { el: 'circle', cx: 50, cy: 26, r: 6, tono: 2 },
      { el: 'path', d: 'M44,40 H56 V78 H44 Z', tono: 2 },
    ],
    ratio: 1,
  },
  'senal-correcto': {
    label: 'Correcto',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      { el: 'polygon', points: '24,50 34,40 44,50 68,26 78,36 44,70', tono: 2 },
    ],
    ratio: 1,
  },
  'senal-incorrecto': {
    label: 'Incorrecto',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      { el: 'polygon', points: '30,24 50,44 70,24 76,30 56,50 76,70 70,76 50,56 30,76 24,70 44,50 24,30', tono: 2 },
    ],
    ratio: 1,
  },

  // --- Clipart ---
  'clip-sol': {
    label: 'Sol',
    primitives: [
      { el: 'polygon', points: '50,2 58,20 42,20' },
      { el: 'polygon', points: '50,98 42,80 58,80' },
      { el: 'polygon', points: '2,50 20,42 20,58' },
      { el: 'polygon', points: '98,50 80,58 80,42' },
      { el: 'polygon', points: '16,16 30,24 24,30' },
      { el: 'polygon', points: '84,84 70,76 76,70' },
      { el: 'polygon', points: '84,16 76,30 70,24' },
      { el: 'polygon', points: '16,84 24,70 30,76' },
      { el: 'circle', cx: 50, cy: 50, r: 26 },
    ],
    ratio: 1,
  },
  'clip-arbol': {
    label: 'Arbol',
    primitives: [
      { el: 'path', d: 'M44,60 H56 V96 H44 Z', tono: 0.6 },
      { el: 'circle', cx: 50, cy: 30, r: 26 },
      { el: 'circle', cx: 30, cy: 48, r: 19, tono: 0.85 },
      { el: 'circle', cx: 70, cy: 48, r: 19, tono: 1.15 },
    ],
    ratio: 0.85,
  },
  'clip-casa': {
    label: 'Casa',
    primitives: [
      { el: 'polygon', points: '50,6 98,44 2,44', tono: 0.75 },
      { el: 'path', d: 'M12,44 H88 V96 H12 Z' },
      { el: 'path', d: 'M40,64 H60 V96 H40 Z', tono: 0.6 },
      { el: 'path', d: 'M18,54 H32 V68 H18 Z', tono: 1.4 },
    ],
    ratio: 1.1,
  },
  'clip-coche': {
    label: 'Coche',
    primitives: [
      { el: 'path', d: 'M8,58 L22,30 H78 L92,58 V78 H8 Z' },
      { el: 'path', d: 'M28,36 H72 L80,56 H20 Z', tono: 1.4 },
      { el: 'circle', cx: 26, cy: 80, r: 11, tono: 0.5 },
      { el: 'circle', cx: 74, cy: 80, r: 11, tono: 0.5 },
    ],
    ratio: 1.7,
  },
  'clip-libro': {
    label: 'Libro',
    primitives: [
      { el: 'path', d: 'M6,14 C24,8 40,10 50,20 V90 C40,80 24,78 6,84 Z' },
      { el: 'path', d: 'M94,14 C76,8 60,10 50,20 V90 C60,80 76,78 94,84 Z', tono: 1.25 },
      { el: 'line', x1: 50, y1: 20, x2: 50, y2: 90 },
    ],
    ratio: 1.25,
  },
  'clip-bombilla': {
    label: 'Bombilla',
    primitives: [
      { el: 'circle', cx: 50, cy: 38, r: 32 },
      { el: 'path', d: 'M36,66 H64 V78 H36 Z', tono: 0.75 },
      { el: 'path', d: 'M40,82 H60 V94 H40 Z', tono: 0.6 },
    ],
    ratio: 0.75,
  },
  'clip-reloj': {
    label: 'Reloj',
    primitives: [
      { el: 'circle', cx: 50, cy: 50, r: 46 },
      { el: 'circle', cx: 50, cy: 50, r: 37, tono: 2 },
      { el: 'line', x1: 50, y1: 50, x2: 50, y2: 24 },
      { el: 'line', x1: 50, y1: 50, x2: 72, y2: 58 },
    ],
    ratio: 1,
  },
  'clip-hoja': {
    label: 'Hoja',
    primitives: [
      { el: 'path', d: 'M50,4 C82,20 94,52 78,76 C64,96 34,96 20,76 C4,52 18,20 50,4 Z' },
      { el: 'line', x1: 50, y1: 12, x2: 50, y2: 92 },
    ],
    ratio: 0.85,
  },
  'clip-gota': {
    label: 'Gota',
    primitives: [{ el: 'path', d: 'M50,4 C74,34 88,52 88,66 C88,84 71,96 50,96 C29,96 12,84 12,66 C12,52 26,34 50,4 Z' }],
    ratio: 0.8,
  },
  'clip-bandera': {
    label: 'Bandera',
    primitives: [
      { el: 'path', d: 'M14,8 H92 L74,34 L92,60 H14 Z' },
      { el: 'line', x1: 10, y1: 6, x2: 10, y2: 96 },
    ],
    ratio: 1.2,
  },
  'clip-lapiz': {
    label: 'Lapiz',
    primitives: [
      { el: 'polygon', points: '18,6 82,6 82,68 50,96 18,68' },
      { el: 'polygon', points: '18,68 82,68 50,96', tono: 0.6 },
      { el: 'path', d: 'M18,6 H82 V22 H18 Z', tono: 1.35 },
    ],
    ratio: 0.55,
  },
  'clip-cohete': {
    label: 'Cohete',
    primitives: [
      { el: 'path', d: 'M50,2 C70,22 74,48 74,68 H26 C26,48 30,22 50,2 Z' },
      { el: 'polygon', points: '26,52 10,88 26,80', tono: 0.75 },
      { el: 'polygon', points: '74,52 90,88 74,80', tono: 0.75 },
      { el: 'circle', cx: 50, cy: 36, r: 11, tono: 2 },
      { el: 'polygon', points: '38,68 62,68 50,98', tono: 1.35 },
    ],
    ratio: 0.7,
  },
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
  {
    label: 'Diagramas de flujo',
    shapes: [
      'flujo-inicio', 'flujo-proceso', 'flujo-subproceso', 'flujo-decision', 'flujo-datos',
      'flujo-entrada-manual', 'flujo-operacion-manual', 'flujo-preparacion', 'flujo-documento',
      'flujo-multidocumento', 'flujo-base-datos', 'flujo-almacenamiento', 'flujo-pantalla',
      'flujo-retardo', 'flujo-conector', 'flujo-fuera-pagina',
    ],
  },
  {
    label: 'Dispositivos',
    shapes: [
      'disp-monitor', 'disp-portatil', 'disp-tablet', 'disp-movil', 'disp-torre',
      'disp-teclado', 'disp-raton', 'disp-impresora', 'disp-servidor', 'disp-disco',
      'disp-usb', 'disp-camara',
    ],
  },
  {
    // La nube de siempre vale igual para una red: no hace falta otra.
    label: 'Redes',
    shapes: [
      'red-router', 'red-switch', 'red-cortafuegos', 'red-wifi', 'red-antena',
      'red-globo', 'red-escudo', 'red-enlace', 'cloud', 'disp-servidor',
    ],
  },
  {
    label: 'Mapas mentales',
    shapes: ['mental-central', 'mental-nodo', 'mental-rama', 'mental-rama-punteada', 'speech-bubble', 'thought-bubble'],
  },
  {
    label: 'Cuerpos en 3D',
    shapes: ['cubo', 'ortoedro', 'piramide', 'prisma', 'cilindro', 'cono', 'esfera'],
  },
  {
    label: 'Senales',
    shapes: [
      'senal-stop', 'senal-precaucion', 'senal-peligro-electrico', 'senal-prohibido',
      'senal-informacion', 'senal-correcto', 'senal-incorrecto',
    ],
  },
  {
    label: 'Clipart',
    shapes: [
      'clip-sol', 'clip-arbol', 'clip-casa', 'clip-coche', 'clip-libro', 'clip-bombilla',
      'clip-reloj', 'clip-hoja', 'clip-gota', 'clip-bandera', 'clip-lapiz', 'clip-cohete',
    ],
  },
];

/** Proporcion ancho/alto con la que insertar una forma; 1.5 si no declara otra. */
export function ratioOf(name: ShapeName): number {
  return SHAPES[name].ratio ?? 1.5;
}
