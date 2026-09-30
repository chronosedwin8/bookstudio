import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { esEnlaceDeMercadoPago } from './enlace-valido.js';

/**
 * Enlaces de pago de Mercado Pago, uno por importe.
 *
 * Desde el 30 de septiembre de 2026 BookStudio no cobra: el cliente paga en el
 * enlace de Mercado Pago que corresponde a su importe y la administracion activa
 * la licencia o salda la cuenta de cobro al recibir el pago.
 *
 * Se buscan por IMPORTE exacto. Si el precio de un plan cambia y nadie ha puesto
 * un enlace para el importe nuevo, no se ofrece ninguno: es mejor pedir al cliente
 * que escriba que mandarle a pagar una cantidad que ya no es la suya.
 */

export interface EnlacePago {
  id: string;
  amountCop: number;
  url: string;
  label: string;
  updatedAt: string;
}

interface Fila {
  id: string;
  amount_cop: string;
  url: string;
  label: string;
  updated_at: Date;
}

const aEnlace = (f: Fila): EnlacePago => ({
  id: f.id,
  amountCop: Number(f.amount_cop),
  url: f.url,
  label: f.label,
  updatedAt: f.updated_at.toISOString(),
});

/** Cache corta: se consulta en cada carga de la portada y casi nunca cambia. */
const CACHE_MS = 30_000;
let cache: { at: number; enlaces: EnlacePago[] } | null = null;

export async function listarEnlaces(): Promise<EnlacePago[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.enlaces;
  const { rows } = await query<Fila>('SELECT id, amount_cop, url, label, updated_at FROM payment_links ORDER BY amount_cop');
  cache = { at: Date.now(), enlaces: rows.map(aEnlace) };
  return cache.enlaces;
}

/** El enlace para pagar exactamente este importe, o null si no hay. */
export async function enlaceParaImporte(amountCop: number): Promise<string | null> {
  const enlaces = await listarEnlaces();
  const enlace = enlaces.find((e) => e.amountCop === amountCop);
  // Se vuelve a comprobar al servirlo: un enlace metido a mano en la base sin
  // pasar por aqui tampoco se ofrece si no es de Mercado Pago.
  return enlace && esEnlaceDeMercadoPago(enlace.url) ? enlace.url : null;
}

/** Pone (o cambia) el enlace de un importe. Solo la administracion llega aqui. */
export async function guardarEnlace(
  input: { amountCop: number; url: string; label?: string },
  adminId: string,
): Promise<EnlacePago> {
  if (!esEnlaceDeMercadoPago(input.url)) {
    throw HttpError.badRequest('El enlace tiene que ser de Mercado Pago (https://mpago.li/... o https://www.mercadopago.com.co/...)');
  }
  const { rows } = await query<Fila>(
    `INSERT INTO payment_links (amount_cop, url, label, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (amount_cop) DO UPDATE
       SET url = EXCLUDED.url, label = EXCLUDED.label, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING id, amount_cop, url, label, updated_at`,
    [input.amountCop, input.url.trim(), (input.label ?? '').trim().slice(0, 120), adminId],
  );
  cache = null;
  return aEnlace(rows[0]);
}

export async function borrarEnlace(id: string): Promise<void> {
  const { rowCount } = await query('DELETE FROM payment_links WHERE id = $1', [id]);
  if (!rowCount) throw HttpError.notFound('Ese enlace no existe');
  cache = null;
}
