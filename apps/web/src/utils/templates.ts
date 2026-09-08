/**
 * Plantillas de pagina: organizadores graficos, viñetas de comic y tablas.
 *
 * No existe una libreria open source equivalente a la de Book Creator, asi que se
 * generan aqui a partir de los elementos del propio editor (formas, texto e iconos).
 * Al ser codigo del repositorio son 100% abiertas, funcionan sin internet y se
 * pueden traducir o ampliar sin depender de nadie.
 */
import type { ShapeName } from './shapes';

export interface TemplateElement {
  type: 'text' | 'shape' | 'icon';
  transformMatrix: { x: number; y: number; width: number; height: number; angle: number };
  properties: Record<string, unknown>;
}

export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  backgroundColor: string;
  backgroundPattern: string | null;
  elements: TemplateElement[];
}

// --- Constructores ---

const INK = '#334155';
const MUTED = '#94A3B8';

function box(x: number, y: number, width: number, height: number, angle = 0) {
  return { x, y, width, height, angle };
}

/** Titulo grande centrado. */
function heading(label: string, y = 4, size = 44, color = INK): TemplateElement {
  return {
    type: 'text',
    transformMatrix: box(6, y, 88, 10),
    properties: {
      text: label,
      fontFamily: 'Fredoka',
      fontSize: size,
      color,
      textAlign: 'center',
      bold: true,
    },
  };
}

/**
 * Rotulo de una casilla.
 *
 * El tamano nunca baja de 24 px: es el minimo accesible que exige el servidor, y
 * pasarse de listo aqui no hace la plantilla mas bonita, la hace irrecuperable.
 * Ocho plantillas quedaron asi durante meses y al elegirlas se creaba una pagina
 * en blanco.
 */
function label(text: string, x: number, y: number, width: number, height = 6, size = 26): TemplateElement {
  const tamano = Math.max(24, size);
  return {
    type: 'text',
    transformMatrix: box(x, y, width, height),
    properties: { text, fontFamily: 'Nunito', fontSize: tamano, color: INK, textAlign: 'center', bold: true },
  };
}

function writingArea(x: number, y: number, width: number, height: number, hint = ''): TemplateElement {
  return {
    type: 'text',
    transformMatrix: box(x, y, width, height),
    properties: { text: hint, fontFamily: 'Nunito', fontSize: 24, color: MUTED, textAlign: 'left' },
  };
}

function shape(
  name: ShapeName,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = 'transparent',
  stroke = INK,
  strokeWidth = 2,
): TemplateElement {
  return {
    type: 'shape',
    transformMatrix: box(x, y, width, height),
    properties: { shape: name, fillColor: fill, strokeColor: stroke, strokeWidth, label: '' },
  };
}

/** Rejilla de celdas rectangulares; devuelve las formas y sus centros. */
function grid(
  columns: number,
  rows: number,
  x: number,
  y: number,
  width: number,
  height: number,
  gap = 1,
): TemplateElement[] {
  const cellWidth = (width - gap * (columns - 1)) / columns;
  const cellHeight = (height - gap * (rows - 1)) / rows;
  const cells: TemplateElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push(
        shape(
          'rectangle',
          x + column * (cellWidth + gap),
          y + row * (cellHeight + gap),
          cellWidth,
          cellHeight,
          '#FFFFFF',
          MUTED,
          2,
        ),
      );
    }
  }
  return cells;
}

const PASTEL = ['#DBEAFE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#EDE9FE', '#FFE4E6'];

/** Texto libre con todos los ajustes a la vista; para lo que no encaja arriba. */
function texto(
  contenido: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Record<string, unknown> = {},
): TemplateElement {
  return {
    type: 'text',
    transformMatrix: box(x, y, width, height),
    properties: {
      text: contenido,
      fontFamily: 'Nunito',
      fontSize: 24,
      color: INK,
      textAlign: 'left',
      ...extra,
    },
  };
}

/** Banda de color: cabeceras y pies de las infografias y los informes. */
function banda(y: number, height: number, color: string, x = 0, width = 100): TemplateElement {
  return {
    type: 'shape',
    transformMatrix: box(x, y, width, height),
    properties: { shape: 'rectangle', fillColor: color, strokeColor: color, strokeWidth: 0, label: '' },
  };
}

/** Emoji suelto, para ilustrar sin depender de ninguna descarga. */
function emoji(char: string, x: number, y: number, size: number): TemplateElement {
  return {
    type: 'icon',
    transformMatrix: box(x, y, size, size),
    properties: { source: 'emoji', char, label: char },
  };
}

/**
 * Dato grande con su rotulo debajo: el ladrillo de cualquier infografia.
 * Van dos textos y no uno para que cada parte se pueda mover y recolorear sola.
 */
function dato(valor: string, rotulo: string, x: number, y: number, width: number, color: string): TemplateElement[] {
  return [
    texto(valor, x, y, width, 9, { fontSize: 54, bold: true, color, textAlign: 'center', fontFamily: 'Fredoka' }),
    texto(rotulo, x, y + 9, width, 6, { fontSize: 24, color: MUTED, textAlign: 'center' }),
  ];
}

/** Fila de una tabla sencilla: etiqueta a la izquierda, hueco a la derecha. */
function filaFicha(rotulo: string, y: number, altura = 7): TemplateElement[] {
  return [
    shape('rectangle', 6, y, 30, altura, '#F1F5F9', MUTED, 2),
    texto(rotulo, 8, y + altura / 2 - 3, 26, 6, { fontSize: 24, bold: true }),
    shape('rectangle', 36, y, 58, altura, '#FFFFFF', MUTED, 2),
  ];
}

// --- Catalogo ---

export const TEMPLATES: PageTemplate[] = [
  // ---------- Organizadores graficos ----------
  {
    id: 'brainstorm',
    label: 'Lluvia de ideas',
    description: 'Una idea central y seis nubes alrededor.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Lluvia de ideas'),
      shape('ellipse', 36, 43, 28, 16, '#1E293B', '#1E293B', 0),
      {
        type: 'text',
        transformMatrix: box(38, 47, 24, 8),
        properties: { text: 'Tema', fontFamily: 'Fredoka', fontSize: 30, color: '#FFFFFF', textAlign: 'center', bold: true },
      },
      ...[
        [4, 18], [36, 15], [68, 18],
        [4, 70], [36, 76], [68, 70],
      ].map(([x, y], i) => shape('cloud', x, y, 26, 20, PASTEL[i], '#64748B', 2)),
      ...[
        [7, 24], [39, 21], [71, 24],
        [7, 76], [39, 82], [71, 76],
      ].map(([x, y]) => writingArea(x, y, 20, 8, 'Idea...')),
    ],
  },
  {
    id: 'kwl',
    label: 'Que se / Que quiero saber / Que aprendi',
    description: 'Tabla KWL de tres columnas.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Lo que aprendo'),
      ...[0, 1, 2].map((i) => shape('rectangle', 4 + i * 31, 18, 30, 74, PASTEL[i], '#64748B', 2)),
      label('Que SE', 4, 20, 30),
      label('Que QUIERO saber', 35, 20, 30),
      label('Que APRENDI', 66, 20, 30),
      ...[0, 1, 2].map((i) => writingArea(6 + i * 31, 30, 26, 58, 'Escribe aqui...')),
    ],
  },
  {
    id: 'venn',
    label: 'Diagrama de Venn',
    description: 'Dos circulos para comparar y contrastar.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Comparo y contrasto'),
      shape('ellipse', 8, 24, 48, 62, '#DBEAFE', '#2563EB', 3),
      shape('ellipse', 44, 24, 48, 62, '#FCE7F3', '#DB2777', 3),
      label('Solo A', 10, 30, 22, 6, 24),
      label('Los dos', 40, 30, 20, 6, 24),
      label('Solo B', 68, 30, 22, 6, 24),
      writingArea(10, 40, 22, 40, 'Escribe...'),
      writingArea(41, 40, 18, 40, 'Escribe...'),
      writingArea(68, 40, 22, 40, 'Escribe...'),
    ],
  },
  {
    id: 'story-map',
    label: 'Mapa del cuento',
    description: 'Principio, nudo y desenlace, con personajes y lugar.',
    backgroundColor: '#FFFBEB',
    backgroundPattern: null,
    elements: [
      heading('Mapa del cuento'),
      shape('rectangle', 4, 17, 44, 20, '#FFFFFF', '#92400E', 2),
      shape('rectangle', 52, 17, 44, 20, '#FFFFFF', '#92400E', 2),
      label('Personajes', 4, 19, 44, 5, 24),
      label('Lugar', 52, 19, 44, 5, 24),
      writingArea(6, 26, 40, 9),
      writingArea(54, 26, 40, 9),
      ...[0, 1, 2].map((i) => shape('rectangle', 4 + i * 31, 42, 30, 50, '#FFFFFF', '#B45309', 2)),
      label('Principio', 4, 44, 30, 5, 24),
      label('Nudo', 35, 44, 30, 5, 24),
      label('Desenlace', 66, 44, 30, 5, 24),
      ...[0, 1, 2].map((i) => writingArea(6 + i * 31, 51, 26, 38, 'Escribe...')),
    ],
  },
  {
    id: 'cause-effect',
    label: 'Causa y efecto',
    description: 'Tres causas que llevan a un efecto.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Causa y efecto'),
      ...[0, 1, 2].map((i) => shape('rectangle', 4, 20 + i * 25, 34, 20, PASTEL[i], '#64748B', 2)),
      ...[0, 1, 2].map((i) => writingArea(6, 25 + i * 25, 30, 12, 'Causa...')),
      ...[0, 1, 2].map((i) => shape('arrow-line', 40, 26 + i * 25, 14, 8, 'transparent', '#475569', 3)),
      shape('rectangle', 56, 32, 40, 40, '#FEF3C7', '#B45309', 3),
      label('Efecto', 56, 35, 40, 6),
      writingArea(59, 44, 34, 24, 'Que ocurre...'),
    ],
  },
  {
    id: 'animal-report',
    label: 'Ficha de un animal',
    description: 'Cuatro preguntas guia y espacio para el dibujo.',
    backgroundColor: '#F0FDF4',
    backgroundPattern: null,
    elements: [
      heading('Ficha del animal', 3, 40, '#166534'),
      shape('rectangle', 4, 15, 44, 34, '#FFFFFF', '#16A34A', 2),
      label('Que es?', 4, 17, 44, 5, 24),
      writingArea(6, 24, 40, 23),
      shape('rectangle', 52, 15, 44, 34, '#FFFFFF', '#16A34A', 2),
      label('Como es?', 52, 17, 44, 5, 24),
      writingArea(54, 24, 40, 23),
      shape('rectangle', 4, 53, 44, 34, '#FFFFFF', '#16A34A', 2),
      label('Donde vive?', 4, 55, 44, 5, 24),
      writingArea(6, 62, 40, 23),
      shape('rectangle', 52, 53, 44, 34, '#FFFFFF', '#16A34A', 2),
      label('Que come?', 52, 55, 44, 5, 24),
      writingArea(54, 62, 40, 23),
    ],
  },

  // ---------- Comics ----------
  {
    id: 'comic-2',
    label: 'Comic de 2 viñetas',
    description: 'Dos viñetas grandes con bocadillos.',
    backgroundColor: '#1E293B',
    backgroundPattern: null,
    elements: [
      shape('rectangle', 3, 4, 94, 44, '#FFFFFF', '#0F172A', 4),
      shape('rectangle', 3, 52, 94, 44, '#FFFFFF', '#0F172A', 4),
      shape('speech-bubble', 8, 8, 34, 18, '#FFFFFF', '#0F172A', 3),
      shape('speech-bubble', 58, 56, 34, 18, '#FFFFFF', '#0F172A', 3),
      writingArea(11, 11, 28, 9, 'Que dice...'),
      writingArea(61, 59, 28, 9, 'Que dice...'),
    ],
  },
  {
    id: 'comic-4',
    label: 'Comic de 4 viñetas',
    description: 'Rejilla de dos por dos, estilo tira comica.',
    backgroundColor: '#0F172A',
    backgroundPattern: null,
    elements: [
      ...grid(2, 2, 3, 4, 94, 92, 2).map((cell) => ({
        ...cell,
        properties: { ...cell.properties, strokeColor: '#0F172A', strokeWidth: 4 },
      })),
      shape('speech-bubble', 7, 8, 28, 14, '#FFFFFF', '#0F172A', 3),
      shape('thought-bubble', 63, 8, 28, 16, '#FFFFFF', '#0F172A', 3),
      shape('speech-bubble', 7, 55, 28, 14, '#FFFFFF', '#0F172A', 3),
      shape('speech-bubble', 63, 55, 28, 14, '#FFFFFF', '#0F172A', 3),
    ],
  },
  {
    id: 'comic-6',
    label: 'Comic de 6 viñetas',
    description: 'Tres columnas por dos filas.',
    backgroundColor: '#0F172A',
    backgroundPattern: null,
    elements: grid(3, 2, 3, 4, 94, 92, 2).map((cell) => ({
      ...cell,
      properties: { ...cell.properties, strokeColor: '#0F172A', strokeWidth: 4 },
    })),
  },

  // ---------- Tablas ----------
  {
    id: 'table-3x3',
    label: 'Tabla 3 x 3',
    description: 'Cabecera de color y nueve celdas.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Titulo de la tabla'),
      ...[0, 1, 2].map((i) => shape('rectangle', 4 + i * 31, 18, 30, 9, '#0EA5E9', '#0369A1', 2)),
      ...grid(3, 3, 4, 28, 92, 64, 1),
    ],
  },
  {
    id: 'table-5x5',
    label: 'Tabla 5 x 5',
    description: 'Rejilla amplia para clasificar datos.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Titulo de la tabla'),
      ...[0, 1, 2, 3, 4].map((i) => shape('rectangle', 3 + i * 18.8, 18, 18, 8, '#14B8A6', '#0F766E', 2)),
      ...grid(5, 5, 3, 27, 94, 66, 1),
    ],
  },
  {
    id: 'weekly-calendar',
    label: 'Calendario semanal',
    description: 'Los siete dias de la semana.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Mi semana'),
      ...['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].flatMap((day, i) => {
        const y = 17 + i * 11.3;
        return [
          shape('rectangle', 4, y, 22, 10, '#FDE68A', '#B45309', 2),
          label(day, 4, y + 2.5, 22, 5, 24),
          shape('rectangle', 27, y, 69, 10, '#FFFFFF', '#B45309', 2),
        ];
      }),
    ],
  },


  // ---------- Organizadores adicionales ----------
  {
    id: 'cornell',
    label: 'Apuntes Cornell',
    description: 'Claves, notas y resumen.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: 'ruled',
    elements: [
      heading('Apuntes Cornell', 3, 38, '#1D4ED8'),
      shape('rectangle', 4, 15, 28, 62, '#EFF6FF', '#1D4ED8', 2),
      label('Claves', 4, 17, 28, 5, 24),
      writingArea(6, 24, 24, 51, 'Palabras clave...'),
      shape('rectangle', 34, 15, 62, 62, '#FFFFFF', '#1D4ED8', 2),
      label('Notas', 34, 17, 62, 5, 24),
      writingArea(36, 24, 58, 51, 'Toma tus notas...'),
      shape('rectangle', 4, 79, 92, 17, '#DBEAFE', '#1D4ED8', 2),
      label('Resumen', 4, 80, 92, 5, 24),
      writingArea(6, 86, 88, 8, 'En una frase...'),
    ],
  },
  {
    id: 'word-web',
    label: 'Red de palabras',
    description: 'Un concepto central y seis ramas.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Red de palabras'),
      shape('ellipse', 36, 42, 28, 18, '#1E293B', '#1E293B', 0),
      {
        type: 'text',
        transformMatrix: box(38, 47, 24, 8),
        properties: {
          text: 'Palabra',
          fontFamily: 'Fredoka',
          fontSize: 28,
          color: '#FFFFFF',
          textAlign: 'center',
          bold: true,
        },
      },
      ...[
        [6, 16], [37, 14], [68, 16],
        [6, 72], [37, 78], [68, 72],
      ].map(([x, y], i) => shape('ellipse', x, y, 24, 17, PASTEL[i], '#475569', 2)),
      ...[
        [8, 21], [39, 19], [70, 21],
        [8, 77], [39, 83], [70, 77],
      ].map(([x, y]) => writingArea(x, y, 20, 7, 'Idea...')),
    ],
  },
  {
    id: 'fishbone',
    label: 'Espina de pescado',
    description: 'Causas que confluyen en un problema.',
    backgroundColor: '#EFF6FF',
    backgroundPattern: null,
    elements: [
      heading('Analisis de causas', 3, 38, '#1E3A8A'),
      shape('line', 6, 48, 74, 4, 'transparent', '#1E3A8A', 4),
      shape('rectangle', 78, 38, 20, 24, '#1D4ED8', '#1E3A8A', 2),
      label('Problema', 78, 46, 20, 6, 24),
      ...[0, 1, 2].map((i) => shape('rectangle', 8 + i * 24, 18, 22, 20, '#FFFFFF', '#1E3A8A', 2)),
      ...[0, 1, 2].map((i) => shape('rectangle', 8 + i * 24, 62, 22, 20, '#FFFFFF', '#1E3A8A', 2)),
      ...[0, 1, 2].map((i) => writingArea(10 + i * 24, 24, 18, 12, 'Causa...')),
      ...[0, 1, 2].map((i) => writingArea(10 + i * 24, 68, 18, 12, 'Causa...')),
    ],
  },
  {
    id: 'compare-table',
    label: 'Comparar dos cosas',
    description: 'Tabla de criterios para dos elementos.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Comparo'),
      shape('rectangle', 4, 17, 30, 9, '#E2E8F0', '#475569', 2),
      shape('rectangle', 35, 17, 30, 9, '#DBEAFE', '#1D4ED8', 2),
      shape('rectangle', 66, 17, 30, 9, '#FCE7F3', '#DB2777', 2),
      label('Criterio', 4, 19, 30, 5, 24),
      label('Opcion A', 35, 19, 30, 5, 24),
      label('Opcion B', 66, 19, 30, 5, 24),
      ...grid(3, 4, 4, 27, 92, 66, 1),
    ],
  },
  {
    id: 'rubric',
    label: 'Rubrica de evaluacion',
    description: 'Cuatro criterios y cuatro niveles.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Rubrica', 3, 38, '#7C2D12'),
      ...['Criterio', 'Nivel 4', 'Nivel 3', 'Nivel 2'].map((_, i) =>
        shape('rectangle', 3 + i * 24.3, 15, 23.3, 8, i === 0 ? '#FED7AA' : '#FDBA74', '#9A3412', 2),
      ),
      ...['Criterio', 'Nivel 4', 'Nivel 3', 'Nivel 2'].map((text, i) =>
        label(text, 3 + i * 24.3, 17, 23.3, 5, 24),
      ),
      ...grid(4, 4, 3, 24, 94, 70, 1),
    ],
  },
  {
    id: 'checklist',
    label: 'Lista de comprobacion',
    description: 'Ocho casillas para marcar.',
    backgroundColor: '#F0FDF4',
    backgroundPattern: null,
    elements: [
      heading('Mi lista', 3, 40, '#166534'),
      ...Array.from({ length: 8 }, (_, i) => {
        const y = 16 + i * 10;
        return [
          shape('square', 5, y, 7, 7, '#FFFFFF', '#16A34A', 3),
          shape('rectangle', 14, y, 82, 7, '#FFFFFF', '#86EFAC', 2),
          writingArea(16, y + 1, 78, 5, 'Tarea...'),
        ];
      }).flat(),
    ],
  },

  // ---------- Comics a color ----------
  {
    id: 'comic-color-3',
    label: 'Comic a color',
    description: 'Tres paneles de colores con bocadillos.',
    backgroundColor: '#111827',
    backgroundPattern: null,
    elements: [
      shape('rectangle', 3, 4, 46, 44, '#F43F5E', '#0F172A', 4),
      shape('rectangle', 51, 4, 46, 44, '#1E3A8A', '#0F172A', 4),
      shape('rectangle', 3, 52, 94, 44, '#F59E0B', '#0F172A', 4),
      shape('speech-bubble', 7, 8, 30, 15, '#FFFFFF', '#0F172A', 3),
      shape('thought-bubble', 55, 8, 30, 17, '#FFFFFF', '#0F172A', 3),
      shape('burst', 40, 58, 22, 22, '#FDE68A', '#0F172A', 3),
      label('WOW!', 40, 66, 22, 6, 26),
    ],
  },
  {
    id: 'comic-wow',
    label: 'Comic de una viñeta',
    description: 'Un panel grande con estallido para el titulo.',
    backgroundColor: '#111827',
    backgroundPattern: null,
    elements: [
      shape('rectangle', 3, 4, 94, 92, '#DC2626', '#0F172A', 5),
      shape('burst', 28, 30, 44, 40, '#38BDF8', '#0F172A', 4),
      {
        type: 'text',
        transformMatrix: box(30, 44, 40, 12),
        properties: {
          text: 'PUM!',
          fontFamily: 'Luckiest Guy',
          fontSize: 56,
          color: '#0F172A',
          textAlign: 'center',
        },
      },
      shape('rectangle', 6, 8, 40, 8, '#FFFFFF', '#0F172A', 2),
      writingArea(8, 9, 36, 6, 'Pon aqui el texto'),
    ],
  },

  // ---------- Planificacion ----------
  {
    id: 'timeline-page',
    label: 'Linea del tiempo',
    description: 'Cinco hitos sobre una linea.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('Linea del tiempo'),
      shape('line', 4, 48, 92, 4, 'transparent', '#334155', 4),
      ...Array.from({ length: 5 }, (_, i) => {
        const x = 5 + i * 18.6;
        const arriba = i % 2 === 0;
        return [
          shape('ellipse', x + 6, 45, 6, 6, '#334155', '#334155', 0),
          shape('rectangle', x, arriba ? 20 : 60, 18, 22, PASTEL[i], '#64748B', 2),
          writingArea(x + 2, arriba ? 24 : 64, 14, 14, 'Hito...'),
        ];
      }).flat(),
    ],
  },
  {
    id: 'all-about-me',
    label: 'Sobre mi',
    description: 'Portada personal con cuatro apartados.',
    backgroundColor: '#FDF4FF',
    backgroundPattern: null,
    elements: [
      heading('Sobre mi', 3, 46, '#86198F'),
      shape('ellipse', 36, 14, 28, 22, '#FFFFFF', '#A21CAF', 3),
      writingArea(40, 22, 20, 6, 'Tu foto'),
      ...[
        [4, 40], [52, 40], [4, 68], [52, 68],
      ].map(([x, y]) => shape('rectangle', x, y, 44, 24, '#FFFFFF', '#A21CAF', 2)),
      label('Me gusta', 4, 42, 44, 5, 24),
      label('No me gusta', 52, 42, 44, 5, 24),
      label('Mi sueno', 4, 70, 44, 5, 24),
      label('Mi familia', 52, 70, 44, 5, 24),
      ...[[6, 50], [54, 50], [6, 78], [54, 78]].map(([x, y]) => writingArea(x, y, 40, 12, 'Escribe...')),
    ],
  },

  // ---------- Portada ----------
  {
    id: 'cover',
    label: 'Portada',
    description: 'Titulo, autoria y espacio para la ilustracion.',
    backgroundColor: '#4C1D95',
    backgroundPattern: null,
    elements: [
      shape('rectangle', 6, 6, 88, 88, 'transparent', '#FDE68A', 4),
      {
        type: 'text',
        transformMatrix: box(10, 14, 80, 16),
        properties: {
          text: 'El titulo de mi libro',
          fontFamily: 'Luckiest Guy',
          fontSize: 60,
          color: '#FDE68A',
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        transformMatrix: box(10, 32, 80, 7),
        properties: {
          text: 'por Tu nombre',
          fontFamily: 'Caveat',
          fontSize: 36,
          color: '#FFFFFF',
          textAlign: 'center',
        },
      },
      shape('rectangle', 20, 44, 60, 44, '#FFFFFF', '#FDE68A', 3),
      writingArea(24, 62, 52, 8, 'Pon aqui tu ilustracion'),
    ],
  },

  // ---------- Infografias ----------
  {
    id: 'infografia-datos',
    label: 'Infografia de datos',
    description: 'Cabecera, tres cifras grandes y espacio para explicarlas.',
    backgroundColor: '#F8FAFC',
    backgroundPattern: null,
    elements: [
      banda(0, 16, '#1E3A8A'),
      texto('TITULO DE LA INFOGRAFIA', 6, 4, 88, 8, {
        fontSize: 40, bold: true, color: '#FFFFFF', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      ...dato('00', 'Primer dato', 6, 22, 28, '#1D4ED8'),
      ...dato('00', 'Segundo dato', 36, 22, 28, '#0891B2'),
      ...dato('00', 'Tercer dato', 66, 22, 28, '#7C3AED'),
      shape('rectangle', 6, 42, 88, 0.6, '#CBD5E1', '#CBD5E1', 0),
      texto('¿Que significan estos numeros?', 6, 45, 88, 6, { fontSize: 26, bold: true }),
      writingArea(6, 52, 88, 30, 'Explica aqui lo que muestran los datos...'),
      banda(88, 12, '#E2E8F0'),
      texto('Fuente:', 6, 91, 40, 6, { fontSize: 24, color: MUTED }),
    ],
  },
  {
    id: 'infografia-pasos',
    label: 'Infografia de pasos',
    description: 'Cuatro pasos numerados en columna, con icono y explicacion.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      heading('COMO SE HACE', 4, 40, '#0F172A'),
      ...[0, 1, 2, 3].flatMap((i) => {
        const y = 18 + i * 19;
        const color = ['#2563EB', '#0891B2', '#16A34A', '#F59E0B'][i];
        return [
          shape('ellipse', 6, y, 12, 12, color, color, 0),
          texto(String(i + 1), 6, y + 3, 12, 7, {
            fontSize: 38, bold: true, color: '#FFFFFF', textAlign: 'center', fontFamily: 'Fredoka',
          }),
          texto(`Paso ${i + 1}`, 21, y + 1, 40, 6, { fontSize: 26, bold: true, color }),
          writingArea(21, y + 7, 73, 9, 'Explica este paso...'),
        ];
      }),
    ],
  },
  {
    id: 'infografia-comparativa',
    label: 'Infografia comparativa',
    description: 'Dos columnas enfrentadas para comparar con datos e iconos.',
    backgroundColor: '#FFFBEB',
    backgroundPattern: null,
    elements: [
      heading('A vs B', 4, 42, '#92400E'),
      shape('rectangle', 5, 17, 43, 76, '#FFFFFF', '#F59E0B', 3),
      shape('rectangle', 52, 17, 43, 76, '#FFFFFF', '#0891B2', 3),
      emoji('🅰', 22, 20, 9),
      emoji('🅱', 69, 20, 9),
      texto('Opcion A', 7, 31, 39, 6, { fontSize: 28, bold: true, color: '#B45309', textAlign: 'center' }),
      texto('Opcion B', 54, 31, 39, 6, { fontSize: 28, bold: true, color: '#0E7490', textAlign: 'center' }),
      writingArea(7, 39, 39, 50, 'Caracteristicas...'),
      writingArea(54, 39, 39, 50, 'Caracteristicas...'),
    ],
  },

  // ---------- Agendas y planeadores ----------
  {
    id: 'agenda-semanal',
    label: 'Agenda semanal',
    description: 'Los cinco dias de clase con espacio para tareas y recordatorios.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      banda(0, 12, '#0F766E'),
      texto('AGENDA DE LA SEMANA', 6, 2.5, 60, 7, {
        fontSize: 34, bold: true, color: '#FFFFFF', fontFamily: 'Fredoka',
      }),
      texto('Semana del ____ al ____', 66, 4, 30, 6, { fontSize: 24, color: '#CCFBF1', textAlign: 'right' }),
      ...['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'].flatMap((dia, i) => {
        const y = 15 + i * 15;
        return [
          shape('rectangle', 4, y, 18, 13, '#F0FDFA', '#0F766E', 2),
          texto(dia, 4, y + 4, 18, 6, { fontSize: 24, bold: true, color: '#0F766E', textAlign: 'center' }),
          shape('rectangle', 23, y, 73, 13, '#FFFFFF', MUTED, 2),
          writingArea(25, y + 2, 69, 9, 'Tareas y deberes...'),
        ];
      }),
      texto('Para no olvidar:', 4, 91, 30, 5, { fontSize: 24, bold: true, color: '#0F766E' }),
      shape('rectangle', 35, 90, 61, 7, '#FFFFFF', MUTED, 2),
    ],
  },
  {
    id: 'planeador-clase',
    label: 'Planeador de clase',
    description: 'Objetivos, momentos de la sesion, recursos y evaluacion.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      banda(0, 13, '#4338CA'),
      texto('PLANEADOR DE CLASE', 6, 3, 55, 7, {
        fontSize: 32, bold: true, color: '#FFFFFF', fontFamily: 'Fredoka',
      }),
      texto('Fecha: ______  Curso: ______', 54, 5, 42, 5, { fontSize: 24, color: '#E0E7FF', textAlign: 'right' }),

      texto('Objetivo de aprendizaje', 5, 16, 90, 5, { fontSize: 24, bold: true, color: '#4338CA' }),
      shape('rectangle', 5, 21, 90, 10, '#EEF2FF', '#C7D2FE', 2),
      writingArea(7, 23, 86, 7, 'Al terminar la sesion, el alumnado sera capaz de...'),

      texto('Momentos de la sesion', 5, 34, 90, 5, { fontSize: 24, bold: true, color: '#4338CA' }),
      ...['Inicio', 'Desarrollo', 'Cierre'].flatMap((momento, i) => {
        const y = 40 + i * 13;
        return [
          shape('rectangle', 5, y, 20, 11, '#F5F3FF', '#C7D2FE', 2),
          texto(momento, 5, y + 3, 20, 5, { fontSize: 24, bold: true, textAlign: 'center', color: '#4338CA' }),
          texto('__ min', 5, y + 7, 20, 4, { fontSize: 24, textAlign: 'center', color: MUTED }),
          shape('rectangle', 26, y, 69, 11, '#FFFFFF', MUTED, 2),
          writingArea(28, y + 1.5, 65, 8, 'Que se hace...'),
        ];
      }),

      texto('Recursos', 5, 81, 43, 5, { fontSize: 24, bold: true, color: '#4338CA' }),
      shape('rectangle', 5, 86, 43, 11, '#FFFFFF', MUTED, 2),
      texto('Como se evalua', 52, 81, 43, 5, { fontSize: 24, bold: true, color: '#4338CA' }),
      shape('rectangle', 52, 86, 43, 11, '#FFFFFF', MUTED, 2),
    ],
  },
  {
    id: 'planeador-unidad',
    label: 'Planeador de unidad',
    description: 'Una unidad completa: competencias, sesiones y producto final.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      banda(0, 13, '#B91C1C'),
      texto('PLANEADOR DE UNIDAD', 6, 3, 88, 7, {
        fontSize: 32, bold: true, color: '#FFFFFF', fontFamily: 'Fredoka',
      }),
      ...filaFicha('Unidad', 16),
      ...filaFicha('Asignatura', 24),
      ...filaFicha('Curso y grupo', 32),
      ...filaFicha('Duracion', 40),
      texto('Competencias que se trabajan', 6, 50, 88, 5, { fontSize: 24, bold: true, color: '#B91C1C' }),
      shape('rectangle', 6, 55, 88, 14, '#FEF2F2', '#FECACA', 2),
      texto('Sesiones previstas', 6, 71, 43, 5, { fontSize: 24, bold: true, color: '#B91C1C' }),
      shape('rectangle', 6, 76, 43, 18, '#FFFFFF', MUTED, 2),
      texto('Producto final', 52, 71, 42, 5, { fontSize: 24, bold: true, color: '#B91C1C' }),
      shape('rectangle', 52, 76, 42, 18, '#FFFFFF', MUTED, 2),
    ],
  },

  // ---------- Informes academicos ----------
  {
    id: 'informe-academico',
    label: 'Informe academico',
    description: 'Notas por asignatura con observaciones, en escala alemana.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      banda(0, 14, '#1E293B'),
      texto('INFORME ACADEMICO', 6, 3.5, 60, 7, {
        fontSize: 32, bold: true, color: '#FFFFFF', fontFamily: 'Fredoka',
      }),
      texto('Periodo: ______', 62, 5, 32, 5, { fontSize: 24, color: '#CBD5E1', textAlign: 'right' }),
      ...filaFicha('Alumno/a', 17, 6),
      ...filaFicha('Curso', 24, 6),

      shape('rectangle', 6, 33, 52, 6, '#1E293B', '#1E293B', 0),
      texto('Asignatura', 8, 34.5, 48, 5, { fontSize: 24, bold: true, color: '#FFFFFF' }),
      shape('rectangle', 58, 33, 14, 6, '#1E293B', '#1E293B', 0),
      texto('Nota', 58, 34.5, 14, 5, { fontSize: 24, bold: true, color: '#FFFFFF', textAlign: 'center' }),
      shape('rectangle', 72, 33, 22, 6, '#1E293B', '#1E293B', 0),
      texto('Observacion', 72, 34.5, 22, 5, { fontSize: 24, bold: true, color: '#FFFFFF', textAlign: 'center' }),

      ...[0, 1, 2, 3, 4, 5].flatMap((i) => {
        const y = 39 + i * 7;
        return [
          shape('rectangle', 6, y, 52, 7, i % 2 ? '#F8FAFC' : '#FFFFFF', MUTED, 2),
          shape('rectangle', 58, y, 14, 7, i % 2 ? '#F8FAFC' : '#FFFFFF', MUTED, 2),
          shape('rectangle', 72, y, 22, 7, i % 2 ? '#F8FAFC' : '#FFFFFF', MUTED, 2),
        ];
      }),

      // La escala alemana va del 1,0 (mejor) al 6,0 (peor); conviene recordarlo
      // en la propia hoja, que es donde se rellena.
      texto('Escala: 1,0 es la mejor nota y 6,0 la mas baja.', 6, 82, 88, 5, {
        fontSize: 24, color: MUTED,
      }),
      texto('Observaciones generales', 6, 87, 88, 5, { fontSize: 24, bold: true }),
      shape('rectangle', 6, 92, 88, 6, '#FFFFFF', MUTED, 2),
    ],
  },
  {
    id: 'informe-progreso',
    label: 'Informe de progreso',
    description: 'Logros, dificultades y compromisos, para hablar con la familia.',
    backgroundColor: '#F0F9FF',
    backgroundPattern: null,
    elements: [
      heading('COMO VOY', 4, 42, '#0C4A6E'),
      ...[
        ['Lo que ya domino', '#16A34A', '✅'],
        ['Lo que me cuesta', '#F59E0B', '⚠️'],
        ['Mi compromiso', '#2563EB', '🎯'],
      ].flatMap(([titulo, color, icono], i) => {
        const y = 18 + i * 27;
        return [
          shape('rectangle', 5, y, 90, 24, '#FFFFFF', color as string, 3),
          emoji(icono as string, 7, y + 2, 8),
          texto(titulo as string, 17, y + 3, 60, 6, { fontSize: 26, bold: true, color: color as string }),
          writingArea(17, y + 10, 76, 12, 'Escribe aqui...'),
        ];
      }),
    ],
  },

  // ---------- Portadas tematicas ----------
  {
    id: 'portada-reunificacion',
    label: 'Dia de la Unidad Alemana',
    description: 'Portada para el 3 de octubre, con la bandera alemana.',
    backgroundColor: '#111827',
    backgroundPattern: null,
    elements: [
      // Negro, rojo y oro: la bandera, en bandas horizontales.
      banda(14, 9, '#000000', 12, 76),
      banda(23, 9, '#DD0000', 12, 76),
      banda(32, 9, '#FFCE00', 12, 76),
      texto('TAG DER', 6, 46, 88, 9, {
        fontSize: 52, bold: true, color: '#FFCE00', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('DEUTSCHEN EINHEIT', 6, 55, 88, 9, {
        fontSize: 46, bold: true, color: '#FFFFFF', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('Dia de la Unidad Alemana · 3 de octubre', 6, 66, 88, 6, {
        fontSize: 24, color: '#E5E7EB', textAlign: 'center',
      }),
      shape('rectangle', 20, 74, 60, 0.6, '#DD0000', '#DD0000', 0),
      texto('por Tu nombre', 6, 78, 88, 6, {
        fontSize: 28, color: '#9CA3AF', textAlign: 'center', fontFamily: 'Caveat',
      }),
    ],
  },
  {
    id: 'portada-independencia-co',
    label: 'Independencia de Colombia',
    description: 'Portada para el 20 de julio, con los colores de la bandera.',
    backgroundColor: '#FFFFFF',
    backgroundPattern: null,
    elements: [
      // Amarillo, azul y rojo. El amarillo ocupa la mitad, como en la bandera.
      /*
       * Las tres bandas SON la bandera; no lleva emoji a proposito. El de la
       * bandera de Colombia no se pinta en Windows (no trae emojis de bandera) y
       * salia como las dos letras "CO" en mitad de la portada.
       */
      banda(0, 32, '#FCD116'),
      banda(32, 16, '#003893'),
      banda(48, 16, '#CE1126'),
      texto('20 DE JULIO', 6, 68, 88, 9, {
        fontSize: 50, bold: true, color: '#003893', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('Independencia de Colombia', 6, 78, 88, 7, {
        fontSize: 30, color: '#CE1126', textAlign: 'center', bold: true,
      }),
      texto('por Tu nombre', 6, 88, 88, 6, {
        fontSize: 28, color: MUTED, textAlign: 'center', fontFamily: 'Caveat',
      }),
    ],
  },
  {
    id: 'portada-amor-amistad',
    label: 'Amor y amistad',
    description: 'Portada calida para el mes del amor y la amistad.',
    backgroundColor: '#FFF1F2',
    backgroundPattern: null,
    elements: [
      shape('heart', 8, 8, 20, 18, '#FB7185', '#E11D48', 2),
      shape('heart', 72, 12, 16, 14, '#FDA4AF', '#E11D48', 2),
      shape('heart', 76, 74, 18, 16, '#FB7185', '#E11D48', 2),
      shape('heart', 6, 76, 14, 12, '#FDA4AF', '#E11D48', 2),
      texto('AMOR Y', 6, 34, 88, 10, {
        fontSize: 56, bold: true, color: '#BE123C', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('AMISTAD', 6, 45, 88, 10, {
        fontSize: 56, bold: true, color: '#E11D48', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('para ______________', 6, 58, 88, 7, {
        fontSize: 32, color: '#9F1239', textAlign: 'center', fontFamily: 'Caveat',
      }),
      texto('de ______________', 6, 66, 88, 7, {
        fontSize: 32, color: '#9F1239', textAlign: 'center', fontFamily: 'Caveat',
      }),
    ],
  },
  {
    id: 'portada-ciencias',
    label: 'Portada de ciencias',
    description: 'Para trabajos de naturales, fisica o quimica.',
    backgroundColor: '#042F2E',
    backgroundPattern: null,
    elements: [
      shape('ellipse', 62, 8, 32, 28, '#134E4A', '#2DD4BF', 3),
      emoji('🔬', 70, 13, 16),
      emoji('🧪', 8, 12, 12),
      texto('MI PROYECTO', 6, 44, 70, 9, {
        fontSize: 46, bold: true, color: '#5EEAD4', fontFamily: 'Fredoka',
      }),
      texto('DE CIENCIAS', 6, 54, 70, 9, {
        fontSize: 46, bold: true, color: '#FFFFFF', fontFamily: 'Fredoka',
      }),
      shape('rectangle', 6, 66, 40, 0.6, '#2DD4BF', '#2DD4BF', 0),
      texto('Tema:', 6, 70, 88, 6, { fontSize: 24, color: '#99F6E4' }),
      texto('Nombre y curso:', 6, 78, 88, 6, { fontSize: 24, color: '#99F6E4' }),
      texto('Fecha:', 6, 86, 88, 6, { fontSize: 24, color: '#99F6E4' }),
    ],
  },
  {
    id: 'portada-lectura',
    label: 'Portada de lectura',
    description: 'Para el diario de lectura o una resena de un libro.',
    backgroundColor: '#FEF3C7',
    backgroundPattern: null,
    elements: [
      shape('rectangle', 8, 8, 84, 84, 'transparent', '#B45309', 4),
      emoji('📚', 42, 14, 16),
      texto('MI DIARIO', 8, 34, 84, 10, {
        fontSize: 52, bold: true, color: '#78350F', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      texto('DE LECTURA', 8, 45, 84, 10, {
        fontSize: 52, bold: true, color: '#B45309', textAlign: 'center', fontFamily: 'Fredoka',
      }),
      shape('rectangle', 25, 58, 50, 0.6, '#B45309', '#B45309', 0),
      texto('Libro:', 12, 63, 76, 6, { fontSize: 26, color: '#78350F' }),
      texto('Autor o autora:', 12, 71, 76, 6, { fontSize: 26, color: '#78350F' }),
      texto('Mi nombre:', 12, 79, 76, 6, { fontSize: 26, color: '#78350F' }),
    ],
  },
];

export const TEMPLATE_GROUPS: Array<{ label: string; ids: string[] }> = [
  {
    label: 'Organizadores graficos',
    ids: [
      'brainstorm', 'kwl', 'venn', 'story-map', 'cause-effect',
      'animal-report', 'word-web', 'fishbone', 'compare-table',
    ],
  },
  { label: 'Comics', ids: ['comic-2', 'comic-4', 'comic-6', 'comic-color-3', 'comic-wow'] },
  { label: 'Tablas y rubricas', ids: ['table-3x3', 'table-5x5', 'weekly-calendar', 'rubric', 'checklist'] },
  { label: 'Infografias', ids: ['infografia-datos', 'infografia-pasos', 'infografia-comparativa'] },
  {
    label: 'Agendas y planeadores',
    ids: ['agenda-semanal', 'planeador-clase', 'planeador-unidad', 'cornell', 'timeline-page'],
  },
  { label: 'Informes academicos', ids: ['informe-academico', 'informe-progreso'] },
  {
    label: 'Portadas',
    ids: [
      'cover', 'all-about-me',
      'portada-reunificacion', 'portada-independencia-co', 'portada-amor-amistad',
      'portada-ciencias', 'portada-lectura',
    ],
  },
];

export const TEMPLATES_BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));
