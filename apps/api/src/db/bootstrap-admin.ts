/**
 * Crea la cuenta de administracion en un despliegue nuevo.
 *
 * Sin esto, una base de datos recien creada no tiene ningun usuario y nadie puede
 * entrar: habria que abrir una consola dentro del contenedor para arreglarlo.
 *
 * Se ejecuta en cada arranque y es idempotente:
 *   - si la cuenta no existe, la crea con ADMIN_PASSWORD y rol admin;
 *   - si ya existe, solo se asegura de que siga siendo admin y este activa.
 *
 * Nunca reescribe la contrasena de una cuenta que ya existe. Asi, cambiarla desde
 * la aplicacion es definitivo y un reinicio no la devuelve a la del entorno.
 *
 * Si ADMIN_EMAIL o ADMIN_PASSWORD no estan definidas, no hace nada.
 */
import bcrypt from 'bcryptjs';
import { closePool, query } from './pool.js';

const SALT_ROUNDS = 12;

interface Fila {
  id: string;
  role: string;
}

export async function bootstrapAdmin(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const fullName = (process.env.ADMIN_NAME ?? '').trim() || 'Administracion';

  if (!email || !password) {
    console.log('[admin] ADMIN_EMAIL/ADMIN_PASSWORD sin definir: no se toca ninguna cuenta.');
    return;
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');
  }

  const existente = await query<Fila>('SELECT id, role FROM users WHERE email = $1', [email]);

  if (existente.rowCount) {
    const fila = existente.rows[0];
    if (fila.role !== 'admin') {
      await query("UPDATE users SET role = 'admin', is_active = TRUE WHERE id = $1", [fila.id]);
      console.log(`[admin] ${email} pasa a administrador.`);
    } else {
      await query('UPDATE users SET is_active = TRUE WHERE id = $1', [fila.id]);
      console.log(`[admin] ${email} ya es administrador. Su contrasena no se toca.`);
    }
    return;
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, 'admin', TRUE)`,
    [email, hash, fullName],
  );
  console.log(`[admin] Cuenta de administracion creada: ${email}`);
}

// Ejecutado directamente por el arranque del contenedor.
bootstrapAdmin()
  .catch((error: unknown) => {
    console.error('[admin] error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
