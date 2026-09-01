import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { generateInviteCode } from '../../lib/invite-code.js';

/**
 * Integracion con Phidias (sistema academico del colegio).
 *
 * Vive en el backend a proposito: el token es un JWT de larga duracion con acceso a
 * datos personales de menores. Si se llamara desde el navegador estaria en el codigo
 * de cada alumno, y ademas habria que sortear CORS con proxies de terceros, que es
 * justo lo que no se debe hacer con datos de este tipo.
 */

const REQUEST_TIMEOUT_MS = 60_000;
/** La respuesta de matriculas ronda los 2 MB. */
const CACHE_TTL_MS = 5 * 60_000;

export interface PhidiasStudent {
  id: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  code?: number;
}

interface PhidiasSection {
  id: number;
  name: string;
  students?: PhidiasStudent[];
}

interface PhidiasCourse {
  id: number;
  name: string;
  sections?: PhidiasSection[];
}

interface PhidiasLevel {
  id: number;
  name: string;
  courses?: PhidiasCourse[];
}

/** Seccion aplanada, que es lo que el docente elige en pantalla. */
export interface SectionSummary {
  id: number;
  name: string;
  course: string;
  level: string;
  studentCount: number;
  /** Alumnos sin correo institucional: no se pueden importar con acceso propio. */
  withoutEmail: number;
}

export function isPhidiasEnabled(): boolean {
  return env.PHIDIAS_TOKEN.length > 0;
}

let cache: { at: number; data: PhidiasLevel[] } | null = null;

/** Descarga (y cachea) el consolidado de matriculas. */
async function fetchConsolidate(): Promise<PhidiasLevel[]> {
  if (!isPhidiasEnabled()) {
    throw HttpError.badRequest('La integración con Phidias no está configurada en el servidor');
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const pedir = () =>
    fetch(`${env.PHIDIAS_BASE_URL}/1/course/consolidate`, {
      headers: {
        Authorization: `Bearer ${env.PHIDIAS_TOKEN}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

  try {
    let response: Response;
    try {
      response = await pedir();
    } catch (first) {
      // Un corte puntual de red no debe frustrar la importacion: se reintenta una vez.
      if ((first as Error).name === 'AbortError') throw first;
      await new Promise((resolve) => setTimeout(resolve, 800));
      response = await pedir();
    }

    if (response.status === 401 || response.status === 403) {
      throw new HttpError(502, 'Phidias rechazo el token configurado', 'PHIDIAS_UNAUTHORIZED');
    }
    if (!response.ok) {
      throw new HttpError(502, `Phidias respondio ${response.status}`, 'PHIDIAS_ERROR');
    }

    const data = (await response.json()) as PhidiasLevel[];
    if (!Array.isArray(data)) throw new HttpError(502, 'Phidias devolvio un formato inesperado', 'PHIDIAS_ERROR');

    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new HttpError(504, 'Phidias tardo demasiado en responder', 'PHIDIAS_TIMEOUT');
    }
    throw new HttpError(502, 'No se pudo contactar con Phidias', 'PHIDIAS_UNREACHABLE');
  } finally {
    clearTimeout(timeout);
  }
}

const hasEmail = (student: PhidiasStudent): boolean => Boolean(student.email?.includes('@'));

/** Aplana niveles -> cursos -> secciones en la lista que se muestra al docente. */
export async function listSections(): Promise<SectionSummary[]> {
  const levels = await fetchConsolidate();
  const sections: SectionSummary[] = [];

  for (const level of levels) {
    for (const course of level.courses ?? []) {
      for (const section of course.sections ?? []) {
        const students = section.students ?? [];
        sections.push({
          id: section.id,
          name: section.name,
          course: course.name,
          level: level.name,
          studentCount: students.length,
          withoutEmail: students.filter((student) => !hasEmail(student)).length,
        });
      }
    }
  }

  return sections.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function findSection(sectionId: number): Promise<{ section: PhidiasSection; course: string; level: string }> {
  const levels = await fetchConsolidate();
  for (const level of levels) {
    for (const course of level.courses ?? []) {
      for (const section of course.sections ?? []) {
        if (section.id === sectionId) return { section, course: course.name, level: level.name };
      }
    }
  }
  throw HttpError.notFound('Esa sección no existe en Phidias');
}

export interface SectionStudent {
  /** Id del alumno en Phidias. */
  id: number;
  fullName: string;
  email: string;
  /** Ya tiene cuenta en BookStudio. */
  hasAccount: boolean;
}

/**
 * Alumnado de una seccion, para poder elegir a unos pocos.
 *
 * Importar la seccion entera sirve cuando la biblioteca es la clase; para armar una
 * biblioteca con cinco de 10A y seis de 10B hace falta ver la lista y marcar.
 */
export async function listSectionStudents(sectionId: number): Promise<SectionStudent[]> {
  const { section } = await findSection(sectionId);
  const students = (section.students ?? []).filter(hasEmail);
  if (!students.length) return [];

  const correos = students.map((s) => s.email!.trim().toLowerCase());
  const { rows } = await query<{ email: string }>(
    'SELECT email FROM users WHERE email = ANY($1::text[])',
    [correos],
  );
  const conCuenta = new Set(rows.map((r) => r.email));

  return students
    .map((student) => ({
      id: student.id,
      fullName: fullNameOf(student),
      email: student.email!.trim().toLowerCase(),
      hasAccount: conCuenta.has(student.email!.trim().toLowerCase()),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}

/**
 * Crea (o reutiliza) las cuentas de unos alumnos concretos de una seccion y devuelve
 * sus ids. No inscribe en ninguna biblioteca: de eso se encarga quien llama.
 */
export interface SincronizacionGrupos {
  /** Cuentas de Phidias que hay en BookStudio. */
  total: number;
  /** A cuantas se les ha puesto o corregido el curso. */
  actualizadas: number;
  /** Cuentas que ya no aparecen en ninguna seccion (bajas, cambios de centro). */
  sinSeccion: number;
}

/**
 * Pone al dia el curso de todo el alumnado traido de Phidias.
 *
 * Hace falta por dos motivos. Uno: las cuentas creadas antes de que se guardara el
 * curso no lo tienen, y sin el los libros no dicen de que grupo es cada trabajo. Dos:
 * el curso cambia cada ano, asi que esto hay que poder repetirlo.
 *
 * Se resuelve con una sola lectura de Phidias y una consulta por seccion, en vez de
 * preguntar alumno por alumno.
 */
export async function syncGroups(): Promise<SincronizacionGrupos> {
  const levels = await fetchConsolidate();

  // Id del alumno en Phidias -> nombre de su seccion.
  const porAlumno = new Map<string, string>();
  for (const level of levels) {
    for (const course of level.courses ?? []) {
      for (const section of course.sections ?? []) {
        for (const student of section.students ?? []) {
          porAlumno.set(String(student.id), section.name.slice(0, 60));
        }
      }
    }
  }

  const { rows } = await query<{ id: string; external_id: string | null; external_group: string | null }>(
    "SELECT id, external_id, external_group FROM users WHERE external_source = 'phidias'",
  );

  // Se agrupan por seccion para actualizar de una vez todos los de cada curso.
  const porSeccion = new Map<string, string[]>();
  let sinSeccion = 0;

  for (const fila of rows) {
    const seccion = fila.external_id ? porAlumno.get(fila.external_id) : undefined;
    if (!seccion) {
      sinSeccion += 1;
      continue;
    }
    if (fila.external_group === seccion) continue;
    porSeccion.set(seccion, [...(porSeccion.get(seccion) ?? []), fila.id]);
  }

  let actualizadas = 0;
  for (const [seccion, ids] of porSeccion) {
    const { rowCount } = await query('UPDATE users SET external_group = $1 WHERE id = ANY($2::uuid[])', [
      seccion,
      ids,
    ]);
    actualizadas += rowCount ?? 0;
  }

  return { total: rows.length, actualizadas, sinSeccion };
}

export interface CuentaCreada {
  id: string;
  fullName: string;
  email: string;
  /** Solo cuando la cuenta es nueva o sigue con la clave inicial. */
  password: string | null;
  isNew: boolean;
}

export async function ensureStudentAccounts(
  sectionId: number,
  studentIds: number[],
): Promise<CuentaCreada[]> {
  const { section } = await findSection(sectionId);
  const pedidos = new Set(studentIds);
  const students = (section.students ?? []).filter((s) => hasEmail(s) && pedidos.has(s.id));
  if (!students.length) return [];

  const passwordHash = await bcrypt.hash(env.PHIDIAS_DEFAULT_PASSWORD, 12);

  return withTransaction(async (client) => {
    const cuentas: CuentaCreada[] = [];
    for (const student of students) {
      const email = student.email!.trim().toLowerCase();

      // Si la cuenta ya existe NO se le toca la contrasena: puede haberla cambiado.
      // external_group si se refresca, porque el alumno cambia de curso cada ano.
      const upserted = await client.query<{ id: string; password_is_default: boolean; inserted: boolean }>(
        `INSERT INTO users (email, password_hash, full_name, role, external_source, external_id,
                            external_group, password_is_default)
         VALUES ($1, $2, $3, 'student', 'phidias', $4, $5, TRUE)
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               external_group = EXCLUDED.external_group
         RETURNING id, password_is_default, (xmax = 0) AS inserted`,
        [
          email,
          passwordHash,
          fullNameOf(student).slice(0, 100),
          String(student.id),
          section.name.slice(0, 60),
        ],
      );

      const fila = upserted.rows[0];
      cuentas.push({
        id: fila.id,
        fullName: fullNameOf(student),
        email,
        // Se dice la clave solo si sirve de algo: cuenta nueva, o vieja que nunca la cambio.
        password: fila.inserted || fila.password_is_default ? env.PHIDIAS_DEFAULT_PASSWORD : null,
        isNew: fila.inserted,
      });

      await client.query(
        `INSERT INTO student_portfolios (student_id, name)
         VALUES ($1, $2) ON CONFLICT (student_id) DO NOTHING`,
        [fila.id, `Portafolio de ${fullNameOf(student)}`.slice(0, 150)],
      );
    }
    return cuentas;
  });
}

export interface ImportResult {
  libraryId: string;
  libraryName: string;
  codeInvite: string;
  created: number;
  reused: number;
  enrolled: number;
  skipped: number;
}

/** Nombre presentable a partir de los campos sueltos de Phidias. */
function fullNameOf(student: PhidiasStudent): string {
  const name = [student.firstname, student.lastname]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || `Alumno ${student.id}`;
}

/** Comprueba que quien importa administra de verdad la biblioteca de destino. */
async function assertManagesLibrary(libraryId: string, userId: string): Promise<void> {
  const { rowCount } = await query(
    `SELECT 1 FROM libraries l
     LEFT JOIN library_teachers lt ON lt.library_id = l.id AND lt.teacher_id = $2
     WHERE l.id = $1 AND (l.owner_id = $2 OR lt.teacher_id IS NOT NULL)`,
    [libraryId, userId],
  );
  if (!rowCount) throw HttpError.forbidden('No administras esa biblioteca');
}

/**
 * Da de alta a los alumnos de una seccion de Phidias.
 *
 * Sin `targetLibraryId` crea (o reutiliza) la biblioteca de esa seccion; con el,
 * vuelca los alumnos en una biblioteca que el docente ya tenia.
 *
 * Es idempotente: repetir la importacion no duplica usuarios ni matriculas, solo
 * incorpora a quien haya llegado nuevo.
 */
export async function importSection(
  sectionId: number,
  ownerId: string,
  targetLibraryId?: string,
): Promise<ImportResult> {
  const { section, course, level } = await findSection(sectionId);
  const students = (section.students ?? []).filter(hasEmail);
  const skipped = (section.students ?? []).length - students.length;

  const passwordHash = await bcrypt.hash(env.PHIDIAS_DEFAULT_PASSWORD, 12);

  if (targetLibraryId) await assertManagesLibrary(targetLibraryId, ownerId);

  return withTransaction(async (client) => {
    // Con destino explicito no se crea nada: solo se inscriben los alumnos.
    const existing = targetLibraryId
      ? await client.query<{ id: string; name: string; code_invite: string }>(
          'SELECT id, name, code_invite FROM libraries WHERE id = $1',
          [targetLibraryId],
        )
      : // Sin destino, la biblioteca se identifica por la seccion de origen.
        await client.query<{ id: string; name: string; code_invite: string }>(
          `SELECT id, name, code_invite FROM libraries
           WHERE external_source = 'phidias' AND external_id = $1`,
          [String(sectionId)],
        );

    let library = existing.rows[0];
    if (!library) {
      const inserted = await client.query<{ id: string; name: string; code_invite: string }>(
        `INSERT INTO libraries (name, code_invite, owner_id, external_source, external_id)
         VALUES ($1, $2, $3, 'phidias', $4)
         RETURNING id, name, code_invite`,
        [`${section.name} - ${course}`.slice(0, 100), generateInviteCode(5), ownerId, String(sectionId)],
      );
      library = inserted.rows[0];
    }

    let created = 0;
    let reused = 0;
    let enrolled = 0;

    for (const student of students) {
      const email = student.email!.trim().toLowerCase();

      // ON CONFLICT sobre el email: si ya existe (por otra seccion), se reutiliza.
      const upserted = await client.query<{ id: string; inserted: boolean }>(
        `INSERT INTO users (email, password_hash, full_name, role, external_source, external_id,
                            external_group, password_is_default)
         VALUES ($1, $2, $3, 'student', 'phidias', $4, $5, TRUE)
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               external_group = EXCLUDED.external_group
         RETURNING id, (xmax = 0) AS inserted`,
        [
          email,
          passwordHash,
          fullNameOf(student).slice(0, 100),
          String(student.id),
          section.name.slice(0, 60),
        ],
      );

      const user = upserted.rows[0];
      if (user.inserted) created += 1;
      else reused += 1;

      const enrollment = await client.query(
        `INSERT INTO library_students (library_id, student_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [library.id, user.id],
      );
      if (enrollment.rowCount) enrolled += 1;

      await client.query(
        `INSERT INTO student_portfolios (student_id, name)
         VALUES ($1, $2) ON CONFLICT (student_id) DO NOTHING`,
        [user.id, `Portafolio de ${fullNameOf(student)}`.slice(0, 150)],
      );
    }

    return {
      libraryId: library.id,
      libraryName: library.name,
      codeInvite: library.code_invite,
      created,
      reused,
      enrolled,
      skipped,
    };
  });
}

/** Vacia la cache; util tras un cambio de matriculas en Phidias. */
export function clearCache(): void {
  cache = null;
}
