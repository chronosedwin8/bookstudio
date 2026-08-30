/**
 * Bloques de pregunta listos para usar.
 *
 * Se insertan ya montados y el docente solo cambia los textos: crear una pregunta
 * desde cero exige demasiados pasos para el ritmo de una clase.
 */
import type { QuestionKind, QuestionProperties } from '@/types/api';

export interface QuestionBlock {
  id: string;
  label: string;
  description: string;
  /** Proporcion recomendada del bloque en el lienzo. */
  size: { width: number; height: number };
  properties: QuestionProperties;
}

/** Ids cortos y estables dentro de la pregunta; no hacen falta uuid. */
const option = (id: string, text: string, correct = false) => ({ id, text, correct });

const BASE = {
  feedbackCorrect: 'Muy bien!',
  feedbackWrong: 'Casi. Vuelve a intentarlo.',
  accentColor: '#7C3AED',
  allowRetry: true,
} as const;

export const QUESTION_BLOCKS: QuestionBlock[] = [
  {
    id: 'single-4',
    label: 'Respuesta unica',
    description: 'Cuatro opciones, una sola correcta.',
    size: { width: 52, height: 46 },
    properties: {
      ...BASE,
      kind: 'single',
      prompt: 'Escribe aqui tu pregunta',
      options: [
        option('a', 'Primera opcion', true),
        option('b', 'Segunda opcion'),
        option('c', 'Tercera opcion'),
        option('d', 'Cuarta opcion'),
      ],
    },
  },
  {
    id: 'true-false',
    label: 'Verdadero o falso',
    description: 'Dos opciones para comprobar una afirmacion.',
    size: { width: 46, height: 32 },
    properties: {
      ...BASE,
      kind: 'single',
      prompt: 'Escribe aqui una afirmacion',
      accentColor: '#0EA5E9',
      options: [option('v', 'Verdadero', true), option('f', 'Falso')],
    },
  },
  {
    id: 'multiple-5',
    label: 'Varias respuestas',
    description: 'Marca todas las opciones correctas.',
    size: { width: 52, height: 50 },
    properties: {
      ...BASE,
      kind: 'multiple',
      prompt: 'Cuales de estas son correctas?',
      accentColor: '#16A34A',
      options: [
        option('a', 'Primera opcion', true),
        option('b', 'Segunda opcion'),
        option('c', 'Tercera opcion', true),
        option('d', 'Cuarta opcion'),
        option('e', 'Quinta opcion'),
      ],
    },
  },
  {
    id: 'order-4',
    label: 'Ordenar',
    description: 'Coloca las opciones en el orden correcto.',
    size: { width: 52, height: 46 },
    properties: {
      ...BASE,
      kind: 'order',
      prompt: 'Ordena estos pasos',
      accentColor: '#EA580C',
      // En las de ordenar, este orden ES la solucion.
      options: [
        option('p1', 'Primer paso'),
        option('p2', 'Segundo paso'),
        option('p3', 'Tercer paso'),
        option('p4', 'Cuarto paso'),
      ],
    },
  },
  {
    id: 'image-single',
    label: 'Elegir la imagen',
    description: 'Opciones con imagen; anade las fotos desde el inspector.',
    size: { width: 52, height: 48 },
    properties: {
      ...BASE,
      kind: 'single',
      prompt: 'Cual de estas imagenes corresponde?',
      accentColor: '#DB2777',
      options: [
        option('a', 'Opcion A', true),
        option('b', 'Opcion B'),
        option('c', 'Opcion C'),
      ],
    },
  },
  {
    id: 'order-timeline',
    label: 'Linea del tiempo',
    description: 'Ordena hechos historicos de mas antiguo a mas reciente.',
    size: { width: 54, height: 46 },
    properties: {
      ...BASE,
      kind: 'order',
      prompt: 'Ordena del mas antiguo al mas reciente',
      accentColor: '#B45309',
      options: [
        option('h1', 'Hecho mas antiguo'),
        option('h2', 'Segundo hecho'),
        option('h3', 'Tercer hecho'),
        option('h4', 'Hecho mas reciente'),
      ],
    },
  },
];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  single: 'Respuesta unica',
  multiple: 'Varias respuestas',
  order: 'Ordenar',
};

/** Id disponible para una opcion nueva dentro de una pregunta. */
export function nextOptionId(existing: string[]): string {
  for (let i = 0; i < 200; i += 1) {
    const candidate = `o${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `o${Date.now()}`;
}
