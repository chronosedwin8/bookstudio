import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { generateInviteCode } from '../../lib/invite-code.js';
import {
  ensureStudentAccounts,
  isPhidiasEnabled,
  listSections,
  listSectionStudents,
} from '../phidias/phidias.service.js';
import type {
  ClassViewQuery,
  CreateLibraryInput,
  RosterQuery,
  StudentSearchQuery,
  UpdateLibraryInput,
} from './libraries.schemas.js';

export interface Library {
  id: string;
  name: string;
  codeInvite: string;
  ownerId: string;
  studentBookLimit: number;
  studentEditable: boolean;
  studentPublishable: boolean;
  commentsEnabled: boolean;
  studentsSeePeers: boolean;
  createdAt: string;
}

interface LibraryRow {
  id: string;
  name: string;
  code_invite: string;
  owner_id: string;
  student_book_limit: number;
  student_editable: boolean;
  student_publishable: boolean;
  comments_enabled: boolean;
  students_see_peers: boolean;
  created_at: Date;
}

function toLibrary(row: LibraryRow): Library {
  return {
    id: row.id,
    name: row.name,
    codeInvite: row.code_invite,
    ownerId: row.owner_id,
    studentBookLimit: row.student_book_limit,
    studentEditable: row.student_editable,
    studentPublishable: row.student_publishable,
    commentsEnabled: row.comments_enabled,
    studentsSeePeers: row.students_see_peers,
    createdAt: row.created_at.toISOString(),
  };
}

const LIBRARY_COLUMNS = `id, name, code_invite, owner_id, student_book_limit,
  student_editable, student_publishable, comments_enabled, students_see_peers, created_at`;

/** Reintenta ante colision del indice unico de code_invite. */
export async function createLibrary(ownerId: string, input: CreateLibraryInput): Promise<Library> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const { rows } = await query<LibraryRow>(
        `INSERT INTO libraries (name, code_invite, owner_id, student_book_limit,
           student_editable, student_publishable, comments_enabled, students_see_peers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${LIBRARY_COLUMNS}`,
        [
          input.name,
          generateInviteCode(5),
          ownerId,
          input.studentBookLimit,
          input.studentEditable,
          input.studentPublishable,
          input.commentsEnabled,
          input.studentsSeePeers,
        ],
      );
      return toLibrary(rows[0]);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const constraint = (error as { constraint?: string }).constraint;
      if (code === '23505' && constraint?.includes('code_invite')) continue;
      throw error;
    }
  }
  throw HttpError.conflict('No se pudo generar un codigo de invitacion unico, reintenta');
}

export async function listLibrariesForUser(userId: string): Promise<Library[]> {
  const { rows } = await query<LibraryRow>(
    `SELECT DISTINCT ${LIBRARY_COLUMNS.split(',').map((c) => `l.${c.trim()}`).join(', ')}
     FROM libraries l
     LEFT JOIN library_teachers lt ON lt.library_id = l.id
     LEFT JOIN library_students ls ON ls.library_id = l.id
     WHERE l.owner_id = $1 OR lt.teacher_id = $1 OR ls.student_id = $1
     ORDER BY l.created_at DESC`,
    [userId],
  );
  return rows.map(toLibrary);
}

export type LibraryAccess = 'owner' | 'teacher' | 'student';

export async function getAccess(libraryId: string, userId: string): Promise<LibraryAccess> {
  const { rows } = await query<{ access: LibraryAccess | null }>(
    `SELECT CASE
        WHEN l.owner_id = $2 THEN 'owner'
        WHEN lt.teacher_id IS NOT NULL THEN 'teacher'
        WHEN ls.student_id IS NOT NULL THEN 'student'
      END AS access
     FROM libraries l
     LEFT JOIN library_teachers lt ON lt.library_id = l.id AND lt.teacher_id = $2
     LEFT JOIN library_students ls ON ls.library_id = l.id AND ls.student_id = $2
     WHERE l.id = $1`,
    [libraryId, userId],
  );

  if (!rows.length) throw HttpError.notFound('Biblioteca no encontrada');
  if (!rows[0].access) throw HttpError.forbidden('No perteneces a esta biblioteca');
  return rows[0].access;
}

export async function requireManager(libraryId: string, userId: string): Promise<void> {
  const access = await getAccess(libraryId, userId);
  if (access === 'student') throw HttpError.forbidden('Solo los docentes pueden realizar esta accion');
}

export async function getLibrary(libraryId: string, userId: string): Promise<Library> {
  await getAccess(libraryId, userId);
  const { rows } = await query<LibraryRow>(`SELECT ${LIBRARY_COLUMNS} FROM libraries WHERE id = $1`, [libraryId]);
  return toLibrary(rows[0]);
}

const UPDATABLE: Record<keyof UpdateLibraryInput, string> = {
  name: 'name',
  studentBookLimit: 'student_book_limit',
  studentEditable: 'student_editable',
  studentPublishable: 'student_publishable',
  commentsEnabled: 'comments_enabled',
  studentsSeePeers: 'students_see_peers',
};

export async function updateLibrary(
  libraryId: string,
  userId: string,
  input: UpdateLibraryInput,
): Promise<Library> {
  await requireManager(libraryId, userId);

  const sets: string[] = [];
  const values: unknown[] = [libraryId];
  for (const [key, column] of Object.entries(UPDATABLE) as [keyof UpdateLibraryInput, string][]) {
    const value = input[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (!sets.length) throw HttpError.badRequest('No hay campos para actualizar');

  const { rows } = await query<LibraryRow>(
    `UPDATE libraries SET ${sets.join(', ')} WHERE id = $1 RETURNING ${LIBRARY_COLUMNS}`,
    values,
  );
  return toLibrary(rows[0]);
}

export async function deleteLibrary(libraryId: string, userId: string): Promise<void> {
  const access = await getAccess(libraryId, userId);
  if (access !== 'owner') throw HttpError.forbidden('Solo el propietario puede eliminar la biblioteca');
  await query('DELETE FROM libraries WHERE id = $1', [libraryId]);
}

export async function joinByCode(codeInvite: string, userId: string, role: string): Promise<Library> {
  const { rows } = await query<LibraryRow>(
    `SELECT ${LIBRARY_COLUMNS} FROM libraries WHERE code_invite = $1`,
    [codeInvite],
  );
  if (!rows[0]) throw HttpError.notFound('Codigo de invitacion no valido');

  const library = toLibrary(rows[0]);
  if (library.ownerId === userId) return library;

  await withTransaction(async (client) => {
    if (role === 'teacher' || role === 'admin') {
      await client.query(
        'INSERT INTO library_teachers (library_id, teacher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [library.id, userId],
      );
    } else {
      await client.query(
        'INSERT INTO library_students (library_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [library.id, userId],
      );
    }
  });

  return library;
}

export async function addCoTeacher(libraryId: string, userId: string, email: string): Promise<void> {
  const access = await getAccess(libraryId, userId);
  if (access !== 'owner') throw HttpError.forbidden('Solo el propietario puede invitar co-docentes');

  const { rows } = await query<{ id: string; role: string }>('SELECT id, role FROM users WHERE email = $1', [email]);
  if (!rows[0]) throw HttpError.notFound('No existe un usuario con ese email');
  if (rows[0].role === 'student') throw HttpError.badRequest('El usuario indicado no tiene rol docente');

  await query(
    'INSERT INTO library_teachers (library_id, teacher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [libraryId, rows[0].id],
  );
}

export async function removeCoTeacher(libraryId: string, userId: string, teacherId: string): Promise<void> {
  const access = await getAccess(libraryId, userId);
  if (access !== 'owner') throw HttpError.forbidden('Solo el propietario puede quitar co-docentes');
  await query('DELETE FROM library_teachers WHERE library_id = $1 AND teacher_id = $2', [libraryId, teacherId]);
}

export interface ClassViewEntry {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  bookCount: number;
  publishedCount: number;
  totalPages: number;
  lastActivityAt: string | null;
  books: Array<{
    id: string;
    title: string;
    layoutFormat: string;
    isPublished: boolean;
    pageCount: number;
    elementCount: number;
    updatedAt: string;
  }>;
}

export interface ClassView {
  items: ClassViewEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ClassViewRow {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  book_count: string;
  published_count: string;
  total_pages: string;
  last_activity_at: Date | null;
  books: ClassViewEntry['books'] | null;
  total_count: string;
}

/** Cuadricula de control de aula resuelta en una sola consulta paginada. */
export async function getClassView(
  libraryId: string,
  userId: string,
  { page, pageSize, search }: ClassViewQuery,
): Promise<ClassView> {
  await requireManager(libraryId, userId);

  const { rows } = await query<ClassViewRow>(
    `WITH enrolled AS (
        SELECT u.id, u.full_name, u.avatar_url
        FROM library_students ls
        JOIN users u ON u.id = ls.student_id
        WHERE ls.library_id = $1
          AND ($2::text IS NULL OR u.full_name ILIKE '%' || $2 || '%')
     ),
     book_stats AS (
        SELECT b.id, b.creator_id, b.title, b.layout_format, b.is_published, b.updated_at,
               COUNT(DISTINCT p.id) AS page_count,
               COUNT(ce.id) AS element_count
        FROM books b
        LEFT JOIN pages p ON p.book_id = b.id
        LEFT JOIN canvas_elements ce ON ce.page_id = p.id
        WHERE b.library_id = $1
        GROUP BY b.id
     ),
     aggregated AS (
        SELECT e.id AS student_id, e.full_name AS student_name, e.avatar_url,
               COUNT(bs.id) AS book_count,
               COUNT(bs.id) FILTER (WHERE bs.is_published) AS published_count,
               COALESCE(SUM(bs.page_count), 0) AS total_pages,
               MAX(bs.updated_at) AS last_activity_at,
               COALESCE(
                 JSON_AGG(
                   JSON_BUILD_OBJECT(
                     'id', bs.id, 'title', bs.title, 'layoutFormat', bs.layout_format,
                     'isPublished', bs.is_published, 'pageCount', bs.page_count,
                     'elementCount', bs.element_count, 'updatedAt', bs.updated_at
                   ) ORDER BY bs.updated_at DESC
                 ) FILTER (WHERE bs.id IS NOT NULL), '[]'
               ) AS books
        FROM enrolled e
        LEFT JOIN book_stats bs ON bs.creator_id = e.id
        GROUP BY e.id, e.full_name, e.avatar_url
     )
     SELECT *, COUNT(*) OVER() AS total_count
     FROM aggregated
     ORDER BY student_name
     LIMIT $3 OFFSET $4`,
    [libraryId, search ?? null, pageSize, (page - 1) * pageSize],
  );

  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    items: rows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      avatarUrl: row.avatar_url,
      bookCount: Number(row.book_count),
      publishedCount: Number(row.published_count),
      totalPages: Number(row.total_pages),
      lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
      books: row.books ?? [],
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface StudentSearchResult {
  id: string;
  fullName: string;
  email: string | null;
  /** Bibliotecas a las que ya pertenece: sirve para reconocer de que curso es. */
  libraries: string[];
  alreadyIn: boolean;
}

/**
 * Busca alumnado de todo el centro para sumarlo a una biblioteca.
 *
 * Una biblioteca puede reunir alumnado de cursos distintos, asi que la busqueda no se
 * limita a los grupos de quien pregunta. A cambio se exige ser docente de la
 * biblioteca destino, se filtra por rol y se acotan los resultados: es un buscador
 * para anadir a alguien concreto, no un volcado del listado del colegio.
 */
export async function searchStudents(
  libraryId: string,
  userId: string,
  { q, limit }: StudentSearchQuery,
): Promise<StudentSearchResult[]> {
  await requireManager(libraryId, userId);

  const { rows } = await query<{
    id: string;
    full_name: string;
    email: string | null;
    libraries: string[] | null;
    already_in: boolean;
  }>(
    `SELECT u.id, u.full_name, u.email,
            ARRAY(
              SELECT l.name FROM library_students ls2
              JOIN libraries l ON l.id = ls2.library_id
              WHERE ls2.student_id = u.id
              ORDER BY l.name
            ) AS libraries,
            EXISTS (
              SELECT 1 FROM library_students ls
              WHERE ls.student_id = u.id AND ls.library_id = $1
            ) AS already_in
     FROM users u
     WHERE u.role = 'student'
       AND u.is_active
       AND (u.full_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
     ORDER BY u.full_name
     LIMIT $3`,
    [libraryId, q, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    libraries: r.libraries ?? [],
    alreadyIn: r.already_in,
  }));
}

export interface GrupoOrigen {
  kind: 'library' | 'phidias';
  id: string;
  name: string;
  studentCount: number;
}

/**
 * Grupos de los que se puede sacar alumnado: los cursos ya creados en BookStudio y
 * las secciones del sistema academico.
 *
 * Es lo que permite armar una biblioteca con cinco de 10A y seis de 10B: se elige el
 * grupo, se ve su lista y se marca a quien haga falta.
 */
export async function listSourceGroups(libraryId: string, userId: string): Promise<GrupoOrigen[]> {
  await requireManager(libraryId, userId);

  const { rows } = await query<{ id: string; name: string; total: string }>(
    `SELECT l.id, l.name, COUNT(ls.student_id) AS total
     FROM libraries l
     LEFT JOIN library_students ls ON ls.library_id = l.id
     WHERE l.id <> $1
     GROUP BY l.id, l.name
     HAVING COUNT(ls.student_id) > 0
     ORDER BY l.name`,
    [libraryId],
  );

  const grupos: GrupoOrigen[] = rows.map((r) => ({
    kind: 'library',
    id: r.id,
    name: r.name,
    studentCount: Number(r.total),
  }));

  // Las secciones de Phidias se suman si la integracion esta configurada. Que falle
  // no debe dejar sin usar los grupos que ya estan en BookStudio.
  if (isPhidiasEnabled()) {
    try {
      const secciones = await listSections();
      for (const s of secciones) {
        grupos.push({ kind: 'phidias', id: String(s.id), name: s.name, studentCount: s.studentCount });
      }
    } catch {
      // Phidias caido: se sigue con lo local.
    }
  }

  return grupos;
}

export interface Candidato {
  /** uuid de la cuenta, o "phidias:<id>" si todavia hay que crearla. */
  key: string;
  fullName: string;
  email: string | null;
  alreadyIn: boolean;
  hasAccount: boolean;
}

/** Lista completa de un grupo, marcando a quien ya esta en la biblioteca. */
export async function getRoster(
  libraryId: string,
  userId: string,
  { kind, id }: RosterQuery,
): Promise<Candidato[]> {
  await requireManager(libraryId, userId);

  const yaEstan = await query<{ student_id: string; email: string | null }>(
    `SELECT ls.student_id, u.email FROM library_students ls
     JOIN users u ON u.id = ls.student_id
     WHERE ls.library_id = $1`,
    [libraryId],
  );
  const idsDentro = new Set(yaEstan.rows.map((r) => r.student_id));
  const correosDentro = new Set(yaEstan.rows.map((r) => r.email).filter(Boolean));

  if (kind === 'library') {
    const { rows } = await query<{ id: string; full_name: string; email: string | null }>(
      `SELECT u.id, u.full_name, u.email
       FROM library_students ls JOIN users u ON u.id = ls.student_id
       WHERE ls.library_id = $1 AND u.role = 'student' AND u.is_active
       ORDER BY u.full_name`,
      [id],
    );
    return rows.map((r) => ({
      key: r.id,
      fullName: r.full_name,
      email: r.email,
      alreadyIn: idsDentro.has(r.id),
      hasAccount: true,
    }));
  }

  const seccion = Number(id);
  if (!Number.isInteger(seccion)) throw HttpError.badRequest('Seccion de Phidias no valida');

  const alumnos = await listSectionStudents(seccion);
  // La clave lleva la seccion: sin ella habria que recorrer todo el colegio para
  // volver a encontrar al alumno cuando toque crearle la cuenta.
  return alumnos.map((a) => ({
    key: `phidias:${seccion}:${a.id}`,
    fullName: a.fullName,
    email: a.email,
    alreadyIn: correosDentro.has(a.email),
    hasAccount: a.hasAccount,
  }));
}

/**
 * Suma alumnado a la biblioteca. Las claves pueden ser uuid de cuentas existentes o
 * "phidias:<id>", en cuyo caso la cuenta se crea antes. Repetir a alguien no da error.
 */
export interface ClaveEntregada {
  fullName: string;
  email: string;
  password: string;
  isNew: boolean;
}

export async function addStudents(
  libraryId: string,
  userId: string,
  keys: string[],
): Promise<{
  added: number;
  skipped: number;
  accountsCreated: number;
  /** A quien hay que darle una clave, y cual. Vacio si nadie la necesita. */
  credentials: ClaveEntregada[];
}> {
  await requireManager(libraryId, userId);

  const uuids: string[] = [];
  // Agrupadas por seccion: una sola consulta a Phidias por grupo, no una por alumno.
  const porSeccion = new Map<number, number[]>();

  for (const clave of keys) {
    if (!clave.startsWith('phidias:')) {
      uuids.push(clave);
      continue;
    }
    const [, seccion, alumno] = clave.split(':');
    const idSeccion = Number(seccion);
    const idAlumno = Number(alumno);
    if (!Number.isInteger(idSeccion) || !Number.isInteger(idAlumno)) continue;
    porSeccion.set(idSeccion, [...(porSeccion.get(idSeccion) ?? []), idAlumno]);
  }

  const ids: string[] = [];

  if (uuids.length) {
    // Solo cuentas de alumnado: sin esto se podria colar a un docente como alumno y
    // dejarle los permisos de la biblioteca al reves.
    const validos = await query<{ id: string }>(
      `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'student' AND is_active`,
      [uuids],
    );
    ids.push(...validos.rows.map((r) => r.id));
  }

  let accountsCreated = 0;
  const credentials: ClaveEntregada[] = [];

  for (const [seccion, alumnos] of porSeccion) {
    const cuentas = await ensureStudentAccounts(seccion, alumnos);
    for (const c of cuentas) {
      ids.push(c.id);
      if (c.isNew) accountsCreated += 1;
      // Solo se reparte clave a quien la necesita: los que ya se pusieron la suya
      // no aparecen, y asi el docente no le entrega una que no funciona.
      if (c.password) {
        credentials.push({ fullName: c.fullName, email: c.email, password: c.password, isNew: c.isNew });
      }
    }
  }

  if (!ids.length) throw HttpError.badRequest('Ninguna de las cuentas indicadas es de alumnado activo');

  const { rowCount } = await query(
    `INSERT INTO library_students (library_id, student_id, added_by)
     SELECT $1, unnest($2::uuid[]), $3
     ON CONFLICT DO NOTHING`,
    [libraryId, ids, userId],
  );

  return {
    added: rowCount ?? 0,
    skipped: keys.length - (rowCount ?? 0),
    accountsCreated,
    credentials,
  };
}

/**
 * Borra varios libros de la biblioteca de una vez.
 *
 * Los ids van explicitos: no existe un "borra todo" que pueda dispararse por error.
 * Solo se tocan libros de esta biblioteca, y solo puede hacerlo quien la dirige.
 * Las paginas y los elementos caen con el libro por las claves foraneas.
 */
export async function bulkDeleteBooks(
  libraryId: string,
  userId: string,
  bookIds: string[],
): Promise<{ deleted: number; ignored: number }> {
  await requireManager(libraryId, userId);

  const { rowCount } = await query(
    'DELETE FROM books WHERE library_id = $1 AND id = ANY($2::uuid[])',
    [libraryId, bookIds],
  );

  const borrados = rowCount ?? 0;
  return { deleted: borrados, ignored: bookIds.length - borrados };
}

/**
 * Saca a un alumno de la biblioteca. Sus libros se quedan donde estan: borrarlos
 * seria destruir su trabajo por un cambio de matricula.
 */
export async function removeStudent(libraryId: string, userId: string, studentId: string): Promise<void> {
  await requireManager(libraryId, userId);
  await query('DELETE FROM library_students WHERE library_id = $1 AND student_id = $2', [libraryId, studentId]);
}

export interface LibraryMember {
  id: string;
  fullName: string;
  email: string;
  /** Clase de origen del sistema academico; null si no viene de ninguna. */
  course?: string | null;
}

export interface LibraryMembers {
  owner: LibraryMember;
  teachers: LibraryMember[];
  students: LibraryMember[];
}

export async function getMembers(libraryId: string, userId: string): Promise<LibraryMembers> {
  await getAccess(libraryId, userId);

  const { rows } = await query<{
    id: string;
    full_name: string;
    email: string;
    membership: string;
    course: string | null;
  }>(
    // El curso solo tiene sentido para el alumnado, y sale de su clase traida del
    // sistema academico: una biblioteca puede mezclar grupos y hay que distinguirlos.
    `SELECT u.id, u.full_name, u.email, 'owner' AS membership, NULL::varchar AS course
       FROM libraries l JOIN users u ON u.id = l.owner_id WHERE l.id = $1
     UNION ALL
     SELECT u.id, u.full_name, u.email, 'teacher', NULL::varchar
       FROM library_teachers lt JOIN users u ON u.id = lt.teacher_id WHERE lt.library_id = $1
     UNION ALL
     SELECT u.id, u.full_name, u.email, 'student', u.external_group
       FROM library_students ls JOIN users u ON u.id = ls.student_id WHERE ls.library_id = $1
     ORDER BY 4, 2`,
    [libraryId],
  );

  const map = (m: string): LibraryMember[] =>
    rows
      .filter((r) => r.membership === m)
      .map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, course: r.course }));

  const [owner] = map('owner');
  return { owner, teachers: map('teacher'), students: map('student') };
}
