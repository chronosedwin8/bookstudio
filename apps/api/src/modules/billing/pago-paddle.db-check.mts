/**
 * Comprobacion de los pagos con Paddle contra la base de datos local. Se ejecuta con:
 *   cd apps/api && npx tsx src/modules/billing/pago-paddle.db-check.mts
 *
 * No llama a Paddle: se le da a aplicarTransaccion la respuesta que daria su API.
 * Lo que se vigila es lo que cuesta dinero si falla: que un cobro se aplique una
 * sola vez, que un pago menor no active nada, que los cobros de otros productos
 * de la cuenta compartida no toquen BookStudio. Crea sus datos y los borra.
 */
import { query } from '../../db/pool.js';
import { aplicarTransaccion } from './pago-paddle.service.js';
import type { PaddleTransaction } from './paddle.service.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const sello = Date.now();
const email = `paddle-check-${sello}@example.com`;
const tx = (id: string, ref: string, status: string, subtotalCop: number, moneda = 'COP'): PaddleTransaction => ({
  id,
  status,
  currency_code: moneda,
  custom_data: { bookstudio_ref: ref },
  customer_id: null,
  details: { totals: { subtotal: String(subtotalCop * 100), tax: '0', total: String(subtotalCop * 100) } },
  payments: [{ status: 'captured', method_details: { type: 'card' } }],
  billed_at: new Date().toISOString(),
});
const intento = async (ref: string, kind: string, amount: number, owner: string, extra: Record<string, unknown> = {}) =>
  query(
    `INSERT INTO payment_intents (reference, provider, kind, amount_cop, owner_id, plan, charge_id, payer_email, paddle_transaction_id)
     VALUES ($1, 'paddle', $2, $3, $4, $5, $6, $7, $8)`,
    [ref, kind, amount, owner, extra.plan ?? null, extra.charge ?? null, email, extra.txn ?? null],
  );
const estado = async (ref: string) =>
  (await query<{ status: string }>('SELECT status FROM payment_intents WHERE reference = $1', [ref])).rows[0]?.status;
const mesesHasta = (d: Date) => (d.getTime() - Date.now()) / (30.44 * 86400000);

const { rows: u } = await query<{ id: string }>(
  `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Paddle Check', 'teacher') RETURNING id`,
  [email],
);
const owner = u[0].id;
const plan = (
  await query<{ id: string; amount_cop: string; period_months: number }>(
    `SELECT id, amount_cop, period_months FROM plans WHERE period_months = 12 ORDER BY amount_cop LIMIT 1`,
  )
).rows[0];
const importe = Number(plan.amount_cop);

try {
  // --- Plan: primera compra ---
  const r1 = `bs-pd-${plan.id}-a${sello}`;
  await intento(r1, 'plan', importe, owner, { plan: plan.id, txn: `txn_a${sello}` });
  await aplicarTransaccion(tx(`txn_a${sello}`, r1, 'ready', importe));
  check('un cobro aun sin pagar no activa nada', (await estado(r1)) === 'abierta');
  await aplicarTransaccion(tx(`txn_a${sello}`, r1, 'completed', importe));
  const subs = (
    await query<{ id: string; expires_at: Date; status: string }>(
      'SELECT id, expires_at, status FROM subscriptions WHERE owner_id = $1',
      [owner],
    )
  ).rows;
  check('pagado: licencia activa', (await estado(r1)) === 'pagada' && subs.length === 1 && subs[0].status === 'activa');
  const meses = mesesHasta(subs[0].expires_at);
  check(`por ${plan.period_months} meses`, Math.abs(meses - plan.period_months) < 0.6, meses.toFixed(1));

  // Aviso repetido y consulta del navegador a la vez: una sola vez.
  await Promise.all([
    aplicarTransaccion(tx(`txn_a${sello}`, r1, 'completed', importe)),
    aplicarTransaccion(tx(`txn_a${sello}`, r1, 'paid', importe)),
  ]);
  const pagos = (await query('SELECT 1 FROM payments WHERE owner_id = $1', [owner])).rowCount;
  const subs2 = (await query('SELECT 1 FROM subscriptions WHERE owner_id = $1', [owner])).rowCount;
  check('repetir el aviso no duplica ni pago ni licencia', pagos === 1 && subs2 === 1, `${pagos} pagos, ${subs2} licencias`);

  // --- Renovar el mismo plan alarga la licencia ---
  const r2 = `bs-pd-${plan.id}-b${sello}`;
  await intento(r2, 'plan', importe, owner, { plan: plan.id, txn: `txn_b${sello}` });
  await aplicarTransaccion(tx(`txn_b${sello}`, r2, 'completed', importe));
  const tras = (await query<{ expires_at: Date }>('SELECT expires_at FROM subscriptions WHERE owner_id = $1', [owner])).rows;
  const mesesTras = mesesHasta(tras[0].expires_at);
  check(
    'renovar alarga la misma licencia',
    tras.length === 1 && Math.abs(mesesTras - 2 * plan.period_months) < 1,
    `${tras.length} licencias, ${mesesTras.toFixed(1)} meses`,
  );

  // --- Pago menor o en otra moneda: no activa, queda para revisar ---
  const r3 = `bs-pd-${plan.id}-c${sello}`;
  await intento(r3, 'plan', importe, owner, { plan: plan.id, txn: `txn_c${sello}` });
  await aplicarTransaccion(tx(`txn_c${sello}`, r3, 'completed', importe - 1));
  check('un pago menor queda para revisar', (await estado(r3)) === 'revisar');
  const r4 = `bs-pd-${plan.id}-d${sello}`;
  await intento(r4, 'plan', importe, owner, { plan: plan.id, txn: `txn_d${sello}` });
  await aplicarTransaccion(tx(`txn_d${sello}`, r4, 'completed', importe, 'USD'));
  check('en otra moneda tambien', (await estado(r4)) === 'revisar');
  const expira = (await query<{ expires_at: Date }>('SELECT expires_at FROM subscriptions WHERE owner_id = $1', [owner])).rows[0]
    .expires_at;
  check('y la licencia no se alarga por ellos', expira.getTime() === tras[0].expires_at.getTime());

  // --- Un cobro con otro id no se aplica a este intento ---
  const r5 = `bs-pd-${plan.id}-e${sello}`;
  await intento(r5, 'plan', importe, owner, { plan: plan.id, txn: `txn_e${sello}` });
  await aplicarTransaccion(tx(`txn_otro${sello}`, r5, 'completed', importe));
  check('un cobro ajeno no cumple el intento', (await estado(r5)) === 'abierta');

  // --- Cobros de otros productos de la cuenta compartida ---
  const ajeno = await aplicarTransaccion({ ...tx('txn_x', '', 'completed', 1), custom_data: { vcodepro: 1 } });
  check('lo que no es de BookStudio se ignora', ajeno === false);

  // --- Cuenta de cobro ---
  const org = (
    await query<{ id: string }>(`INSERT INTO organizations (name, owner_id) VALUES ('Org Paddle Check', $1) RETURNING id`, [owner])
  ).rows[0].id;
  const cobro = (
    await query<{ id: string }>(
      `INSERT INTO charges (organization_id, concept, amount_cop, status, issued_at)
       VALUES ($1, 'Prueba', 250000, 'emitida', NOW()) RETURNING id`,
      [org],
    )
  ).rows[0].id;
  const r6 = `bs-pd-cobro-f${sello}`;
  await intento(r6, 'charge', 250000, owner, { charge: cobro, txn: `txn_f${sello}` });
  await aplicarTransaccion(tx(`txn_f${sello}`, r6, 'completed', 250000));
  const c = (await query<{ status: string }>('SELECT status FROM charges WHERE id = $1', [cobro])).rows[0];
  const pagoCobro = (
    await query('SELECT 1 FROM payments WHERE charge_id = $1 AND paddle_transaction_id = $2', [cobro, `txn_f${sello}`])
  ).rowCount;
  check(
    'la cuenta de cobro queda pagada con su pago apuntado',
    c.status === 'pagada' && pagoCobro === 1 && (await estado(r6)) === 'pagada',
  );

  // Pagarla otra vez (dos pestanas abiertas): el segundo pago se apunta para revisar.
  const r7 = `bs-pd-cobro-g${sello}`;
  await intento(r7, 'charge', 250000, owner, { charge: cobro, txn: `txn_g${sello}` });
  await aplicarTransaccion(tx(`txn_g${sello}`, r7, 'completed', 250000));
  check('pagarla dos veces deja el segundo para revisar', (await estado(r7)) === 'revisar');
} finally {
  await query('DELETE FROM payments WHERE owner_id = $1', [owner]);
  await query('DELETE FROM payment_intents WHERE owner_id = $1', [owner]);
  await query('DELETE FROM organizations WHERE owner_id = $1', [owner]);
  await query('DELETE FROM users WHERE id = $1', [owner]);
  console.log(fallos ? `\n${fallos} fallo(s)` : '\nPagos con Paddle correctos; datos de prueba borrados.');
  process.exit(fallos ? 1 : 0);
}
