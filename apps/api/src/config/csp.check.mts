/**
 * Comprobacion de la politica de contenido. Se ejecuta con:
 *   npx tsx apps/api/src/config/csp.check.mts
 *
 * Vigila que la politica siga cerrada. Desde el 30 de septiembre de 2026 se cobra
 * con enlaces de pago de Mercado Pago, que se abren en su propia pagina: ya no hay
 * ningun motivo para dejar entrar scripts ni conexiones de sus dominios aqui.
 */
import { CSP_DIRECTIVES } from './csp.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const d = CSP_DIRECTIVES as Record<string, string[]>;

// --- Sin cobro dentro de la aplicacion, nada de Mercado Pago aqui ---
check(
  'solo scripts propios y Paddle.js',
  d.scriptSrc.length === 2 && d.scriptSrc.includes("'self'") && d.scriptSrc.includes('https://cdn.paddle.com'),
);
check('ni scripts de Mercado Pago', !d.scriptSrc.some((o) => /mercadopago|mlstatic/.test(o)));
check('Paddle puede hablar con su API', d.connectSrc.includes('https://*.paddle.com'));
check(
  'sin la analitica de Paddle (ProfitWell): el aviso de privacidad dice que no hay',
  ![...d.scriptSrc, ...d.connectSrc].some((o) => /profitwell/.test(o)),
);
check('y su ventana de pago cabe en un iframe', d.frameSrc.includes('https:'));
check(
  'ni conexiones a Mercado Pago',
  !d.connectSrc.some((o) => /mercadopago|mercadolibre|mlstatic/.test(o)),
);
check('ni sus estilos o tipografias', ![...d.styleSrc, ...d.fontSrc].some((o) => o.includes('mlstatic')));

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
