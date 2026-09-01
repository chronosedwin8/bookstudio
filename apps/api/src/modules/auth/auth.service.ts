import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken, verifyAccessToken, type UserRole } from '../../lib/tokens.js';
import type { CreateStudentInput, LoginInput, RegisterInput } from './auth.schemas.js';

const SALT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: Date;
  is_active?: boolean;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at.toISOString(),
  };
}

export async function register(input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
  const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount) {
    throw HttpError.conflict('Ya existe una cuenta con ese email');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, password_hash, full_name, role, avatar_url, created_at`,
    [input.email, passwordHash, input.fullName, input.role],
  );

  const user = toPublicUser(rows[0]);
  return { user, token: signAccessToken({ sub: user.id, role: user.role, kind: 'session' }) };
}

export async function login(input: LoginInput): Promise<{ user: PublicUser; token: string }> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, password_hash, full_name, role, avatar_url, created_at, is_active
     FROM users WHERE email = $1`,
    [input.email],
  );

  const row = rows[0];
  // Se compara siempre contra un hash para no filtrar existencia de cuenta por tiempo de respuesta.
  const hash = row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const valid = await bcrypt.compare(input.password, hash);

  if (!row || !row.password_hash || !valid) {
    throw HttpError.unauthorized('Email o contraseña incorrectos');
  }
  // Se comprueba despues de validar la clave: antes revelaria que la cuenta existe.
  if (row.is_active === false) {
    throw HttpError.forbidden('Esta cuenta esta desactivada. Habla con el administrador.');
  }

  const user = toPublicUser(row);
  return { user, token: signAccessToken({ sub: user.id, role: user.role, kind: 'session' }) };
}

/**
 * Cambio de contrasena por la propia persona.
 *
 * Quien entra con QR no tiene ninguna, asi que la primera vez no se le pide la
 * anterior: su credencial ya es el codigo, y exigirle algo que no tiene le dejaria
 * sin poder ponerse una nunca.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string | undefined,
  newPassword: string,
): Promise<void> {
  const { rows } = await query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) throw HttpError.notFound('Usuario no encontrado');

  const actual = rows[0].password_hash;
  if (actual) {
    if (!currentPassword) throw HttpError.badRequest('Escribe tu contraseña actual');
    if (!(await bcrypt.compare(currentPassword, actual))) {
      throw HttpError.unauthorized('La contraseña actual no es correcta');
    }
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // password_is_default deja de ser cierto: a partir de aqui la clave es suya y el
  // docente ya no debe verla al anadirlo a otra biblioteca.
  await query('UPDATE users SET password_hash = $2, password_is_default = FALSE WHERE id = $1', [
    userId,
    hash,
  ]);
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const { rows } = await query<UserRow>(
    'SELECT id, email, password_hash, full_name, role, avatar_url, created_at FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) throw HttpError.notFound('Usuario no encontrado');
  return toPublicUser(rows[0]);
}

/** Crea un alumno sin contrasena, lo inscribe en la biblioteca y devuelve su credencial QR. */
export async function createStudentWithQr(
  teacherId: string,
  input: CreateStudentInput,
): Promise<{ user: PublicUser; qrToken: string; qrDataUrl: string }> {
  const access = await query(
    `SELECT 1 FROM libraries l
     LEFT JOIN library_teachers lt ON lt.library_id = l.id AND lt.teacher_id = $2
     WHERE l.id = $1 AND (l.owner_id = $2 OR lt.teacher_id IS NOT NULL)`,
    [input.libraryId, teacherId],
  );
  if (!access.rowCount) {
    throw HttpError.forbidden('No administras esta biblioteca');
  }

  const user = await withTransaction(async (client) => {
    const localEmail = `alumno-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@qr.local`;
    const inserted = await client.query<UserRow>(
      `INSERT INTO users (email, full_name, role)
       VALUES ($1, $2, 'student')
       RETURNING id, email, password_hash, full_name, role, avatar_url, created_at`,
      [localEmail, input.fullName],
    );
    const created = inserted.rows[0];

    await client.query(
      'INSERT INTO library_students (library_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [input.libraryId, created.id],
    );
    await client.query(
      'INSERT INTO student_portfolios (student_id, name) VALUES ($1, $2) ON CONFLICT (student_id) DO NOTHING',
      [created.id, `Portafolio de ${input.fullName}`],
    );

    return toPublicUser(created);
  });

  const qrToken = signAccessToken({ sub: user.id, role: 'student', kind: 'qr' });
  const qrDataUrl = await QRCode.toDataURL(qrToken, { errorCorrectionLevel: 'M', margin: 1, width: 320 });

  return { user, qrToken, qrDataUrl };
}

export async function loginWithQr(token: string): Promise<{ user: PublicUser; token: string }> {
  const payload = verifyAccessToken(token);
  if (payload.kind !== 'qr' || payload.role !== 'student') {
    throw HttpError.unauthorized('Este código QR no es una credencial de alumno válida');
  }

  const user = await getUserById(payload.sub);
  return { user, token: signAccessToken({ sub: user.id, role: user.role, kind: 'session' }) };
}
