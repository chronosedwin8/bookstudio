import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess, requireManager } from '../libraries/libraries.service.js';

/**
 * Valoraciones de los libros.
 *
 * El docente pone nota varias veces durante el curso: "Revision 1", "Revision 2"...
 * Cada una lleva titulo, nota y el porque. El alumno las ve todas con su fecha; no
 * puede crearlas ni cambiarlas.
 *
 * La escala va de 1.0 a 6.0 con 1.0 como mejor nota. Es al reves de lo que sugiere la
 * intuicion, asi que conviene tenerlo presente en cualquier calculo o color: la media
 * mas baja es la mejor.
 */

export interface Grade {
  id: string;
  bookId: string;
  title: string;
  score: number;
  description: string;
  teacherId: string | null;
  teacherName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GradeRow {
  id: string;
  book_id: string;
  title: string;
  /** NUMERIC llega como cadena desde pg: convertirlo a la fuerza. */
  score: string;
  description: string;
  teacher_id: string | null;
  teacher_name: string | null;
  created_at: Date;
  updated_at: Date;
}

function toGrade(row: GradeRow): Grade {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    score: Number(row.score),
    description: row.description,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const GRADE_SELECT = `g.id, g.book_id, g.title, g.score, g.description, g.teacher_id,
  u.full_name AS teacher_name, g.created_at, g.updated_at`;

interface Contexto {
  libraryId: string;
  creatorId: string | null;
  isManager: boolean;
}

/**
 * Un libro solo se valora dentro de una biblioteca: la nota la pone quien la dirige,
 * y sin biblioteca no hay docente de quien dependa.
 */
async function contexto(bookId: string, userId: string): Promise<Contexto> {
  const { rows } = await query<{ library_id: string | null; creator_id: string | null }>(
    'SELECT library_id, creator_id FROM books WHERE id = $1',
    [bookId],
  );
  if (!rows[0]) throw HttpError.notFound('Libro no encontrado');

  const { library_id: libraryId, creator_id: creatorId } = rows[0];
  if (!libraryId) throw HttpError.badRequest('Un libro personal no se valora: no pertenece a ninguna clase');

  const access = await getAccess(libraryId, userId);
  return { libraryId, creatorId, isManager: access !== 'student' };
}

/** Las notas de un libro. El alumno solo alcanza las de los suyos. */
export async function listGrades(bookId: string, userId: string): Promise<Grade[]> {
  const { creatorId, isManager } = await contexto(bookId, userId);
  if (!isManager && creatorId !== userId) {
    throw HttpError.forbidden('Solo puedes ver las valoraciones de tus propios libros');
  }

  const { rows } = await query<GradeRow>(
    `SELECT ${GRADE_SELECT} FROM book_grades g
     LEFT JOIN users u ON u.id = g.teacher_id
     WHERE g.book_id = $1
     ORDER BY g.created_at`,
    [bookId],
  );
  return rows.map(toGrade);
}

export interface GradeInput {
  title: string;
  score: number;
  description: string;
}

export async function createGrade(bookId: string, userId: string, input: GradeInput): Promise<Grade> {
  const { libraryId } = await contexto(bookId, userId);
  await requireManager(libraryId, userId);

  const { rows } = await query<GradeRow>(
    `WITH nueva AS (
       INSERT INTO book_grades (book_id, teacher_id, title, score, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *
     )
     SELECT ${GRADE_SELECT} FROM nueva g LEFT JOIN users u ON u.id = g.teacher_id`,
    [bookId, userId, input.title, input.score, input.description],
  );
  return toGrade(rows[0]);
}

export async function updateGrade(
  bookId: string,
  gradeId: string,
  userId: string,
  input: GradeInput,
): Promise<Grade> {
  const { libraryId } = await contexto(bookId, userId);
  await requireManager(libraryId, userId);

  // Cualquier docente de la biblioteca puede corregir una nota, no solo quien la
  // puso: en un centro las sustituciones y los co-docentes son lo normal.
  const { rows } = await query<GradeRow>(
    `WITH actualizada AS (
       UPDATE book_grades
       SET title = $3, score = $4, description = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND book_id = $1
       RETURNING *
     )
     SELECT ${GRADE_SELECT} FROM actualizada g LEFT JOIN users u ON u.id = g.teacher_id`,
    [bookId, gradeId, input.title, input.score, input.description],
  );
  if (!rows[0]) throw HttpError.notFound('Valoracion no encontrada');
  return toGrade(rows[0]);
}

export async function deleteGrade(bookId: string, gradeId: string, userId: string): Promise<void> {
  const { libraryId } = await contexto(bookId, userId);
  await requireManager(libraryId, userId);

  const { rowCount } = await query('DELETE FROM book_grades WHERE id = $1 AND book_id = $2', [
    gradeId,
    bookId,
  ]);
  if (!rowCount) throw HttpError.notFound('Valoracion no encontrada');
}

// --------------------------------------------------------------- Cuadricula

export interface GradeBookEntry {
  studentId: string;
  studentName: string;
  course: string | null;
  /** Media de todas sus notas; null si aun no tiene ninguna. */
  average: number | null;
  grades: Array<Grade & { bookTitle: string }>;
}

export interface GradeBook {
  /** Titulos usados en la biblioteca, en el orden en que se estrenaron. */
  titles: string[];
  students: GradeBookEntry[];
  /** Media de la clase, con la misma escala invertida. */
  classAverage: number | null;
}

/**
 * Cuadricula de la clase: alumnado en filas, titulos de nota en columnas.
 *
 * Se resuelve en una sola consulta y se arma en memoria. Un alumno puede tener varios
 * libros valorados con el mismo titulo; en ese caso la celda muestra las dos notas en
 * vez de esconder una, y la media las cuenta todas.
 */
export async function getGradeBook(libraryId: string, userId: string): Promise<GradeBook> {
  await requireManager(libraryId, userId);

  const { rows } = await query<
    GradeRow & { student_id: string; student_name: string; course: string | null; book_title: string }
  >(
    `SELECT ${GRADE_SELECT}, b.title AS book_title,
            alu.id AS student_id, alu.full_name AS student_name,
            alu.external_group AS course
     FROM library_students ls
     JOIN users alu ON alu.id = ls.student_id
     LEFT JOIN books b ON b.library_id = ls.library_id AND b.creator_id = alu.id
     LEFT JOIN book_grades g ON g.book_id = b.id
     LEFT JOIN users u ON u.id = g.teacher_id
     WHERE ls.library_id = $1
     ORDER BY alu.full_name, g.created_at`,
    [libraryId],
  );

  const porAlumno = new Map<string, GradeBookEntry>();
  const titulos: string[] = [];
  let suma = 0;
  let total = 0;

  for (const row of rows) {
    let alumno = porAlumno.get(row.student_id);
    if (!alumno) {
      alumno = {
        studentId: row.student_id,
        studentName: row.student_name,
        course: row.course,
        average: null,
        grades: [],
      };
      porAlumno.set(row.student_id, alumno);
    }

    // El LEFT JOIN deja filas sin nota: son alumnos que aun no tienen ninguna.
    if (!row.id) continue;

    alumno.grades.push({ ...toGrade(row), bookTitle: row.book_title });
    if (!titulos.includes(row.title)) titulos.push(row.title);
    suma += Number(row.score);
    total += 1;
  }

  for (const alumno of porAlumno.values()) {
    if (!alumno.grades.length) continue;
    const suyas = alumno.grades.reduce((acc, g) => acc + g.score, 0);
    alumno.average = Math.round((suyas / alumno.grades.length) * 100) / 100;
  }

  return {
    titles: titulos,
    students: [...porAlumno.values()],
    classAverage: total ? Math.round((suma / total) * 100) / 100 : null,
  };
}
