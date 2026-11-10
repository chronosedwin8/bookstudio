import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess, requireManager } from '../libraries/libraries.service.js';

/**
 * Criterios de valoracion: "Trabajos", "Seguimientos", "Otros"... Cada nota se
 * pone dentro de uno, y el alumno ve sus notas agrupadas por criterio.
 *
 * Los tres de la plataforma son de todos y no se tocan. Ademas, cada docente
 * crea los suyos, de dos maneras:
 *   - para una biblioteca: los ven y los usan todos sus docentes;
 *   - para todas sus bibliotecas: le acompanan en cada una de las suyas.
 */

export type AlcanceCriterio = 'plataforma' | 'biblioteca' | 'docente';

export interface Criterio {
  id: string;
  name: string;
  alcance: AlcanceCriterio;
  libraryId: string | null;
  teacherId: string | null;
  teacherName: string | null;
  /** Si quien pregunta puede renombrarlo o borrarlo. */
  editable: boolean;
  /** Cuantas notas lo usan (en todas partes). */
  usos: number;
}

interface CriterioRow {
  id: string;
  name: string;
  library_id: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  usos: string;
}

const alcanceDe = (r: { library_id: string | null; teacher_id: string | null }): AlcanceCriterio =>
  r.library_id ? 'biblioteca' : r.teacher_id ? 'docente' : 'plataforma';

/** El que vale cuando no se elige ninguno (y el de las notas de antes). */
export const CRITERIO_POR_DEFECTO = 'Otros';

/** Los criterios que se pueden usar en una biblioteca, segun quien pregunte. */
export async function listarCriterios(libraryId: string, userId: string): Promise<Criterio[]> {
  await requireManager(libraryId, userId);
  const { rows } = await query<CriterioRow>(
    `SELECT c.id, c.name, c.library_id, c.teacher_id, u.full_name AS teacher_name,
            (SELECT COUNT(*) FROM book_grades g WHERE g.criterion_id = c.id) AS usos
     FROM grade_criteria c
     LEFT JOIN users u ON u.id = c.teacher_id
     WHERE (c.teacher_id IS NULL AND c.library_id IS NULL)
        OR c.library_id = $1
        OR (c.library_id IS NULL AND c.teacher_id = $2)
     ORDER BY (c.teacher_id IS NOT NULL OR c.library_id IS NOT NULL), c.sort_order, c.created_at`,
    [libraryId, userId],
  );
  return rows.map((r) => {
    const alcance = alcanceDe(r);
    return {
      id: r.id,
      name: r.name,
      alcance,
      libraryId: r.library_id,
      teacherId: r.teacher_id,
      teacherName: r.teacher_name,
      // Los de la biblioteca los gestiona cualquiera de sus docentes (aqui ya lo
      // es); los "de todas mis bibliotecas", solo quien los creo.
      editable: alcance === 'biblioteca' || (alcance === 'docente' && r.teacher_id === userId),
      usos: Number(r.usos),
    };
  });
}

export interface CriterioInput {
  name: string;
  /** Solo esta biblioteca, o todas las del docente. */
  alcance: 'biblioteca' | 'todas';
}

const mismoNombre = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

export async function crearCriterio(libraryId: string, userId: string, input: CriterioInput): Promise<Criterio> {
  const visibles = await listarCriterios(libraryId, userId);
  if (visibles.some((c) => mismoNombre(c.name, input.name))) {
    throw HttpError.conflict(`Ya tienes un criterio llamado «${input.name}» en esta biblioteca`);
  }
  const { rows } = await query<{ id: string }>(
    `INSERT INTO grade_criteria (teacher_id, library_id, name)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, input.alcance === 'biblioteca' ? libraryId : null, input.name],
  );
  const creado = (await listarCriterios(libraryId, userId)).find((c) => c.id === rows[0].id);
  return creado!;
}

/** El criterio, si quien pide puede cambiarlo desde esta biblioteca. */
async function editableDesde(libraryId: string, criterionId: string, userId: string): Promise<Criterio> {
  const criterio = (await listarCriterios(libraryId, userId)).find((c) => c.id === criterionId);
  if (!criterio) throw HttpError.notFound('Criterio no encontrado');
  if (!criterio.editable) {
    throw HttpError.forbidden(
      criterio.alcance === 'plataforma'
        ? 'Los criterios Trabajos, Seguimientos y Otros son de todos y no se pueden cambiar'
        : 'Solo quien creó este criterio puede cambiarlo',
    );
  }
  return criterio;
}

export async function renombrarCriterio(
  libraryId: string,
  criterionId: string,
  userId: string,
  name: string,
): Promise<Criterio> {
  await editableDesde(libraryId, criterionId, userId);
  const visibles = await listarCriterios(libraryId, userId);
  if (visibles.some((c) => c.id !== criterionId && mismoNombre(c.name, name))) {
    throw HttpError.conflict(`Ya tienes un criterio llamado «${name}» en esta biblioteca`);
  }
  await query('UPDATE grade_criteria SET name = $2 WHERE id = $1', [criterionId, name]);
  // Las notas guardan el nombre: se cambia tambien en ellas.
  await query('UPDATE book_grades SET criterion_name = $2 WHERE criterion_id = $1', [criterionId, name]);
  return (await listarCriterios(libraryId, userId)).find((c) => c.id === criterionId)!;
}

/** Las notas que lo usaban se quedan con su nombre: no se pierde ninguna. */
export async function borrarCriterio(libraryId: string, criterionId: string, userId: string): Promise<void> {
  await editableDesde(libraryId, criterionId, userId);
  await query('DELETE FROM grade_criteria WHERE id = $1', [criterionId]);
}

/**
 * El criterio de una nota que se pone en una biblioteca. Vale uno de la
 * plataforma, uno de esa biblioteca o uno "de todas mis bibliotecas" de alguno
 * de sus docentes (asi un co-docente puede corregir la nota sin cambiarle el
 * criterio). Sin criterio, "Otros".
 */
export async function criterioParaNota(
  libraryId: string,
  userId: string,
  criterionId: string | undefined,
): Promise<{ id: string | null; name: string }> {
  if (!criterionId) {
    const { rows } = await query<{ id: string; name: string }>(
      `SELECT id, name FROM grade_criteria
       WHERE teacher_id IS NULL AND library_id IS NULL AND name = $1 LIMIT 1`,
      [CRITERIO_POR_DEFECTO],
    );
    return rows[0] ?? { id: null, name: CRITERIO_POR_DEFECTO };
  }
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM grade_criteria c
     WHERE c.id = $1
       AND (
         (c.teacher_id IS NULL AND c.library_id IS NULL)
         OR c.library_id = $2
         OR (c.library_id IS NULL AND (
               c.teacher_id = $3
            OR c.teacher_id = (SELECT owner_id FROM libraries WHERE id = $2)
            OR c.teacher_id IN (SELECT teacher_id FROM library_teachers WHERE library_id = $2)
         ))
       )`,
    [criterionId, libraryId, userId],
  );
  if (!rows[0]) throw HttpError.badRequest('Ese criterio no se puede usar en esta biblioteca');
  return rows[0];
}

/** Para el informe del alumno: quien lo pide tiene que ser el o un docente. */
export async function puedeVerInforme(libraryId: string, userId: string, studentId: string): Promise<void> {
  const access = await getAccess(libraryId, userId);
  if (access === 'student' && studentId !== userId) {
    throw HttpError.forbidden('Solo puedes ver tu propio seguimiento');
  }
}
