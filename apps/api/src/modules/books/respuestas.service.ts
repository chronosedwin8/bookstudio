import { randomUUID } from 'node:crypto';
import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { ordenApellidos } from '../../lib/orden-nombres.js';

/**
 * Respuestas guardadas de las preguntas y encuestas del lienzo.
 *
 * Cada pregunta lleva en sus propiedades una `questionKey` que viaja con todas
 * sus copias: el material que reparte el docente, las paginas pegadas en otro
 * libro, el libro pasado a una biblioteca. Las respuestas se guardan por esa
 * clave, una por persona: asi el docente ve en una sola lista lo que contesto
 * cada alumno, en su copia o en el libro compartido.
 *
 * Solo se guarda lo de quien tiene sesion. En un enlace publico abierto sin
 * cuenta se corrige igual, pero no hay a quien atribuir la respuesta.
 */

/**
 * La clave de la pregunta; si aun no tiene (preguntas de antes del 19-10-2026),
 * se le pone ahora y queda guardada, para que sus copias futuras la hereden.
 */
export async function claveDe(elementId: string, properties: Record<string, unknown>): Promise<string> {
  const actual = properties.questionKey;
  if (typeof actual === 'string' && /^[0-9a-f-]{36}$/i.test(actual)) return actual;
  const nueva = randomUUID();
  // jsonb_set con COALESCE: si dos respuestas llegan a la vez, gana la primera clave.
  const { rows } = await query<{ key: string }>(
    `UPDATE canvas_elements
        SET properties = properties || jsonb_build_object('questionKey', COALESCE(properties->>'questionKey', $2::text))
      WHERE id = $1
      RETURNING properties->>'questionKey' AS key`,
    [elementId, nueva],
  );
  return rows[0]?.key ?? nueva;
}

export async function guardar(r: {
  key: string;
  userId: string;
  bookId: string;
  elementId: string;
  kind: string;
  answer: string[];
  correct: boolean | null;
}): Promise<void> {
  await query(
    `INSERT INTO question_responses (question_key, user_id, book_id, element_id, kind, answer, correct)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (question_key, user_id) DO UPDATE
       SET book_id = EXCLUDED.book_id, element_id = EXCLUDED.element_id, kind = EXCLUDED.kind,
           answer = EXCLUDED.answer, correct = EXCLUDED.correct,
           attempts = question_responses.attempts + 1, updated_at = NOW()`,
    [r.key, r.userId, r.bookId, r.elementId, r.kind, JSON.stringify(r.answer.slice(0, 20).map((a) => a.slice(0, 4000))), r.correct],
  );
}

/** Votos de una encuesta, por opcion. Solo numeros: nadie ve quien voto que. */
export async function recuento(key: string): Promise<{ counts: Record<string, number>; total: number }> {
  const { rows } = await query<{ opcion: string; votos: string }>(
    `SELECT opcion, COUNT(*) AS votos
       FROM question_responses r, jsonb_array_elements_text(r.answer) AS opcion
      WHERE r.question_key = $1
      GROUP BY opcion`,
    [key],
  );
  const { rows: total } = await query<{ n: string }>('SELECT COUNT(*) AS n FROM question_responses WHERE question_key = $1', [
    key,
  ]);
  return { counts: Object.fromEntries(rows.map((r) => [r.opcion, Number(r.votos)])), total: Number(total[0].n) };
}

export interface FilaRespuesta {
  userId: string;
  fullName: string;
  email: string;
  course: string | null;
  /** Bibliotecas del docente en las que esta ese alumno. */
  libraries: string[];
  answer: string[];
  correct: boolean | null;
  attempts: number;
  answeredAt: string;
  /** Libro donde contesto (su copia, o el compartido). */
  bookTitle: string | null;
}

/**
 * Respuestas que puede ver quien mira la pregunta desde su libro.
 *
 * - La administracion: todas las de esa pregunta.
 * - El profesorado: las de los alumnos de las bibliotecas que dirige, y las que
 *   se dieron en este mismo libro (por ejemplo, abierto con su enlace).
 * - Nadie mas: el alumnado no ve las respuestas de sus companeros.
 */
export async function listar(
  key: string,
  bookId: string,
  viewer: { userId: string; role: string },
  libraryId?: string,
): Promise<FilaRespuesta[]> {
  if (viewer.role !== 'teacher' && viewer.role !== 'admin') {
    throw HttpError.forbidden('Solo el profesorado y la administración ven las respuestas');
  }
  const esAdmin = viewer.role === 'admin';
  const { rows } = await query<{
    user_id: string;
    full_name: string;
    email: string;
    external_group: string | null;
    libraries: string[] | null;
    answer: string[];
    correct: boolean | null;
    attempts: number;
    updated_at: Date;
    book_title: string | null;
  }>(
    `WITH mias AS (
       SELECT l.id, l.name FROM libraries l
        WHERE l.owner_id = $2
           OR EXISTS (SELECT 1 FROM library_teachers lt WHERE lt.library_id = l.id AND lt.teacher_id = $2)
     )
     SELECT r.user_id, u.full_name, u.email, u.external_group, r.answer, r.correct, r.attempts, r.updated_at,
            b.title AS book_title,
            (SELECT array_agg(m.name ORDER BY m.name)
               FROM library_students ls JOIN mias m ON m.id = ls.library_id
              WHERE ls.student_id = r.user_id) AS libraries
       FROM question_responses r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN books b ON b.id = r.book_id
      WHERE r.question_key = $1
        AND ($3::boolean
             OR r.book_id = $4
             OR EXISTS (SELECT 1 FROM library_students ls JOIN mias m ON m.id = ls.library_id WHERE ls.student_id = r.user_id))
        AND ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM library_students ls WHERE ls.library_id = $5 AND ls.student_id = r.user_id))
      ORDER BY ${ordenApellidos('u')}`,
    [key, viewer.userId, esAdmin, bookId, libraryId ?? null],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    course: r.external_group,
    libraries: r.libraries ?? [],
    answer: Array.isArray(r.answer) ? r.answer : [],
    correct: r.correct,
    attempts: r.attempts,
    answeredAt: r.updated_at.toISOString(),
    bookTitle: r.book_title,
  }));
}
