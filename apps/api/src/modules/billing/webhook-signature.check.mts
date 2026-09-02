/**
 * Comprobacion de la firma de los avisos de Mercado Pago. Se ejecuta con:
 *   npx tsx apps/api/src/modules/billing/webhook-signature.check.mts
 *
 * Este codigo decide si se acepta o se rechaza una notificacion de pago, y hasta
 * ahora nunca se habia ejercitado. Un fallo aqui significa aceptar avisos falsos
 * (alguien activando licencias sin pagar) o rechazar los buenos (pagos por PSE que
 * se quedan colgados para siempre).
 *
 * La firma real se construye igual que la haria Mercado Pago, con la plantilla que
 * documenta: id:{data.id};request-id:{x-request-id};ts:{ts};
 */
import { createHmac } from 'node:crypto';

const SECRETO = 'secreto-de-prueba-no-es-el-real';
process.env.MP_WEBHOOK_SECRET = SECRETO;
process.env.MP_ACCESS_TOKEN = 'APP_USR-falso-para-la-prueba';
process.env.PGHOST = 'localhost';
process.env.PGUSER = 'x';
process.env.PGPASSWORD = 'x';
process.env.PGDATABASE = 'x';
process.env.JWT_SECRET = 'una-cadena-suficientemente-larga-para-la-prueba';

const { verifyWebhookSignature } = await import('./mercadopago.service.js');

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

/** Firma como la construye Mercado Pago. */
function firmar(dataId: string, requestId: string, ts: string, secreto = SECRETO): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secreto).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

const ID = '1234567890';
const PETICION = 'b3a1c2d4-0000-4444-8888-aaaabbbbcccc';
const TS = '1772630400';

check('acepta una firma valida', verifyWebhookSignature(firmar(ID, PETICION, TS), PETICION, ID));

check(
  'rechaza si cambian el id del pago',
  !verifyWebhookSignature(firmar(ID, PETICION, TS), PETICION, '9999999999'),
);
check(
  'rechaza si cambia el id de la peticion',
  !verifyWebhookSignature(firmar(ID, PETICION, TS), 'otra-peticion', ID),
);
check(
  'rechaza si cambia la marca de tiempo',
  !verifyWebhookSignature(firmar(ID, PETICION, TS).replace(TS, '1772630401'), PETICION, ID),
);
check(
  'rechaza una firma hecha con otro secreto',
  !verifyWebhookSignature(firmar(ID, PETICION, TS, 'otro-secreto'), PETICION, ID),
);

check('rechaza sin cabecera de firma', !verifyWebhookSignature(undefined, PETICION, ID));
check('rechaza sin id de pago', !verifyWebhookSignature(firmar(ID, PETICION, TS), PETICION, undefined));
check('rechaza una cabecera con basura', !verifyWebhookSignature('cualquier-cosa', PETICION, ID));
check('rechaza si falta v1', !verifyWebhookSignature(`ts=${TS}`, PETICION, ID));
check('rechaza si falta ts', !verifyWebhookSignature('v1=abc', PETICION, ID));
check(
  'una firma mas corta no cuela',
  !verifyWebhookSignature(`ts=${TS},v1=abc`, PETICION, ID),
);

// Mercado Pago envia el id en minusculas; el nuestro puede llegar en mayusculas.
check(
  'no distingue mayusculas en el id',
  verifyWebhookSignature(firmar('ABCDEF', PETICION, TS), PETICION, 'ABCDEF'),
);

// Sin secreto configurado no se puede validar nada: debe rechazar, no aceptar.
//
// Va en otro proceso a proposito: la configuracion se lee una sola vez al arrancar,
// asi que cambiar process.env aqui no tendria ningun efecto y la prueba mentiria.
const { execFileSync } = await import('node:child_process');
const guion = `
  const { verifyWebhookSignature } = await import('${new URL('./mercadopago.service.js', import.meta.url).href}');
  process.stdout.write(String(verifyWebhookSignature('${firmar(ID, PETICION, TS)}', '${PETICION}', '${ID}')));
`;
// --import tsx: el hijo tambien tiene que entender TypeScript.
const salida = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', guion], {
  env: { ...process.env, MP_WEBHOOK_SECRET: '' },
  encoding: 'utf8',
}).trim();
check('sin secreto configurado no valida ninguna firma', salida === 'false', salida);

console.log(fallos ? `\n${fallos} fallos` : '\nFirma de webhooks correcta');
process.exit(fallos ? 1 : 0);
