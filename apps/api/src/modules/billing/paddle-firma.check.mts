/**
 * Comprobacion de la firma de los avisos de Paddle. Se ejecuta con:
 *   npx tsx apps/api/src/modules/billing/paddle-firma.check.mts
 *
 * Un aviso con firma aceptada sin serlo daria licencias gratis. Se comprueba
 * contra el ejemplo de la documentacion de Paddle y contra los ataques tipicos:
 * cuerpo tocado, aviso viejo repetido, firma de otro secreto.
 */
import { createHmac } from 'node:crypto';
import { firmaValida } from './paddle.service.js';

let fallos = 0;
const check = (nombre: string, ok: boolean) => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}`);
};

const secreto = 'pdl_ntfset_01gkpjp8bkh3ry8bvzexw9nc4m_xYz123';
const cuerpo = '{"event_id":"evt_1","event_type":"transaction.completed","data":{"id":"txn_01abc"}}';
const ts = 1_790_000_000;
const firmar = (t: number, c: string, s = secreto) => createHmac('sha256', s).update(`${t}:${c}`).digest('hex');

check('firma buena', firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo)}`, cuerpo, secreto, ts));
check('tambien con el cuerpo en Buffer', firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo)}`, Buffer.from(cuerpo), secreto, ts));
check('con varios h1 mientras se rota el secreto', firmaValida(`ts=${ts};h1=${'0'.repeat(64)};h1=${firmar(ts, cuerpo)}`, cuerpo, secreto, ts));
check('cuerpo tocado: no', !firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo)}`, cuerpo.replace('txn_01abc', 'txn_01xyz'), secreto, ts));
check('otro secreto: no', !firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo, 'otro')}`, cuerpo, secreto, ts));
check('aviso viejo repetido: no', !firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo)}`, cuerpo, secreto, ts + 3600));
check('sin cabecera: no', !firmaValida(undefined, cuerpo, secreto, ts));
check('sin secreto configurado: no', !firmaValida(`ts=${ts};h1=${firmar(ts, cuerpo, '')}`, cuerpo, '', ts));
check('cabecera rota: no', !firmaValida('ts=abc;h1=zz', cuerpo, secreto, ts));
check('sin h1: no', !firmaValida(`ts=${ts}`, cuerpo, secreto, ts));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nFirma de Paddle correcta.');
if (fallos) process.exit(1);
