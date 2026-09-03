import type { ElementType } from './canvas.schemas.js';

/**
 * Herramientas del editor que el profesorado puede vetar a su alumnado.
 *
 * Cada herramienta es exactamente un tipo de elemento del lienzo. Se eligio esa
 * correspondencia, y no una lista mas fina calcada de los botones, para que lo
 * que se apaga en la pantalla el servidor tambien lo rechace: una lista mas
 * detallada (por ejemplo, prohibir los GIF pero no las imagenes) solo se podria
 * hacer cumplir escondiendo botones, y un alumno con la consola abierta se la
 * saltaria en un minuto.
 *
 * Todas estan disponibles salvo que la biblioteca las apague; la biblioteca
 * guarda las vetadas, no las permitidas.
 */
export interface Tool {
  id: ElementType;
  label: string;
  /** Que agrupa, para que el docente sepa que esta apagando de verdad. */
  hint: string;
}

export const EDITOR_TOOLS: Tool[] = [
  { id: 'text', label: 'Texto', hint: 'Cuadros de texto y titulos.' },
  {
    id: 'image',
    label: 'Imagenes',
    hint: 'Buscador de imagenes libres, subir del equipo, pegar, GIF, foto con la camara y las creadas con IA.',
  },
  { id: 'drawing', label: 'Dibujo a mano', hint: 'Trazos libres con el lapiz.' },
  { id: 'shape', label: 'Formas', hint: 'Rectangulos, circulos, flechas y demas.' },
  { id: 'icon', label: 'Iconos y pegatinas', hint: 'Simbolos y adhesivos del catalogo.' },
  { id: 'audio', label: 'Audio', hint: 'Grabar la voz e insertar sonidos de la biblioteca.' },
  { id: 'video', label: 'Video', hint: 'Grabar con la camara y grabar la pantalla.' },
  { id: 'map', label: 'Mapas', hint: 'Mapas interactivos con marcadores.' },
  { id: 'embed', label: 'Contenido incrustado', hint: 'Videos y paginas de otros sitios.' },
  { id: 'question', label: 'Preguntas', hint: 'Bloques de pregunta, incluidas las abiertas.' },
  { id: 'chart', label: 'Graficas', hint: 'Graficos de barras, lineas y sectores.' },
  { id: 'math', label: 'Formulas', hint: 'Expresiones matematicas.' },
];

const IDS = new Set<string>(EDITOR_TOOLS.map((t) => t.id));

export function isTool(value: unknown): value is ElementType {
  return typeof value === 'string' && IDS.has(value);
}

/** Limpia lo que llegue de fuera: solo herramientas conocidas y sin repetir. */
export function sanitizeTools(value: unknown): ElementType[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isTool))];
}
