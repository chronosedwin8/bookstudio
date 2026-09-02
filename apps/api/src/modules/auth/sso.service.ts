import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken, type UserRole } from '../../lib/tokens.js';

/**
 * Entrada con la cuenta del colegio (Microsoft Entra ID).
 *
 * Se usa el flujo de codigo de autorizacion con cliente confidencial: el
 * navegador solo lleva un codigo de un solo uso, y el intercambio por el token
 * lo hace el servidor con el secreto. Asi el secreto nunca pisa el navegador.
 *
 * Sobre la firma del id_token: no se valida contra las claves publicas de
 * Microsoft, y es correcto. En este flujo el token no viene del navegador sino
 * de una llamada directa del servidor al endpoint de Microsoft sobre TLS, que es
 * justo la excepcion que contempla OIDC Core 3.1.3.7: si el canal es de
 * confianza, no hace falta verificar la firma. Si algun dia el token llegara por
 * el navegador (flujo implicito), habria que validarla si o si.
 */

const AUTORIDAD = 'https://login.microsoftonline.com';
/** El state y el nonce viven lo justo para completar la vuelta. */
const VIDA_ESTADO = '10m';

export interface EstadoSso {
  nonce: string;
  /** A donde volver dentro de la aplicacion una vez dentro. */
  redirect: string;
  kind: 'sso-state';
}

export function ssoConfigurado(): boolean {
  return Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET);
}

/** A donde vuelve Microsoft. Debe coincidir con el Redirect URI registrado. */
export function redirectUri(): string {
  return env.ENTRA_REDIRECT_URI || `${env.APP_URL.replace(/\/$/, '')}/api/auth/sso/callback`;
}

/** Direccion a la que se manda al navegador para que se identifique. */
export function urlDeEntrada(redirect: string): string {
  if (!ssoConfigurado()) {
    throw HttpError.badRequest('La entrada con la cuenta del colegio no esta configurada');
  }

  const nonce = randomBytes(16).toString('hex');
  const estado: EstadoSso = { nonce, redirect, kind: 'sso-state' };
  const state = jwt.sign(estado, env.JWT_SECRET, { expiresIn: VIDA_ESTADO });

  const parametros = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    // openid da el id_token; email y profile, el correo y el nombre para mostrar.
    scope: 'openid profile email',
    state,
    nonce,
  });

  return `${AUTORIDAD}/${env.ENTRA_TENANT_ID}/oauth2/v2.0/authorize?${parametros.toString()}`;
}

function leerEstado(state: string): EstadoSso {
  try {
    const datos = jwt.verify(state, env.JWT_SECRET);
    if (typeof datos === 'string' || (datos as EstadoSso).kind !== 'sso-state') {
      throw HttpError.badRequest('Estado de la sesion no valido');
    }
    return datos as unknown as EstadoSso;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Caducado o manipulado: en ambos casos se repite la entrada, no se sigue.
    throw HttpError.badRequest('La entrada caduco. Vuelve a intentarlo.');
  }
}

interface Reclamaciones {
  oid?: string;
  sub?: string;
  tid?: string;
  nonce?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
}

/** Lee el contenido del id_token. La firma no se comprueba: ver la nota de arriba. */
function leerIdToken(idToken: string): Reclamaciones {
  const partes = idToken.split('.');
  if (partes.length !== 3) throw HttpError.badRequest('Microsoft devolvio un token que no se entiende');
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')) as Reclamaciones;
  } catch {
    throw HttpError.badRequest('Microsoft devolvio un token que no se entiende');
  }
}

export interface ResultadoSso {
  token: string;
  redirect: string;
  /** Primera vez que entra: sirve para dar la bienvenida. */
  creado: boolean;
}

export async function completarEntrada(code: string, state: string): Promise<ResultadoSso> {
  if (!ssoConfigurado()) throw HttpError.badRequest('La entrada con la cuenta del colegio no esta configurada');

  const estado = leerEstado(state);

  const respuesta = await fetch(`${AUTORIDAD}/${env.ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.ENTRA_CLIENT_ID,
      client_secret: env.ENTRA_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      scope: 'openid profile email',
    }),
  });

  if (!respuesta.ok) {
    // El detalle de Microsoft es util al configurar y no expone nada del alumnado.
    const detalle = await respuesta.text();
    throw HttpError.badRequest(`Microsoft rechazo la entrada: ${detalle.slice(0, 300)}`);
  }

  const { id_token: idToken } = (await respuesta.json()) as { id_token?: string };
  if (!idToken) throw HttpError.badRequest('Microsoft no devolvio la identidad');

  const claims = leerIdToken(idToken);
  const email = validarReclamaciones(claims, estado.nonce);

  const { user, creado } = await buscarOCrear(email, claims.name ?? email.split('@')[0]);
  return {
    token: signAccessToken({ sub: user.id, role: user.role, kind: 'session' }),
    redirect: estado.redirect,
    creado,
  };
}

/**
 * Comprueba que la identidad recibida es la que se pidio y que puede entrar.
 * Devuelve el correo ya normalizado.
 *
 * Vive aparte de la llamada de red para poder probarla: es donde estan las tres
 * defensas que importan (nonce, directorio y dominio).
 */
export function validarReclamaciones(claims: Reclamaciones, nonceEsperado: string): string {
  // El nonce ata esta respuesta a la peticion que salio de aqui. Sin esta
  // comprobacion, un id_token obtenido en otra sesion serviria para entrar.
  if (!claims.nonce || claims.nonce !== nonceEsperado) {
    throw HttpError.badRequest('La entrada no coincide con la peticion');
  }

  // Solo el directorio del colegio: el mismo endpoint sirve a cualquier tenant.
  if (env.ENTRA_TENANT_ID !== 'common' && claims.tid && claims.tid !== env.ENTRA_TENANT_ID) {
    throw HttpError.forbidden('Esa cuenta no pertenece al colegio');
  }

  const email = (claims.email ?? claims.preferred_username ?? claims.upn ?? '').toLowerCase().trim();
  if (!email.includes('@')) throw HttpError.badRequest('La cuenta de Microsoft no tiene correo');

  const dominio = env.ENTRA_ALLOWED_DOMAIN.toLowerCase().trim();
  if (dominio && !email.endsWith(`@${dominio}`)) {
    throw HttpError.forbidden(`Solo se permiten cuentas @${dominio}`);
  }

  return email;
}

/**
 * A donde se puede volver tras entrar.
 *
 * Solo rutas internas: sin este filtro, el parametro serviria para rebotar a
 * cualquier sitio y usar el dominio del colegio como cebo. Una direccion que
 * empieza por "//" es externa aunque lo parezca.
 */
export function destinoSeguro(destino: unknown): string {
  if (typeof destino !== 'string') return '/dashboard';
  return destino.startsWith('/') && !destino.startsWith('//') && !destino.startsWith('/\\')
    ? destino
    : '/dashboard';
}

interface CuentaSso {
  id: string;
  role: UserRole;
}

/**
 * Enlaza la cuenta de Microsoft con la de BookStudio por el correo.
 *
 * Si la cuenta ya existe se reutiliza tal cual: NO se le toca la contrasena ni el
 * rol. Un docente que ya trabajaba con su clave sigue pudiendo entrar con ella, y
 * quien ya es administrador no pierde el permiso por entrar por esta puerta.
 */
async function buscarOCrear(email: string, nombre: string): Promise<{ user: CuentaSso; creado: boolean }> {
  const { rows } = await query<CuentaSso & { is_active: boolean }>(
    'SELECT id, role, is_active FROM users WHERE email = $1',
    [email],
  );

  if (rows[0]) {
    if (rows[0].is_active === false) throw HttpError.forbidden('Esta cuenta esta desactivada');
    return { user: rows[0], creado: false };
  }

  // Cuenta nueva: nace sin contrasena util. La columna no admite nulos, asi que se
  // guarda el hash de un valor aleatorio que nadie conoce; para entrar sin SSO
  // habria que pedir un cambio de clave.
  const relleno = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
  const { rows: creadas } = await query<CuentaSso>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, role`,
    [email, relleno, nombre.slice(0, 120), env.ENTRA_DEFAULT_ROLE],
  );

  return { user: creadas[0], creado: true };
}
