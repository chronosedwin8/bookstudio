import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { signAccessToken } from '../../lib/tokens.js';
import type { PublicUser } from './auth.service.js';

/**
 * Modo de prueba sin registro.
 *
 * Quien quiera ver como funciona entra sin dar ningun dato y con todas las
 * herramientas del editor. Los cupos son deliberadamente pequenos: se trata de que
 * pruebe la herramienta, no de que la use en clase.
 *
 * La cuenta se crea con rol de docente para que tenga acceso a plantillas, graficas
 * y preguntas, pero `is_trial` la excluye de todo lo que toque datos ajenos
 * (importacion de grupos, gestion de usuarios, solicitudes comerciales).
 */
export const TRIAL_LIMITS = {
  maxBooks: 1,
  maxPagesPerBook: 2,
} as const;

export interface TrialSession {
  user: PublicUser;
  token: string;
  limits: typeof TRIAL_LIMITS;
}

export async function createTrialSession(): Promise<TrialSession> {
  const user = await withTransaction(async (client) => {
    // Correo interno irrepetible: la cuenta no recibe ni envia nada.
    const email = `prueba-${randomUUID()}@trial.local`;

    const { rows } = await client.query<{
      id: string;
      email: string;
      full_name: string;
      role: 'teacher';
      avatar_url: string | null;
      created_at: Date;
    }>(
      `INSERT INTO users (email, full_name, role, is_trial)
       VALUES ($1, 'Invitado de prueba', 'teacher', TRUE)
       RETURNING id, email, full_name, role, avatar_url, created_at`,
      [email],
    );

    const created = rows[0];

    await client.query(
      'INSERT INTO student_portfolios (student_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [created.id, 'Portafolio de prueba'],
    );

    return {
      id: created.id,
      email: created.email,
      fullName: created.full_name,
      role: created.role,
      avatarUrl: created.avatar_url,
      createdAt: created.created_at.toISOString(),
    } satisfies PublicUser;
  });

  return {
    user,
    token: signAccessToken({ sub: user.id, role: 'teacher', kind: 'session' }),
    limits: TRIAL_LIMITS,
  };
}

/** Indica si una cuenta es de prueba; lo consultan los limites del editor. */
export async function isTrialUser(userId: string): Promise<boolean> {
  const { rows } = await query<{ is_trial: boolean }>('SELECT is_trial FROM users WHERE id = $1', [
    userId,
  ]);
  return rows[0]?.is_trial === true;
}
