/**
 * Comprobacion de la entrada con la cuenta del colegio. Se ejecuta con:
 *   npx tsx apps/api/src/modules/auth/sso.check.mts
 *
 * Prueba las tres defensas del SSO, que son silenciosas: si alguna se cae nadie
 * ve un error, simplemente entra quien no debia. El nonce evita reutilizar una
 * identidad de otra sesion, el tenant deja fuera a otros directorios de Microsoft
 * y el dominio a cualquier correo que no sea del colegio. Se prueba tambien el
 * destino de vuelta, que sin filtro seria un rebote a cualquier pagina.
 */

// El modulo de entorno lee process.env al cargarse: hay que ponerlo antes.
process.env.JWT_SECRET ??= 'secreto-de-prueba-para-comprobaciones-1234';
process.env.PGHOST ??= 'localhost';
process.env.PGUSER ??= 'postgres';
process.env.PGPASSWORD ??= '';
process.env.PGDATABASE ??= 'bookstudio';
process.env.ENTRA_TENANT_ID = 'tenant-del-colegio';
process.env.ENTRA_CLIENT_ID = 'cliente-bookstudio';
process.env.ENTRA_CLIENT_SECRET = 'secreto';
process.env.ENTRA_ALLOWED_DOMAIN = 'colegioaleman.edu.co';
process.env.APP_URL = 'https://bookstudio.uk';

const { destinoSeguro, redirectUri, ssoConfigurado, urlDeEntrada, validarReclamaciones } = await import(
  './sso.service.js'
);

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

/** Verdadero si la llamada lanza; sirve para comprobar los rechazos. */
const rechaza = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const NONCE = 'abc123';
const valido = { nonce: NONCE, tid: 'tenant-del-colegio', email: 'Profe@ColegioAleman.edu.co', name: 'Profe' };

// --- Configuracion ---
check('se detecta configurado con las tres piezas', ssoConfigurado());
check(
  'la vuelta se deduce de APP_URL',
  redirectUri() === 'https://bookstudio.uk/api/auth/sso/callback',
  redirectUri(),
);

// --- Direccion de entrada ---
const url = new URL(urlDeEntrada('/libraries/abc'));
check('apunta al directorio del colegio', url.pathname.startsWith('/tenant-del-colegio/'), url.pathname);
check('pide codigo de autorizacion', url.searchParams.get('response_type') === 'code');
check('pide el correo y el nombre', url.searchParams.get('scope') === 'openid profile email');
check('lleva nonce', (url.searchParams.get('nonce') ?? '').length >= 16);
check('lleva state firmado', (url.searchParams.get('state') ?? '').split('.').length === 3);
check('el nonce cambia en cada entrada', new URL(urlDeEntrada('/')).searchParams.get('nonce') !== url.searchParams.get('nonce'));
check('el secreto no viaja al navegador', !urlDeEntrada('/').includes('secreto'));

// --- Validacion de la identidad ---
check('acepta una cuenta del colegio', validarReclamaciones(valido, NONCE) === 'profe@colegioaleman.edu.co');
check('normaliza el correo a minusculas', validarReclamaciones(valido, NONCE) === validarReclamaciones(valido, NONCE).toLowerCase());
check('rechaza un nonce distinto', rechaza(() => validarReclamaciones(valido, 'otro')));
check('rechaza una identidad sin nonce', rechaza(() => validarReclamaciones({ ...valido, nonce: undefined }, NONCE)));
check('rechaza otro directorio de Microsoft', rechaza(() => validarReclamaciones({ ...valido, tid: 'otro-tenant' }, NONCE)));
check(
  'rechaza un correo de fuera del colegio',
  rechaza(() => validarReclamaciones({ ...valido, email: 'alguien@gmail.com' }, NONCE)),
);
check(
  'no se cuela un dominio que solo termina parecido',
  rechaza(() => validarReclamaciones({ ...valido, email: 'alguien@nocolegioaleman.edu.co' }, NONCE)),
);
check(
  'rechaza una identidad sin correo',
  rechaza(() => validarReclamaciones({ nonce: NONCE, tid: 'tenant-del-colegio' }, NONCE)),
);
check(
  'acepta el correo cuando solo viene como preferred_username',
  validarReclamaciones({ nonce: NONCE, tid: 'tenant-del-colegio', preferred_username: 'ana@colegioaleman.edu.co' }, NONCE) ===
    'ana@colegioaleman.edu.co',
);

// --- Destino de vuelta ---
check('conserva una ruta interna', destinoSeguro('/libraries/abc') === '/libraries/abc');
check('descarta un sitio externo', destinoSeguro('https://malo.example') === '/dashboard');
check('descarta el rebote con doble barra', destinoSeguro('//malo.example') === '/dashboard');
check('descarta el rebote con barra invertida', destinoSeguro('/\\malo.example') === '/dashboard');
check('sin destino manda al panel', destinoSeguro(undefined) === '/dashboard');

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
