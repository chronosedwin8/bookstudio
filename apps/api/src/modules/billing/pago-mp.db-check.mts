/**
 * Pagos en la pagina de Mercado Pago: que se aplican bien, una sola vez, y que
 * un pago rechazado o incompleto no da nada.
 *
 * Necesita la base de datos (va en `npm run check:db`). No mueve dinero: los
 * pagos son objetos con la forma de los que devuelve Mercado Pago. Todo lo que
 * crea lleva un sufijo propio y se borra al terminar, pase lo que pase.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { closePool, query } from '../../db/pool.ts';
import type { MpPayment } from './mercadopago.service.ts';
import { aplicarPago, consultarIntento } from './pago-en-mercado-pago.service.ts';

let hechas = 0;
async function prueba(nombre: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  hechas++;
  console.log('  OK  ', nombre);
}

const s = randomBytes(4).toString('hex');
const huella = (x: string) => createHash('sha256').update(x).digest('hex');
let idPago = 900_000_000 + Math.floor(Math.random() * 90_000_000);

const pago = (reference: string, status: string, importe: number, extra: Partial<MpPayment> = {}): MpPayment => ({
  id: idPago++,
  status,
  status_detail: status === 'approved' ? 'accredited' : 'cc_rejected_other_reason',
  transaction_amount: importe,
  currency_id: 'COP',
  external_reference: reference,
  payment_method_id: 'visa',
  installments: 1,
  date_approved: status === 'approved' ? new Date().toISOString() : null,
  payer: { email: 'pagador@test.local' },
  ...extra,
});

/** Un intento de alta nueva, como lo crea `crearIntentoPlan`, sin pasar por Mercado Pago. */
async function intentoAlta(email: string, claim: string, importe = 500000): Promise<string> {
  const reference = `bs-mp-prueba-${s}-${randomBytes(3).toString('hex')}`;
  await query(
    `INSERT INTO payment_intents (reference, kind, amount_cop, plan, payer_email, signup_name, signup_password_hash, claim_hash, init_point)
     VALUES ($1, 'plan', $2, 'individual', $3, 'Persona Prueba', $4, $5, 'https://example.test/pagar')`,
    [reference, importe, email, await bcrypt.hash('Secreto12345', 4), huella(claim)],
  );
  return reference;
}

const correos: string[] = [];
const referencias: string[] = [];
let orgId: string | null = null;
let duenoId: string | null = null;

console.log('\n== Pagos en la pagina de Mercado Pago ==');

try {
  // ---------------------------------------------------------------- alta nueva
  const correo = `mp-${s}@test.local`;
  correos.push(correo);
  const claim = randomBytes(32).toString('base64url');
  const ref = await intentoAlta(correo, claim);
  referencias.push(ref);

  await prueba('un pago rechazado no crea cuenta ni licencia', async () => {
    await aplicarPago(pago(ref, 'rejected', 500000));
    const u = await query('SELECT 1 FROM users WHERE email = $1', [correo]);
    assert.equal(u.rowCount, 0);
    const i = await query<{ status: string; last_mp_status: string }>('SELECT status, last_mp_status FROM payment_intents WHERE reference = $1', [ref]);
    assert.equal(i.rows[0].status, 'abierta');
    assert.equal(i.rows[0].last_mp_status, 'rejected');
  });

  await prueba('y al volver se ve como rechazado, con la pagina para reintentar', async () => {
    const r = await consultarIntento(ref, { claim });
    assert.equal(r.estado, 'rechazado');
    assert.ok(r.initPoint);
    assert.equal(r.session, undefined);
  });

  await prueba('un pago en tramite (PSE) se ve en tramite y aun no crea nada', async () => {
    await aplicarPago(pago(ref, 'in_process', 500000));
    assert.equal((await consultarIntento(ref, { claim })).estado, 'en_tramite');
    assert.equal((await query('SELECT 1 FROM users WHERE email = $1', [correo])).rowCount, 0);
  });

  const aprobado = pago(ref, 'approved', 500000);
  await prueba('un pago aprobado crea la cuenta con la contrasena elegida', async () => {
    await aplicarPago(aprobado);
    const u = await query<{ password_hash: string; role: string; full_name: string }>(
      'SELECT password_hash, role, full_name FROM users WHERE email = $1', [correo]);
    assert.equal(u.rowCount, 1);
    assert.equal(u.rows[0].role, 'teacher');
    assert.equal(u.rows[0].full_name, 'Persona Prueba');
    assert.ok(await bcrypt.compare('Secreto12345', u.rows[0].password_hash));
  });

  await prueba('y una licencia activa del plan, con su duracion', async () => {
    const s2 = await query<{ status: string; meses: number; amount_cop: string }>(
      `SELECT s.status, s.amount_cop,
              ROUND(EXTRACT(EPOCH FROM (s.expires_at - s.starts_at)) / 86400 / 30)::int AS meses
         FROM subscriptions s JOIN users u ON u.id = s.owner_id WHERE u.email = $1`, [correo]);
    assert.equal(s2.rowCount, 1);
    assert.equal(s2.rows[0].status, 'activa');
    assert.equal(Number(s2.rows[0].amount_cop), 500000);
    assert.ok(s2.rows[0].meses >= 12 && s2.rows[0].meses <= 13, `meses: ${s2.rows[0].meses}`);
  });

  await prueba('el pago queda apuntado como factura', async () => {
    const p = await query('SELECT 1 FROM payments WHERE mp_payment_id = $1', [String(aprobado.id)]);
    assert.equal(p.rowCount, 1);
  });

  await prueba('la contrasena cifrada ya no se guarda en el intento', async () => {
    const i = await query<{ signup_password_hash: string | null; status: string }>(
      'SELECT signup_password_hash, status FROM payment_intents WHERE reference = $1', [ref]);
    assert.equal(i.rows[0].status, 'pagada');
    assert.equal(i.rows[0].signup_password_hash, null);
  });

  await prueba('repetir el mismo aviso despues no duplica nada', async () => {
    await aplicarPago(aprobado);
    const sub = await query('SELECT 1 FROM subscriptions s JOIN users u ON u.id = s.owner_id WHERE u.email = $1', [correo]);
    assert.equal(sub.rowCount, 1);
  });

  await prueba('si el aviso y la consulta llegan A LA VEZ sobre un pago nuevo, se aplica UNA sola vez', async () => {
    // Un intento todavia abierto y cinco llegadas simultaneas del mismo pago.
    const c = `mp-carrera-${s}@test.local`; correos.push(c);
    const k = randomBytes(16).toString('hex');
    const r = await intentoAlta(c, k); referencias.push(r);
    const unico = pago(r, 'approved', 500000);
    await Promise.all(Array.from({ length: 5 }, () => aplicarPago(unico)));
    const sub = await query(
      'SELECT 1 FROM subscriptions s JOIN users u ON u.id = s.owner_id WHERE u.email = $1', [c]);
    assert.equal(sub.rowCount, 1, `licencias creadas: ${sub.rowCount}`);
    // Y el intento queda como pagado, no "para revisar" por verse a si mismo.
    const i = await query<{ status: string }>('SELECT status FROM payment_intents WHERE reference = $1', [r]);
    assert.equal(i.rows[0].status, 'pagada', `estado final: ${i.rows[0].status}`);
  });

  await prueba('lo mismo con una cuenta ya existente: una sola licencia', async () => {
    const c = `mp-carrera-dueno-${s}@test.local`; correos.push(c);
    const id = (await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Carrera', 'teacher') RETURNING id", [c])).rows[0].id;
    const r = `bs-mp-prueba-${s}-carrera`; referencias.push(r);
    await query(`INSERT INTO payment_intents (reference, kind, amount_cop, owner_id, plan, payer_email) VALUES ($1, 'plan', 10000, $2, 'mensual', $3)`, [r, id, c]);
    const unico = pago(r, 'approved', 10000);
    await Promise.all(Array.from({ length: 5 }, () => aplicarPago(unico)));
    const sub = await query('SELECT 1 FROM subscriptions WHERE owner_id = $1', [id]);
    assert.equal(sub.rowCount, 1, `licencias creadas: ${sub.rowCount}`);
  });

  await prueba('al volver, con su secreto recibe la sesion de su cuenta nueva', async () => {
    const r = await consultarIntento(ref, { claim });
    assert.equal(r.estado, 'aprobado');
    assert.ok(r.session?.token);
    assert.equal(r.session?.user.email, correo);
  });

  await prueba('sin el secreto, nadie puede ver ese pago ni llevarse la sesion', async () => {
    await assert.rejects(consultarIntento(ref, {}), /no encontrado/i);
    await assert.rejects(consultarIntento(ref, { claim: 'otro' }), /no encontrado/i);
  });

  // ---------------------------------------------------------------- importes
  await prueba('un pago que no cubre el importe no da licencia: queda para revisar', async () => {
    const c2 = `mp-corto-${s}@test.local`; correos.push(c2);
    const k2 = randomBytes(16).toString('hex');
    const r2 = await intentoAlta(c2, k2); referencias.push(r2);
    await aplicarPago(pago(r2, 'approved', 1000));
    assert.equal((await query('SELECT 1 FROM users WHERE email = $1', [c2])).rowCount, 0);
    assert.equal((await consultarIntento(r2, { claim: k2 })).estado, 'revisar');
  });

  await prueba('ni uno en otra moneda', async () => {
    const c3 = `mp-usd-${s}@test.local`; correos.push(c3);
    const k3 = randomBytes(16).toString('hex');
    const r3 = await intentoAlta(c3, k3); referencias.push(r3);
    await aplicarPago(pago(r3, 'approved', 500000, { currency_id: 'USD' }));
    assert.equal((await query('SELECT 1 FROM users WHERE email = $1', [c3])).rowCount, 0);
  });

  await prueba('si alguien registro ese correo mientras pagaba, el pago queda apuntado para revisar', async () => {
    const c4 = `mp-ocupado-${s}@test.local`; correos.push(c4);
    const k4 = randomBytes(16).toString('hex');
    const r4 = await intentoAlta(c4, k4); referencias.push(r4);
    await query("INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Otra', 'teacher')", [c4]);
    const p4 = pago(r4, 'approved', 500000);
    await aplicarPago(p4);
    assert.equal((await consultarIntento(r4, { claim: k4 })).estado, 'revisar');
    assert.equal((await query('SELECT 1 FROM payments WHERE mp_payment_id = $1', [String(p4.id)])).rowCount, 1);
    assert.equal((await query('SELECT 1 FROM subscriptions s JOIN users u ON u.id = s.owner_id WHERE u.email = $1', [c4])).rowCount, 0);
  });

  // ---------------------------------------------------------------- cuenta existente
  await prueba('con cuenta ya existente, la licencia es para esa cuenta', async () => {
    const c5 = `mp-dueno-${s}@test.local`; correos.push(c5);
    duenoId = (await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Duena', 'teacher') RETURNING id", [c5])).rows[0].id;
    const r5 = `bs-mp-prueba-${s}-dueno`; referencias.push(r5);
    await query(
      `INSERT INTO payment_intents (reference, kind, amount_cop, owner_id, plan, payer_email) VALUES ($1, 'plan', 10000, $2, 'mensual', $3)`,
      [r5, duenoId, c5]);
    await aplicarPago(pago(r5, 'approved', 10000));
    const sub = await query<{ status: string }>('SELECT status FROM subscriptions WHERE owner_id = $1', [duenoId]);
    assert.equal(sub.rows[0]?.status, 'activa');
    // Solo su sesion la puede consultar
    assert.equal((await consultarIntento(r5, { userId: duenoId })).estado, 'aprobado');
    await assert.rejects(consultarIntento(r5, { userId: '00000000-0000-0000-0000-000000000000' }), /no encontrado/i);
  });

  // ---------------------------------------------------------------- cuenta de cobro
  await prueba('una cuenta de cobro pagada en Mercado Pago queda saldada', async () => {
    orgId = (await query<{ id: string }>('INSERT INTO organizations (name, owner_id) VALUES ($1, $2) RETURNING id', [`Org MP ${s}`, duenoId])).rows[0].id;
    const cobro = (await query<{ id: string }>(
      `INSERT INTO charges (organization_id, concept, amount_cop, status) VALUES ($1, 'Prueba', 250000, 'emitida') RETURNING id`, [orgId])).rows[0].id;
    const r6 = `bs-mp-prueba-${s}-cobro`; referencias.push(r6);
    await query(`INSERT INTO payment_intents (reference, kind, amount_cop, owner_id, charge_id) VALUES ($1, 'charge', 250000, $2, $3)`, [r6, duenoId, cobro]);
    const p6 = pago(r6, 'approved', 250000);
    await aplicarPago(p6);
    const c = await query<{ status: string }>('SELECT status FROM charges WHERE id = $1', [cobro]);
    assert.equal(c.rows[0].status, 'pagada');
    const pg = await query<{ charge_id: string }>('SELECT charge_id FROM payments WHERE mp_payment_id = $1', [String(p6.id)]);
    assert.equal(pg.rows[0].charge_id, cobro);
  });

  await prueba('un pago que no es de ningun intento no se toca aqui', async () => {
    assert.equal(await aplicarPago(pago('bs-otra-cosa', 'approved', 1)), false);
    assert.equal(await aplicarPago(pago('', 'approved', 1)), false);
  });

  console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
} finally {
  // Limpieza, pase lo que pase: pagos, licencias, intentos, cobros y cuentas de prueba.
  await query(`DELETE FROM payments WHERE mp_payment_id IN (SELECT mp_payment_id FROM payment_intents WHERE reference = ANY($1))
                  OR owner_id IN (SELECT id FROM users WHERE email = ANY($2))`, [referencias, correos]);
  await query('DELETE FROM payment_intents WHERE reference = ANY($1)', [referencias]);
  await query('DELETE FROM payments WHERE mp_payment_id::bigint >= 900000000 AND mp_payment_id::bigint < 990000000 AND owner_id IS NULL');
  if (orgId) await query('DELETE FROM organizations WHERE id = $1', [orgId]);
  await query('DELETE FROM subscriptions WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [correos]);
  await query('DELETE FROM users WHERE email = ANY($1)', [correos]);
  await closePool();
}
