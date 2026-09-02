import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { almacen, STORAGE_ROOT, STORAGE_URL_PREFIX, type UploadKind } from '../../lib/storage.js';

export { STORAGE_ROOT, STORAGE_URL_PREFIX };
export type { UploadKind };

interface MimeRule {
  extension: string;
  kind: UploadKind;
  /** Firma binaria esperada; evita confiar solo en el mime declarado por el cliente. */
  magic?: { offset: number; bytes: number[] }[];
  /** Comprobacion a medida cuando la firma no es una secuencia fija (MP3). */
  matches?: (buffer: Buffer) => boolean;
}

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const OGG = [0x4f, 0x67, 0x67, 0x53];
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const FTYP = [0x66, 0x74, 0x79, 0x70];

/** Un MP3 empieza por la etiqueta ID3 o por un frame sync (11 bits a 1). */
function isMp3(buffer: Buffer): boolean {
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

const ALLOWED: Record<string, MimeRule> = {
  'image/png': { extension: 'png', kind: 'image', magic: [{ offset: 0, bytes: PNG }] },
  'image/jpeg': { extension: 'jpg', kind: 'image', magic: [{ offset: 0, bytes: JPEG }] },
  'image/webp': { extension: 'webp', kind: 'image', magic: [{ offset: 0, bytes: RIFF }] },
  'image/gif': { extension: 'gif', kind: 'image', magic: [{ offset: 0, bytes: GIF }] },
  'audio/webm': { extension: 'webm', kind: 'audio', magic: [{ offset: 0, bytes: EBML }] },
  'audio/ogg': { extension: 'ogg', kind: 'audio', magic: [{ offset: 0, bytes: OGG }] },
  'audio/wav': { extension: 'wav', kind: 'audio', magic: [{ offset: 0, bytes: RIFF }] },
  // Formatos habituales al subir desde el equipo, no solo desde MediaRecorder.
  'audio/mpeg': { extension: 'mp3', kind: 'audio', matches: isMp3 },
  'audio/mp4': { extension: 'm4a', kind: 'audio', magic: [{ offset: 4, bytes: FTYP }] },
  'video/webm': { extension: 'webm', kind: 'video', magic: [{ offset: 0, bytes: EBML }] },
  'video/mp4': { extension: 'mp4', kind: 'video', magic: [{ offset: 4, bytes: FTYP }] },
};

const MAX_BYTES: Record<UploadKind, number> = {
  image: 8 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 60 * 1024 * 1024,
};

function matchesMagic(buffer: Buffer, rule: MimeRule): boolean {
  if (rule.matches) return rule.matches(buffer);
  if (!rule.magic) return true;
  return rule.magic.some(({ offset, bytes }) => bytes.every((b, i) => buffer[offset + i] === b));
}

export interface StoredFile {
  fileUrl: string;
  kind: UploadKind;
  bytes: number;
  mimeType: string;
}

const BASE64_MARKER = ';base64,';
const MIME_PATTERN = /^[a-z]+\/[a-z0-9.+-]+$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/\s]+={0,2}$/;

/**
 * Extrae el tipo y la carga de un data URL. Se parsea a mano en vez de con una
 * expresion regular porque MediaRecorder anexa parametros con comas al tipo
 * (ej. "video/webm;codecs=vp9,opus;base64,...") y el alfabeto base64 no incluye
 * ';', asi que la primera aparicion del marcador siempre separa cabecera y datos.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const markerAt = dataUrl.indexOf(BASE64_MARKER);
  if (!dataUrl.startsWith('data:') || markerAt < 0) {
    throw HttpError.badRequest('El archivo debe enviarse como data URL en base64');
  }

  // La cabecera va entre "data:" y el marcador; los parametros se descartan.
  const mimeType = dataUrl.slice(5, markerAt).split(';')[0].trim().toLowerCase();
  const base64 = dataUrl.slice(markerAt + BASE64_MARKER.length).trim();

  if (!MIME_PATTERN.test(mimeType)) {
    throw HttpError.badRequest('El archivo debe enviarse como data URL en base64');
  }
  // Buffer.from ignora los caracteres invalidos en silencio; validar evita guardar basura.
  if (!base64 || !BASE64_PATTERN.test(base64)) {
    throw HttpError.badRequest('La carga del archivo no es base64 valido');
  }

  return { mimeType, base64 };
}

/** Guarda un data URL emitido por MediaRecorder o la webcam tras validar tipo y tamano. */
export async function storeDataUrl(userId: string, dataUrl: string): Promise<StoredFile> {
  const { mimeType, base64 } = parseDataUrl(dataUrl);
  return storeBuffer(userId, Buffer.from(base64, 'base64'), mimeType);
}

/**
 * Guarda bytes ya en memoria, con las mismas comprobaciones.
 *
 * Existe para lo que no llega del navegador: una imagen que el servidor se
 * descarga de otro sitio ya viene en binario, y convertirla a base64 solo para
 * volver a decodificarla la hincharia un tercio sin ganar nada.
 */
export async function storeBuffer(userId: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const rule = ALLOWED[mimeType];
  if (!rule) {
    throw HttpError.badRequest(`Tipo de archivo no permitido: ${mimeType}`, {
      allowed: Object.keys(ALLOWED),
    });
  }

  if (!buffer.length) throw HttpError.badRequest('El archivo esta vacio');
  if (buffer.length > MAX_BYTES[rule.kind]) {
    throw HttpError.badRequest(
      `El archivo supera el limite de ${Math.round(MAX_BYTES[rule.kind] / 1024 / 1024)} MB`,
    );
  }
  if (!matchesMagic(buffer, rule)) {
    throw HttpError.badRequest('El contenido del archivo no coincide con el tipo declarado');
  }

  // Un directorio por usuario evita colisiones y hace que borrar a alguien sea
  // borrar su carpeta, sin llevar un inventario de sus archivos.
  const fileName = `${randomUUID()}.${rule.extension}`;
  const fileUrl = await almacen().guardar(rule.kind, userId, fileName, buffer, mimeType);

  return { fileUrl, kind: rule.kind, bytes: buffer.length, mimeType };
}

export const uploadLimits = {
  allowedMimeTypes: Object.keys(ALLOWED),
  maxBytes: MAX_BYTES,
  isProduction: env.NODE_ENV === 'production',
};
