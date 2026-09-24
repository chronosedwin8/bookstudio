import bcrypt from 'bcryptjs';
import type pg from 'pg';
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
  /** Solo los apellidos, tal y como los da Phidias: por ahi se ordena la lista. */
  lastName: string;
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
  const ids = students.map((s) => String(s.id));
  // Por identificador de Phidias o por correo: un alumno con el correo corregido
  // a mano sigue teniendo su cuenta, aunque ya no coincida con el de Phidias.
  const { rows } = await query<{ email: string; external_id: string | null }>(
    `SELECT email, external_id FROM users
      WHERE email = ANY($1::text[])
         OR (external_source = 'phidias' AND external_id = ANY($2::text[]))`,
    [correos, ids],
  );
  const conCuenta = new Set(rows.map((r) => r.email));
  const idsConCuenta = new Set(rows.map((r) => r.external_id).filter(Boolean));

  return students
    .map((student) => ({
      id: student.id,
      fullName: fullNameOf(student),
      lastName: (student.lastname ?? '').replace(/\s+/g, ' ').trim(),
      email: student.email!.trim().toLowerCase(),
      hasAccount: idsConCuenta.has(String(student.id)) || conCuenta.has(student.email!.trim().toLowerCase()),
    }))
    .sort(porApellido);
}

/**
 * Orden de lista de clase: por apellidos, y a igualdad de apellidos por nombre.
 *
 * Phidias entrega el apellido en su propio campo, asi que no hay que adivinar
 * donde acaba el nombre. Es lo unico que funciona con apellidos de varias
 * palabras: partir "ABEL DAVID LEON VAN HEYL" por el ultimo espacio daria
 * "HEYL", y por los dos ultimos, "VAN HEYL", y ninguna de las dos es su apellido.
 *
 * `sensitivity: 'base'` hace que las tildes no descoloquen (LEON y LEÓN van
 * juntos), que es como se alfabetiza en espanol.
 */
export function porApellido(
  a: { lastName: string; fullName: string },
  b: { lastName: string; fullName: string },
): number {
  const opciones: Intl.CollatorOptions = { sensitivity: 'base' };
  const apellidos = a.lastName.localeCompare(b.lastName, 'es', opciones);
  if (apellidos !== 0) return apellidos;
  return a.fullName.localeCompare(b.fullName, 'es', opciones);
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
  /** A cuantas se les ha puesto su codigo como contrasena. */
  clavesPuestas: number;
  /** Cuentas que ya no aparecen en ninguna seccion (bajas, cambios de centro). */
  sinSeccion: number;
  /** Nombres puestos al dia desde Phidias (orden, tildes, letras dañadas). */
  nombresCorregidos: number;
  /**
   * Cuentas que ya existian por otra via (entraron con Microsoft, o se crearon a
   * mano) y cuyo correo esta en Phidias: ahora quedan vinculadas a su ficha.
   */
  vinculadas: number;
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

  // Id del alumno en Phidias -> su codigo, para poder reponer contrasenas.
  const codigos = new Map<string, string>();
  // Y la ficha entera, por id y por correo, para los nombres y los vinculos.
  const fichaPorId = new Map<string, PhidiasStudent>();
  const fichaPorCorreo = new Map<string, PhidiasStudent>();
  for (const level of levels) {
    for (const course of level.courses ?? []) {
      for (const section of course.sections ?? []) {
        for (const student of section.students ?? []) {
          codigos.set(String(student.id), codigoDe(student));
          fichaPorId.set(String(student.id), student);
          if (hasEmail(student)) fichaPorCorreo.set(student.email!.trim().toLowerCase(), student);
        }
      }
    }
  }


  const { rows } = await query<{
    id: string;
    external_id: string | null;
    external_group: string | null;
    password_is_default: boolean;
  }>(
    `SELECT id, external_id, external_group, password_is_default
     FROM users WHERE external_source = 'phidias'`,
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

  /**
   * Contrasenas: las cuentas que aun tienen la clave puesta por el sistema pasan a
   * tener su codigo de estudiante. A quien ya se puso la suya NO se le toca: seria
   * quitarle el acceso sin avisar.
   */
  let clavesPuestas = 0;
  for (const fila of rows) {
    if (!fila.password_is_default) continue;
    const codigo = fila.external_id ? codigos.get(fila.external_id) : undefined;
    if (!codigo) continue;
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      fila.id,
      await bcrypt.hash(codigo, 12),
    ]);
    clavesPuestas += 1;
  }

  /*
   * La vinculacion va DESPUES de reponer contrasenas, a proposito: una cuenta
   * vinculada ahora no debe pasar por ese bucle. Si su docente le puso una clave
   * (y quedo marcada como puesta por el sistema), cambiarsela por su codigo la
   * dejaria fuera sin avisar.
   */
  const vinculadas = await vincularPorCorreo(fichaPorCorreo, porAlumno);
  const nombresCorregidos = await corregirNombres(fichaPorId);

  return { total: rows.length, actualizadas, clavesPuestas, sinSeccion, nombresCorregidos, vinculadas };
}

/**
 * Vincula a su ficha de Phidias las cuentas de alumnado que se crearon por otra
 * via con el mismo correo.
 *
 * El caso real: alumnado que entro con su cuenta de Microsoft antes de que nadie
 * importara su seccion. Microsoft da el nombre con el que este en su directorio,
 * a veces con letras dañadas ("HENR�QUEZ"), y ningun curso. Vinculadas, se les
 * pone el nombre bueno de Phidias y su curso.
 *
 * No se toca la contrasena de estas cuentas: entraban con Microsoft y siguen
 * entrando igual. Y si otra cuenta ya lleva ese identificador de Phidias (por
 * ejemplo porque se le corrigio el correo), no se vincula: serian dos personas
 * con la misma ficha.
 */
async function vincularPorCorreo(
  fichaPorCorreo: Map<string, PhidiasStudent>,
  seccionPorId: Map<string, string>,
): Promise<number> {
  if (!fichaPorCorreo.size) return 0;

  const { rows } = await query<{ id: string; email: string }>(
    `SELECT id, email FROM users
      WHERE role = 'student'
        AND external_source IS DISTINCT FROM 'phidias'
        AND email = ANY($1::text[])`,
    [[...fichaPorCorreo.keys()]],
  );

  let vinculadas = 0;
  for (const fila of rows) {
    const ficha = fichaPorCorreo.get(fila.email);
    if (!ficha) continue;
    const { rowCount } = await query(
      `UPDATE users
          SET external_source = 'phidias', external_id = $2, external_group = COALESCE($3, external_group)
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM users otra
             WHERE otra.external_source = 'phidias' AND otra.external_id = $2 AND otra.id <> $1
          )`,
      [fila.id, String(ficha.id), seccionPorId.get(String(ficha.id)) ?? null],
    );
    vinculadas += rowCount ?? 0;
  }
  return vinculadas;
}

/**
 * Pone al dia el nombre de todo el alumnado vinculado a Phidias.
 *
 * Siempre "APELLIDOS NOMBRES" y con las tildes que da Phidias. Solo se tocan los
 * nombres que nadie ha corregido a mano, y solo si cambian de verdad.
 */
async function corregirNombres(fichaPorId: Map<string, PhidiasStudent>): Promise<number> {
  const { rows } = await query<{ id: string; external_id: string; full_name: string }>(
    `SELECT id, external_id, full_name FROM users
      WHERE external_source = 'phidias' AND external_id IS NOT NULL AND name_edited_at IS NULL`,
  );

  let corregidos = 0;
  for (const fila of rows) {
    const ficha = fichaPorId.get(fila.external_id);
    if (!ficha) continue;
    const nombre = fullNameOf(ficha).slice(0, 100);
    const { nombres, apellidos } = partesDe(ficha);
    if (nombre === fila.full_name) {
      // El nombre ya esta bien; basta con guardar las partes si faltan.
      await query(
        'UPDATE users SET given_name = $2, family_name = $3 WHERE id = $1 AND given_name IS NULL',
        [fila.id, nombres, apellidos],
      );
      continue;
    }
    await query(
      'UPDATE users SET full_name = $2, given_name = $3, family_name = $4 WHERE id = $1 AND name_edited_at IS NULL',
      [fila.id, nombre, nombres, apellidos],
    );
    corregidos += 1;
  }
  return corregidos;
}

/**
 * La cuenta de un alumno de Phidias: la que ya tiene, o una nueva.
 *
 * Se busca PRIMERO por su identificador de Phidias y solo despues por correo.
 *
 * Antes se buscaba solo por correo, y eso rompia en cuanto un docente corregia el
 * correo de un alumno (el caso real: alumnado con correo de fuera del colegio, que
 * no puede entrar con Microsoft). La siguiente importacion traia el correo viejo,
 * no encontraba a nadie con el y al insertar chocaba con el indice unico de
 * (external_source, external_id): fallaba la importacion ENTERA de la seccion.
 *
 * Tampoco se le pisa el correo: si alguien lo corrigio a mano, esa correccion
 * manda sobre lo que diga Phidias. Nombre y curso si se refrescan, porque cambian
 * cada ano y ahi Phidias es la fuente buena.
 */
export async function cuentaDeAlumno(
  client: pg.PoolClient,
  student: PhidiasStudent,
  email: string,
  seccion: string,
): Promise<{ id: string; password_is_default: boolean; inserted: boolean }> {
  const nombre = fullNameOf(student).slice(0, 100);
  const { nombres, apellidos } = partesDe(student);
  const grupo = seccion.slice(0, 60);

  // El nombre solo se refresca si nadie lo corrigio a mano (name_edited_at).
  const suya = await client.query<{ id: string; password_is_default: boolean }>(
    `UPDATE users
        SET full_name   = CASE WHEN name_edited_at IS NULL THEN $2 ELSE full_name END,
            given_name  = CASE WHEN name_edited_at IS NULL THEN $4 ELSE given_name END,
            family_name = CASE WHEN name_edited_at IS NULL THEN $5 ELSE family_name END,
            external_group = $3
      WHERE external_source = 'phidias' AND external_id = $1
      RETURNING id, password_is_default`,
    [String(student.id), nombre, grupo, nombres, apellidos],
  );
  if (suya.rows[0]) return { ...suya.rows[0], inserted: false };

  const upserted = await client.query<{ id: string; password_is_default: boolean; inserted: boolean }>(
    `INSERT INTO users (email, password_hash, full_name, role, external_source, external_id,
                        external_group, password_is_default, given_name, family_name)
     VALUES ($1, $2, $3, 'student', 'phidias', $4, $5, TRUE, $6, $7)
     ON CONFLICT (email) DO UPDATE
       SET full_name   = CASE WHEN users.name_edited_at IS NULL THEN EXCLUDED.full_name ELSE users.full_name END,
           given_name  = CASE WHEN users.name_edited_at IS NULL THEN EXCLUDED.given_name ELSE users.given_name END,
           family_name = CASE WHEN users.name_edited_at IS NULL THEN EXCLUDED.family_name ELSE users.family_name END,
           external_group = EXCLUDED.external_group
     RETURNING id, password_is_default, (xmax = 0) AS inserted`,
    [email, await bcrypt.hash(codigoDe(student), 12), nombre, String(student.id), grupo, nombres, apellidos],
  );
  return upserted.rows[0];
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

  // La clave la marca cada alumno: es su propio codigo, no una comun para todos.

  return withTransaction(async (client) => {
    const cuentas: CuentaCreada[] = [];
    for (const student of students) {
      const email = student.email!.trim().toLowerCase();

      // Si la cuenta ya existe NO se le toca la contrasena: puede haberla cambiado.
      // external_group si se refresca, porque el alumno cambia de curso cada ano.
      const fila = await cuentaDeAlumno(client, student, email, section.name);
      cuentas.push({
        id: fila.id,
        fullName: fullNameOf(student),
        email,
        // Se dice la clave solo si sirve de algo: cuenta nueva, o vieja que nunca la cambio.
        password: fila.inserted || fila.password_is_default ? codigoDe(student) : null,
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
/**
 * Contrasena inicial del alumnado: su codigo de estudiante.
 *
 * Lo pidio el centro y tiene sentido practico: es un numero que ya se saben y que
 * llevan en el carnet, asi que no hay que repartir nada. A cambio es corto y
 * adivinable, por eso la aplicacion les deja cambiarlo por uno propio.
 *
 * Phidias lo trae en `code`; si faltara, se toma del correo institucional, que es
 * el mismo numero antes de la arroba (3401@colegioaleman.edu.co).
 */
export function codigoDe(student: PhidiasStudent): string {
  if (student.code) return String(student.code);
  const local = (student.email ?? '').split('@')[0]?.trim();
  return local || String(student.id);
}

/**
 * Nombre completo, siempre como "APELLIDOS NOMBRES".
 *
 * Antes se componia al reves ("NOMBRES APELLIDOS") y el alumnado que entra con su
 * cuenta de Microsoft trae el orden contrario, asi que en una misma lista salian
 * mezclados. Apellidos primero es como se pasa lista y como se ordena.
 */
function fullNameOf(student: PhidiasStudent): string {
  const name = [student.lastname, student.firstname]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || `Alumno ${student.id}`;
}

/** Las dos partes por separado, tal como las da Phidias. */
function partesDe(student: PhidiasStudent): { nombres: string | null; apellidos: string | null } {
  const limpio = (t?: string) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || null;
  return { nombres: limpio(student.firstname), apellidos: limpio(student.lastname) };
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

  // La clave la marca cada alumno: es su propio codigo, no una comun para todos.

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

      // Si ya existe (por otra seccion, o con el correo corregido), se reutiliza.
      const user = await cuentaDeAlumno(client, student, email, section.name);
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
