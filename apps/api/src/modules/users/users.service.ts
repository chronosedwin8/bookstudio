import bcrypt from 'bcryptjs';
import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import type { UserRole } from '../../lib/tokens.js';

const SALT_ROUNDS = 12;

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** phidias, o null si se creo a mano. */
  externalSource: string | null;
  /** Los alumnos creados por QR no tienen contrasena. */
  hasPassword: boolean;
  libraryCount: number;
  bookCount: number;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  external_source: string | null;
  has_password: boolean;
  library_count: string;
  book_count: string;
  created_at: Date;
}

function toManagedUser(row: UserRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    externalSource: row.external_source,
    hasPassword: row.has_password,
    libraryCount: Number(row.library_count),
    bookCount: Number(row.book_count),
    createdAt: row.created_at.toISOString(),
  };
}

export interface ListUsersQuery {
  search?: string;
  role?: UserRole;
  page: number;
  pageSize: number;
}

export interface UserPage {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listUsers({ search, role, page, pageSize }: ListUsersQuery): Promise<UserPage> {
  const conditions: string[] = ['TRUE'];
  const values: unknown[] = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }
  if (role) {
    values.push(role);
    conditions.push(`u.role = $${values.length}`);
  }

  const where = conditions.join(' AND ');

  const totalResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM users u WHERE ${where}`,
    values,
  );
  const total = Number(totalResult.rows[0].count);

  values.push(pageSize, (page - 1) * pageSize);

  const { rows } = await query<UserRow>(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.external_source, u.created_at,
            (u.password_hash IS NOT NULL) AS has_password,
            (SELECT COUNT(*) FROM library_students ls WHERE ls.student_id = u.id)
              + (SELECT COUNT(*) FROM libraries l WHERE l.owner_id = u.id) AS library_count,
            (SELECT COUNT(*) FROM books b WHERE b.creator_id = u.id) AS book_count
     FROM users u
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return {
    items: rows.map(toManagedUser),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function loadUser(userId: string): Promise<ManagedUser> {
  const page = await query<UserRow>(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.external_source, u.created_at,
            (u.password_hash IS NOT NULL) AS has_password,
            0 AS library_count, 0 AS book_count
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!page.rows[0]) throw HttpError.notFound('Usuario no encontrado');
  return toManagedUser(page.rows[0]);
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<ManagedUser> {
  const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount) throw HttpError.conflict('Ya existe una cuenta con ese email');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.email, passwordHash, input.fullName, input.role],
  );
  return loadUser(rows[0].id);
}

export interface UpdateUserInput {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export async function updateUser(
  userId: string,
  actorId: string,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  // Quitarse a uno mismo el rol de admin dejaria el sistema sin quien lo gestione.
  if (userId === actorId && input.role && input.role !== 'admin') {
    throw HttpError.badRequest('No puedes cambiar tu propio rol de administrador');
  }
  if (userId === actorId && input.isActive === false) {
    throw HttpError.badRequest('No puedes desactivar tu propia cuenta');
  }

  const columns: Record<string, string> = { fullName: 'full_name', role: 'role', isActive: 'is_active' };
  const sets: string[] = [];
  const values: unknown[] = [userId];

  for (const [key, column] of Object.entries(columns)) {
    const value = input[key as keyof UpdateUserInput];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) throw HttpError.badRequest('No hay campos para actualizar');

  const { rowCount } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, values);
  if (!rowCount) throw HttpError.notFound('Usuario no encontrado');

  return loadUser(userId);
}

/** Cambia la contrasena sin pedir la anterior: es una accion de administracion. */
export async function resetPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rowCount } = await query('UPDATE users SET password_hash = $2 WHERE id = $1', [
    userId,
    passwordHash,
  ]);
  if (!rowCount) throw HttpError.notFound('Usuario no encontrado');
}

export interface UserStats {
  total: number;
  teachers: number;
  students: number;
  admins: number;
  inactive: number;
  fromPhidias: number;
}

export async function getStats(): Promise<UserStats> {
  const { rows } = await query<Record<keyof UserStats, string>>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE role = 'teacher') AS teachers,
            COUNT(*) FILTER (WHERE role = 'student') AS students,
            COUNT(*) FILTER (WHERE role = 'admin') AS admins,
            COUNT(*) FILTER (WHERE NOT is_active) AS inactive,
            COUNT(*) FILTER (WHERE external_source = 'phidias') AS "fromPhidias"
     FROM users`,
  );
  const row = rows[0];
  return {
    total: Number(row.total),
    teachers: Number(row.teachers),
    students: Number(row.students),
    admins: Number(row.admins),
    inactive: Number(row.inactive),
    fromPhidias: Number(row.fromPhidias),
  };
}
