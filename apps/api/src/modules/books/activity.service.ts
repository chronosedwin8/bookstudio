import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess, requireManager } from '../libraries/libraries.service.js';

/**
 * Bitacora de trabajo sobre un libro.
 *
 * El editor avisa al abrirse y luego cada minuto. El servidor no guarda un evento por
 * aviso: alarga la sesion en curso. Cuando pasa mas de HUECO_MINUTOS sin noticias, el
 * siguiente aviso empieza una sesion nueva.
 *
 * Esa es la diferencia entre medir tiempo de trabajo y medir pestanas olvidadas: si
 * alguien deja el libro abierto y se va, su sesion deja de crecer en cuanto el
 * navegador se duerme o se cierra.
 */

/** Sin avisos durante este rato, la proxima visita cuenta como sesion nueva. */
const HUECO_MINUTOS = 5;

export interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  role: string;
  startedAt: string;
  lastSeenAt: string;
  /** Segundos entre el primer y el ultimo aviso de la sesion. */
  durationSeconds: number;
  /** Lo que se hizo en la sesion. */
  hecho: Hecho;
}

/** Recuento de lo realizado: elementos y paginas. */
export interface Hecho {
  elementsCreated: number;
  elementsEdited: number;
  elementsDeleted: number;
  pagesAdded: number;
  pagesDeleted: number;
}

/** Que se cuenta en cada tipo de cambio (columna de book_sessions). */
export type Cambio = 'elements_created' | 'elements_edited' | 'elements_deleted' | 'pages_added' | 'pages_deleted';
const CAMBIOS: ReadonlySet<Cambio> = new Set(['elements_created', 'elements_edited', 'elements_deleted', 'pages_added', 'pages_deleted']);

const hechoDe = (r: {
  elements_created: number;
  elements_edited: number;
  elements_deleted: number;
  pages_added: number;
  pages_deleted: number;
}): Hecho => ({
  elementsCreated: Number(r.elements_created ?? 0),
  elementsEdited: Number(r.elements_edited ?? 0),
  elementsDeleted: Number(r.elements_deleted ?? 0),
  pagesAdded: Number(r.pages_added ?? 0),
  pagesDeleted: Number(r.pages_deleted ?? 0),
});

export interface BookActivity {
  sessions: WorkSession[];
  /** Resumen por persona, que es lo que se mira primero. */
  people: Array<{
    userId: string;
    userName: string;
    role: string;
    sessions: number;
    totalSeconds: number;
    firstAt: string;
    lastAt: string;
    hecho: Hecho;
  }>;
}

async function contexto(bookId: string, userId: string): Promise<{ libraryId: string | null; isManager: boolean; creatorId: string | null }> {
  const { rows } = await query<{ library_id: string | null; creator_id: string | null }>(
    'SELECT library_id, creator_id FROM books WHERE id = $1',
    [bookId],
  );
  if (!rows[0]) throw HttpError.notFound('Libro no encontrado');

  const { library_id: libraryId, creator_id: creatorId } = rows[0];
  if (!libraryId) {
    // Libro personal: solo su autor trabaja en el (y la administracion lo ve todo).
    const admin = await query<{ es: boolean }>(`SELECT role = 'admin' AS es FROM users WHERE id = $1`, [userId]);
    if (creatorId !== userId && !admin.rows[0]?.es) throw HttpError.notFound('Libro no encontrado');
    return { libraryId: null, isManager: Boolean(admin.rows[0]?.es), creatorId };
  }

  const access = await getAccess(libraryId, userId);
  return { libraryId, isManager: access !== 'student', creatorId };
}

/**
 * Apunta un cambio en la sesion en curso de esa persona en ese libro (o abre una,
 * si no hay). Lo llaman las rutas que crean, cambian o borran contenido.
 *
 * Nunca debe romper la peticion que lo provoca: si falla, se pierde un recuento,
 * no el trabajo. Por eso no lanza.
 */
export async function registrar(bookId: string, userId: string, cambio: Cambio, cuantos = 1): Promise<void> {
  if (!CAMBIOS.has(cambio) || cuantos <= 0) return;
  try {
    const alargada = await query(
      `UPDATE book_sessions
       SET last_seen_at = CURRENT_TIMESTAMP, ${cambio} = ${cambio} + $3
       WHERE id = (
         SELECT id FROM book_sessions
         WHERE book_id = $1 AND user_id = $2
           AND last_seen_at > CURRENT_TIMESTAMP - ($4 || ' minutes')::interval
         ORDER BY last_seen_at DESC
         LIMIT 1
       )`,
      [bookId, userId, cuantos, HUECO_MINUTOS],
    );
    if (!alargada.rowCount) {
      await query(`INSERT INTO book_sessions (book_id, user_id, ${cambio}) VALUES ($1, $2, $3)`, [bookId, userId, cuantos]);
    }
  } catch {
    // Un recuento perdido no justifica fallar el guardado.
  }
}

/**
 * Registra que alguien sigue trabajando. Devuelve la sesion vigente.
 *
 * Es idempotente dentro de la ventana: llamarlo cada minuto durante media hora deja
 * una sola sesion de treinta minutos, no treinta sesiones.
 */
export async function touch(bookId: string, userId: string): Promise<{ sessionId: string; startedAt: string }> {
  await contexto(bookId, userId);

  const alargada = await query<{ id: string; started_at: Date }>(
    `UPDATE book_sessions
     SET last_seen_at = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id FROM book_sessions
       WHERE book_id = $1 AND user_id = $2
         AND last_seen_at > CURRENT_TIMESTAMP - ($3 || ' minutes')::interval
       ORDER BY last_seen_at DESC
       LIMIT 1
     )
     RETURNING id, started_at`,
    [bookId, userId, HUECO_MINUTOS],
  );

  if (alargada.rows[0]) {
    return { sessionId: alargada.rows[0].id, startedAt: alargada.rows[0].started_at.toISOString() };
  }

  const nueva = await query<{ id: string; started_at: Date }>(
    'INSERT INTO book_sessions (book_id, user_id) VALUES ($1, $2) RETURNING id, started_at',
    [bookId, userId],
  );
  return { sessionId: nueva.rows[0].id, startedAt: nueva.rows[0].started_at.toISOString() };
}

/**
 * Bitacora completa del libro.
 *
 * La ve el profesorado. Un alumno solo puede consultar la de sus propios libros: es
 * su actividad, pero la de sus companeros no le corresponde.
 */
export async function listActivity(bookId: string, userId: string): Promise<BookActivity> {
  const { isManager, creatorId } = await contexto(bookId, userId);
  if (!isManager && creatorId !== userId) {
    throw HttpError.forbidden('Solo puedes ver la bitacora de tus propios libros');
  }

  const { rows } = await query<{
    id: string;
    user_id: string;
    user_name: string;
    role: string;
    started_at: Date;
    last_seen_at: Date;
    elements_created: number;
    elements_edited: number;
    elements_deleted: number;
    pages_added: number;
    pages_deleted: number;
  }>(
    `SELECT s.id, s.user_id, u.full_name AS user_name, u.role, s.started_at, s.last_seen_at,
            s.elements_created, s.elements_edited, s.elements_deleted, s.pages_added, s.pages_deleted
     FROM book_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.book_id = $1
     ORDER BY s.started_at DESC`,
    [bookId],
  );

  const sessions: WorkSession[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    role: r.role,
    startedAt: r.started_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    durationSeconds: Math.max(0, Math.round((r.last_seen_at.getTime() - r.started_at.getTime()) / 1000)),
    hecho: hechoDe(r),
  }));

  const porPersona = new Map<string, BookActivity['people'][number]>();
  for (const s of sessions) {
    const actual = porPersona.get(s.userId);
    if (!actual) {
      porPersona.set(s.userId, {
        userId: s.userId,
        userName: s.userName,
        role: s.role,
        sessions: 1,
        totalSeconds: s.durationSeconds,
        firstAt: s.startedAt,
        lastAt: s.lastSeenAt,
        hecho: { ...s.hecho },
      });
      continue;
    }
    actual.sessions += 1;
    actual.totalSeconds += s.durationSeconds;
    sumar(actual.hecho, s.hecho);
    // Las sesiones vienen de mas nueva a mas vieja: la primera es siempre la ultima.
    if (s.startedAt < actual.firstAt) actual.firstAt = s.startedAt;
  }

  return {
    sessions,
    people: [...porPersona.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
  };
}

function sumar(total: Hecho, mas: Hecho): void {
  total.elementsCreated += mas.elementsCreated;
  total.elementsEdited += mas.elementsEdited;
  total.elementsDeleted += mas.elementsDeleted;
  total.pagesAdded += mas.pagesAdded;
  total.pagesDeleted += mas.pagesDeleted;
}

/* ---------------------------------------------------------------------------
 * Bitacora de un alumno
 *
 * Todo lo que ha trabajado en los libros de una biblioteca, sesion a sesion:
 * cuando, cuanto rato, en que libro y que hizo. La ve quien gestiona la
 * biblioteca (profesorado y administracion).
 * ------------------------------------------------------------------------ */

export interface StudentActivity {
  student: { id: string; fullName: string; course: string | null };
  sessions: Array<WorkSession & { bookId: string; bookTitle: string; bookHidden: boolean }>;
  /** Resumen por libro, el mas trabajado primero. */
  books: Array<{
    bookId: string;
    bookTitle: string;
    bookHidden: boolean;
    sessions: number;
    totalSeconds: number;
    lastAt: string;
    hecho: Hecho;
  }>;
  total: { sessions: number; totalSeconds: number; hecho: Hecho };
}

export async function studentActivity(libraryId: string, studentId: string, userId: string): Promise<StudentActivity> {
  await requireManager(libraryId, userId);

  const alumno = await query<{ id: string; full_name: string; external_group: string | null }>(
    `SELECT u.id, u.full_name, u.external_group
     FROM library_students ls JOIN users u ON u.id = ls.student_id
     WHERE ls.library_id = $1 AND ls.student_id = $2`,
    [libraryId, studentId],
  );
  if (!alumno.rows[0]) throw HttpError.notFound('Ese alumno no está en esta biblioteca');

  const { rows } = await query<{
    id: string;
    book_id: string;
    book_title: string;
    hidden_at: Date | null;
    started_at: Date;
    last_seen_at: Date;
    elements_created: number;
    elements_edited: number;
    elements_deleted: number;
    pages_added: number;
    pages_deleted: number;
  }>(
    `SELECT s.id, s.book_id, b.title AS book_title, b.hidden_at, s.started_at, s.last_seen_at,
            s.elements_created, s.elements_edited, s.elements_deleted, s.pages_added, s.pages_deleted
     FROM book_sessions s
     JOIN books b ON b.id = s.book_id
     WHERE s.user_id = $2 AND b.library_id = $1
     ORDER BY s.started_at DESC
     LIMIT 1000`,
    [libraryId, studentId],
  );

  const vacio = (): Hecho => ({ elementsCreated: 0, elementsEdited: 0, elementsDeleted: 0, pagesAdded: 0, pagesDeleted: 0 });
  const total = { sessions: 0, totalSeconds: 0, hecho: vacio() };
  const porLibro = new Map<string, StudentActivity['books'][number]>();
  const a = alumno.rows[0];

  const sessions = rows.map((r) => {
    const durationSeconds = Math.max(0, Math.round((r.last_seen_at.getTime() - r.started_at.getTime()) / 1000));
    const hecho = hechoDe(r);
    total.sessions += 1;
    total.totalSeconds += durationSeconds;
    sumar(total.hecho, hecho);
    const libro = porLibro.get(r.book_id) ?? {
      bookId: r.book_id,
      bookTitle: r.book_title,
      bookHidden: Boolean(r.hidden_at),
      sessions: 0,
      totalSeconds: 0,
      lastAt: r.last_seen_at.toISOString(),
      hecho: vacio(),
    };
    libro.sessions += 1;
    libro.totalSeconds += durationSeconds;
    sumar(libro.hecho, hecho);
    porLibro.set(r.book_id, libro);
    return {
      id: r.id,
      userId: a.id,
      userName: a.full_name,
      role: 'student',
      startedAt: r.started_at.toISOString(),
      lastSeenAt: r.last_seen_at.toISOString(),
      durationSeconds,
      hecho,
      bookId: r.book_id,
      bookTitle: r.book_title,
      bookHidden: Boolean(r.hidden_at),
    };
  });

  return {
    student: { id: a.id, fullName: a.full_name, course: a.external_group },
    sessions,
    books: [...porLibro.values()].sort((x, y) => y.totalSeconds - x.totalSeconds),
    total,
  };
}
