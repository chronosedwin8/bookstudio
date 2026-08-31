import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess } from '../libraries/libraries.service.js';

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
}

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
  }>;
}

async function contexto(bookId: string, userId: string): Promise<{ libraryId: string; isManager: boolean; creatorId: string | null }> {
  const { rows } = await query<{ library_id: string | null; creator_id: string | null }>(
    'SELECT library_id, creator_id FROM books WHERE id = $1',
    [bookId],
  );
  if (!rows[0]) throw HttpError.notFound('Libro no encontrado');

  const { library_id: libraryId, creator_id: creatorId } = rows[0];
  if (!libraryId) throw HttpError.badRequest('Un libro personal no lleva bitacora');

  const access = await getAccess(libraryId, userId);
  return { libraryId, isManager: access !== 'student', creatorId };
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
  }>(
    `SELECT s.id, s.user_id, u.full_name AS user_name, u.role, s.started_at, s.last_seen_at
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
      });
      continue;
    }
    actual.sessions += 1;
    actual.totalSeconds += s.durationSeconds;
    // Las sesiones vienen de mas nueva a mas vieja: la primera es siempre la ultima.
    if (s.startedAt < actual.firstAt) actual.firstAt = s.startedAt;
  }

  return {
    sessions,
    people: [...porPersona.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
  };
}
