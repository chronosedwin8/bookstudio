import { query } from '../../db/pool.js';
import type { ToolbarInput } from './settings.schemas.js';

export interface Ajuste<T> {
  value: T | null;
  updatedAt: string | null;
}

async function leer<T>(key: string): Promise<Ajuste<T>> {
  const { rows } = await query<{ value: T; updated_at: Date }>(
    'SELECT value, updated_at FROM app_settings WHERE key = $1',
    [key],
  );
  return rows[0] ? { value: rows[0].value, updatedAt: rows[0].updated_at.toISOString() } : { value: null, updatedAt: null };
}

async function guardar<T>(key: string, value: T, userId: string): Promise<Ajuste<T>> {
  const { rows } = await query<{ updated_at: Date }>(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING updated_at`,
    [key, JSON.stringify(value), userId],
  );
  return { value, updatedAt: rows[0].updated_at.toISOString() };
}

/** Sin fila, el editor usa la barra de fabrica. */
export const leerBarra = () => leer<ToolbarInput>('toolbar');
export const guardarBarra = (value: ToolbarInput, userId: string) => guardar('toolbar', value, userId);

export async function restablecerBarra(): Promise<void> {
  await query("DELETE FROM app_settings WHERE key = 'toolbar'");
}
