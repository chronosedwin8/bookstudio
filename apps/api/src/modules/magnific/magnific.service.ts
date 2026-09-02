import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { storeBuffer } from '../media/uploads.service.js';
import type { GenerateImageInput } from './magnific.schemas.js';

/**
 * Imagenes generadas con Magnific.
 *
 * La clave no sale nunca del servidor: el navegador pide "quiero esta imagen" y
 * es la API quien habla con Magnific. Si la clave viajara al navegador,
 * cualquiera con las herramientas de desarrollo podria gastar los creditos del
 * colegio.
 *
 * El trabajo es asincrono: se crea una tarea y se pregunta por ella hasta que
 * termina. Se consulta desde aqui en lugar de usar el webhook de Magnific porque
 * asi no hace falta abrir un endpoint publico ni guardar tareas en la base de
 * datos; una generacion tarda unos quince segundos y no compensa la maquinaria.
 */

const BASE = 'https://api.magnific.com';
const TIEMPO_LIMITE_MS = 30_000;

export function magnificConfigurado(): boolean {
  return env.MAGNIFIC_API_KEY.length > 0;
}

/** Quien puede gastar creditos. El alumnado solo si se abre a proposito. */
export function puedeGenerar(role: string): boolean {
  return role === 'teacher' || role === 'admin' || env.MAGNIFIC_ALLOW_STUDENTS;
}

interface RespuestaTarea {
  data?: {
    task_id?: string;
    status?: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    error?: string | null;
    generated?: string[];
    has_nsfw?: boolean[];
  };
  message?: string;
}

async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<RespuestaTarea> {
  if (!magnificConfigurado()) {
    throw HttpError.badRequest('La generacion de imagenes no esta configurada');
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: {
        'x-magnific-api-key': env.MAGNIFIC_API_KEY,
        'Content-Type': 'application/json',
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
  } catch {
    throw HttpError.badGateway('No se pudo contactar con Magnific');
  }

  const datos = (await respuesta.json().catch(() => ({}))) as RespuestaTarea;

  if (!respuesta.ok) {
    // El 401 solo puede ser cosa nuestra: la clave del servidor esta mal o
    // caducada. Decirle al docente "no autorizado" le haria buscar donde no es.
    if (respuesta.status === 401) {
      throw HttpError.badGateway('La clave de Magnific no es valida; revisa MAGNIFIC_API_KEY');
    }
    if (respuesta.status === 429) {
      throw HttpError.badRequest('Magnific esta recibiendo demasiadas peticiones. Prueba en un minuto.');
    }
    throw HttpError.badGateway(datos.message ?? `Magnific respondio ${respuesta.status}`);
  }

  return datos;
}

/**
 * Quien pidio cada tarea, para que nadie consulte la de otro, y el resultado ya
 * guardado, para no volver a descargarlo si se pregunta dos veces.
 *
 * Vive en memoria: un reinicio pierde las generaciones en vuelo, que son unos
 * segundos. La alternativa era una tabla para algo que caduca enseguida.
 */
interface Tarea {
  userId: string;
  creada: number;
  fileUrl?: string;
}

const tareas = new Map<string, Tarea>();
const VIDA_TAREA_MS = 30 * 60_000;

function limpiarTareasViejas(): void {
  const ahora = Date.now();
  for (const [id, tarea] of tareas) {
    if (ahora - tarea.creada > VIDA_TAREA_MS) tareas.delete(id);
  }
}

export interface EstadoGeneracion {
  taskId: string;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  /** Solo al terminar: la imagen ya copiada a nuestro almacenamiento. */
  fileUrl?: string;
  error?: string;
}

export async function generar(userId: string, input: GenerateImageInput): Promise<EstadoGeneracion> {
  limpiarTareasViejas();

  const datos = await llamar('POST', '/v1/ai/mystic', {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    model: input.model,
    resolution: input.resolution,
    adherence: input.adherence,
    // Es material escolar: el filtro no se toca desde fuera.
    filter_nsfw: true,
  });

  const taskId = datos.data?.task_id;
  if (!taskId) throw HttpError.badGateway('Magnific no devolvio ninguna tarea');

  tareas.set(taskId, { userId, creada: Date.now() });
  return { taskId, status: datos.data?.status ?? 'CREATED' };
}

export async function consultar(userId: string, taskId: string): Promise<EstadoGeneracion> {
  const tarea = tareas.get(taskId);
  if (!tarea) {
    throw HttpError.notFound('Esa generacion ya no esta disponible. Vuelve a pedirla.');
  }
  if (tarea.userId !== userId) throw HttpError.notFound('Esa generacion ya no esta disponible. Vuelve a pedirla.');

  // Ya descargada: no se vuelve a pedir ni se guarda una segunda copia.
  if (tarea.fileUrl) return { taskId, status: 'COMPLETED', fileUrl: tarea.fileUrl };

  const datos = await llamar('GET', `/v1/ai/mystic/${taskId}`);
  const status = datos.data?.status ?? 'IN_PROGRESS';

  if (status === 'FAILED') {
    tareas.delete(taskId);
    return { taskId, status, error: datos.data?.error ?? 'Magnific no pudo generar la imagen' };
  }
  if (status !== 'COMPLETED') return { taskId, status };

  const origen = datos.data?.generated?.[0];
  if (!origen) {
    tareas.delete(taskId);
    return { taskId, status: 'FAILED', error: 'Magnific termino sin devolver ninguna imagen' };
  }

  // El filtro va puesto, pero si aun asi marca la imagen, no se guarda.
  if (datos.data?.has_nsfw?.[0]) {
    tareas.delete(taskId);
    return { taskId, status: 'FAILED', error: 'La imagen no paso el filtro de contenido' };
  }

  const fileUrl = await copiarANuestroAlmacen(userId, origen);
  tarea.fileUrl = fileUrl;
  return { taskId, status: 'COMPLETED', fileUrl };
}

/**
 * Trae la imagen a nuestro almacenamiento.
 *
 * Imprescindible: la direccion que da Magnific viene firmada y **caduca en una
 * hora**. Guardar ese enlace en el libro dejaria la pagina con un hueco el mismo
 * dia. Al copiarla, ademas, pasa por las mismas comprobaciones que cualquier
 * subida y se borra con la cuenta de quien la creo.
 */
async function copiarANuestroAlmacen(userId: string, url: string): Promise<string> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_LIMITE_MS) });
  } catch {
    throw HttpError.badGateway('No se pudo descargar la imagen generada');
  }
  if (!respuesta.ok) throw HttpError.badGateway('No se pudo descargar la imagen generada');

  const tipo = (respuesta.headers.get('content-type') ?? 'image/png').split(';')[0].trim().toLowerCase();
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  const guardado = await storeBuffer(userId, bytes, tipo);
  return guardado.fileUrl;
}
