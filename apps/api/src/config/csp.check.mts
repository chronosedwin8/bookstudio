/**
 * Comprobacion de la politica de contenido. Se ejecuta con:
 *   npx tsx apps/api/src/config/csp.check.mts
 *
 * Existe porque la politica por defecto de helmet (default-src 'self') bloquea el
 * SDK de Mercado Pago sin dar ningun error visible: el formulario de pago se queda
 * cargando para siempre. Es un fallo caro y silencioso, asi que conviene que salte
 * una prueba antes que un cliente.
 */
import { CSP_DIRECTIVES } from './csp.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const d = CSP_DIRECTIVES as Record<string, string[]>;

// --- El cobro tiene que poder cargarse ---
check('el SDK de pago puede cargarse', d.scriptSrc.includes('https://sdk.mercadopago.com'));
check('el SDK puede llamar a su API', d.connectSrc.includes('https://api.mercadopago.com'));
check(
  'los iframes del cobro estan permitidos',
  d.frameSrc.includes('https:') || d.frameSrc.some((o) => o.includes('mercadopago')),
);

// --- El resto de la aplicacion ---
check('los mapas pueden pedir sus baldosas', d.connectSrc.includes('https://tile.openstreetmap.org'));
check('las imagenes de bancos abiertos se ven', d.imgSrc.includes('https:'));
check('los audios grabados se reproducen', d.mediaSrc.includes('blob:'));
check('las tipografias propias se cargan', d.fontSrc.includes("'self'"));

// --- Lo que debe seguir cerrado ---
check('no se permiten plugins', d.objectSrc.length === 1 && d.objectSrc[0] === "'none'");
check('nadie puede enmarcar la aplicacion', d.frameAncestors.includes("'self'") && !d.frameAncestors.includes('*'));
check('los formularios solo envian a casa', d.formAction.length === 1 && d.formAction[0] === "'self'");
check('sin scripts en linea sueltos', !d.scriptSrc.includes("'unsafe-inline'"));
check('sin eval', !d.scriptSrc.includes("'unsafe-eval'"));
check('la base de las URLs no se puede cambiar', d.baseUri.length === 1 && d.baseUri[0] === "'self'");
check('nada http en los origenes permitidos', !JSON.stringify(d).includes('http://'));

console.log(fallos ? `\n${fallos} fallos` : '\nPolitica de contenido correcta');
process.exit(fallos ? 1 : 0);
