import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { ClienteS3 } from './s3-client.js';

/**
 * Almacenamiento del contenido multimedia.
 *
 * Dos motores con la misma forma:
 *
 *   - **disco**: lo de siempre, `storage/{tipo}/{usuario}/{archivo}`. Sirve para
 *     desarrollo y para una instalacion pequena.
 *   - **s3**: el mismo arbol dentro del bucket, bajo un prefijo propio. El prefijo
 *     importa porque el bucket puede estar compartido con otra cosa y no se deben
 *     pisar objetos ajenos.
 *
 * La estructura es identica en los dos, y por usuario a proposito: borrar a una
 * persona es borrar su carpeta, sin llevar un inventario de sus archivos.
 *
 *   bookstudio/
 *     image/{usuario}/{uuid}.png
 *     audio/{usuario}/{uuid}.mp3
 *     video/{usuario}/{uuid}.mp4
 */

export type UploadKind = 'audio' | 'video' | 'image';
export const KINDS: UploadKind[] = ['image', 'audio', 'video'];

export const STORAGE_ROOT = join(process.cwd(), 'storage');
export const STORAGE_URL_PREFIX = '/storage';

/** Un ano: el nombre lleva un uuid, asi que el contenido de una clave nunca cambia. */
const CACHE_LARGA = 'public, max-age=31536000, immutable';

export const usaS3 = (): boolean => Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID);

export const claveDe = (kind: UploadKind, userId: string, fileName: string): string =>
  `${kind}/${userId}/${fileName}`;

export interface Almacen {
  guardar(kind: UploadKind, userId: string, fileName: string, cuerpo: Buffer, mimeType: string): Promise<string>;
  /** Borra todo lo de una persona. Se usa al eliminar su cuenta. */
  borrarDeUsuario(userId: string): Promise<number>;
  readonly nombre: string;
}

// ------------------------------------------------------------------ En disco

const enDisco: Almacen = {
  nombre: 'disco',

  async guardar(kind, userId, fileName, cuerpo) {
    const directorio = join(STORAGE_ROOT, kind, userId);
    await mkdir(directorio, { recursive: true });
    await writeFile(join(directorio, fileName), cuerpo);
    return `${STORAGE_URL_PREFIX}/${claveDe(kind, userId, fileName)}`;
  },

  async borrarDeUsuario(userId) {
    let carpetas = 0;
    for (const kind of KINDS) {
      await rm(join(STORAGE_ROOT, kind, userId), { recursive: true, force: true });
      carpetas += 1;
    }
    return carpetas;
  },
};

// ---------------------------------------------------------------------- S3

let cliente: ClienteS3 | null = null;

function s3(): ClienteS3 {
  cliente ??= new ClienteS3({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  });
  return cliente;
}

/** Carpeta raiz dentro del bucket. Todo lo de BookStudio cuelga de aqui. */
const prefijo = (resto: string): string => `${env.S3_PREFIX.replace(/\/+$/, '')}/${resto}`;

const enS3: Almacen = {
  nombre: 's3',

  async guardar(kind, userId, fileName, cuerpo, mimeType) {
    const clave = prefijo(claveDe(kind, userId, fileName));
    await s3().subir(clave, cuerpo, mimeType, CACHE_LARGA);

    // Con CDN delante se sirve por S3_PUBLIC_URL; si no, por la URL del bucket.
    if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${clave}`;
    return s3().urlDe(clave);
  },

  async borrarDeUsuario(userId) {
    let borrados = 0;
    for (const kind of KINDS) {
      const claves = await s3().listar(prefijo(`${kind}/${userId}/`));
      for (const clave of claves) {
        await s3().borrar(clave);
        borrados += 1;
      }
    }
    return borrados;
  },
};

/** El motor en uso. Se decide por configuracion, no por codigo. */
export const almacen = (): Almacen => (usaS3() ? enS3 : enDisco);

export interface EstadoAlmacen {
  motor: string;
  ok: boolean;
  detalle: string;
  carpetas: string[];
}

/**
 * Comprueba el bucket y deja creada la estructura de carpetas.
 *
 * En S3 las carpetas no existen: son prefijos de las claves. Se escribe un marcador
 * en cada una para que el arbol se vea en la consola de AWS y para confirmar de una
 * vez que las credenciales pueden escribir, no solo leer.
 */
export async function prepararAlmacen(): Promise<EstadoAlmacen> {
  if (!usaS3()) {
    return {
      motor: 'disco',
      ok: true,
      detalle: `Los archivos se guardan en ${STORAGE_ROOT}. Define S3_BUCKET para usar S3.`,
      carpetas: KINDS.map((k) => join(STORAGE_ROOT, k)),
    };
  }

  const carpetas: string[] = [];
  try {
    await s3().comprobar();
    for (const kind of KINDS) {
      const clave = prefijo(`${kind}/.keep`);
      await s3().subir(clave, Buffer.from(`Contenido de BookStudio: ${kind}\n`), 'text/plain');
      carpetas.push(clave);
    }
    return {
      motor: 's3',
      ok: true,
      detalle: `Estructura lista en s3://${env.S3_BUCKET}/${env.S3_PREFIX}/`,
      carpetas,
    };
  } catch (error) {
    return { motor: 's3', ok: false, detalle: (error as Error).message, carpetas };
  }
}
