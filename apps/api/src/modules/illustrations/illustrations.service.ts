import { createHash } from 'node:crypto';
import { query } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { analizar, iaDisponible, type ResultadoAnalisis } from './analisis.service.js';
import {
  escenaSchema,
  VERSION_CATALOGO,
  VERSION_ESCENA,
  type AnalizarInput,
  type Escena,
} from './illustrations.schemas.js';

/**
 * Ilustraciones guardadas.
 *
 * Guardar una escena sirve para dos cosas: reutilizarla en varias paginas (o en
 * varios libros) sin volver a describirla, y no repetir una consulta a la IA que
 * ya se hizo. Lo segundo es lo que evita que preparar una unidad didactica de
 * quince paginas se convierta en quince llamadas de pago.
 */

export interface Ilustracion {
  id: string;
  prompt: string;
  escena: Escena;
  origen: string;
  createdAt: string;
}

interface Fila {
  id: string;
  prompt: string;
  escena: unknown;
  origen: string;
  created_at: Date;
}

const aIlustracion = (fila: Fila): Ilustracion => ({
  id: fila.id,
  prompt: fila.prompt,
  // Lo guardado se vuelve a validar al leerlo: una fila escrita con un catalogo
  // anterior no puede colarse con valores que el dibujo actual no conozca.
  escena: escenaSchema.parse(fila.escena),
  origen: fila.origen,
  createdAt: fila.created_at.toISOString(),
});

/**
 * La huella de una peticion.
 *
 * Se normaliza antes (espacios, mayusculas y acentos) para que "Tres Estudiantes
 * con tablets" y "tres estudiantes con tablets" no se paguen dos veces.
 */
export function huellaDe(entrada: AnalizarInput): string {
  const texto = entrada.texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

  const pistas = [entrada.tema ?? '', entrada.fondo ?? '', entrada.personajes ?? ''].join('|');
  return createHash('sha256').update(`${texto}|${pistas}`).digest('hex').slice(0, 64);
}

/** Lo que se apunta como origen, para poder distinguir despues de donde salio. */
const origenDe = (resultado: ResultadoAnalisis): string =>
  resultado.modo === 'ia' ? env.ILLUSTRATION_AI_MODEL.slice(0, 60) : 'mock';

/**
 * Compone una escena a partir de un texto, reutilizando la de antes si la hay.
 *
 * La cache es por persona: dos docentes que escriben lo mismo reciben cada uno
 * su fila. Cuesta una consulta de mas y evita que el texto que escribio alguien
 * viaje a la pantalla de otro.
 */
export async function generar(
  userId: string,
  entrada: AnalizarInput,
): Promise<{ ilustracion: Ilustracion; reutilizada: boolean; aviso?: string }> {
  const huella = huellaDe(entrada);

  const guardada = await query<Fila>(
    `SELECT id, prompt, escena, origen, created_at
       FROM illustrations
      WHERE created_by = $1 AND huella = $2
        AND version_escena = $3 AND version_catalogo = $4`,
    [userId, huella, VERSION_ESCENA, VERSION_CATALOGO],
  );

  if (guardada.rows[0]) {
    return { ilustracion: aIlustracion(guardada.rows[0]), reutilizada: true };
  }

  const resultado = await analizar(entrada);

  const creada = await query<Fila>(
    `INSERT INTO illustrations
       (created_by, prompt, huella, escena, version_escena, version_catalogo, origen)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (created_by, huella, version_escena, version_catalogo)
       DO UPDATE SET updated_at = NOW()
     RETURNING id, prompt, escena, origen, created_at`,
    [
      userId,
      entrada.texto.slice(0, 500),
      huella,
      JSON.stringify(resultado.escena),
      VERSION_ESCENA,
      VERSION_CATALOGO,
      origenDe(resultado),
    ],
  );

  return { ilustracion: aIlustracion(creada.rows[0]), reutilizada: false, aviso: resultado.aviso };
}

/** Guarda una escena escrita o retocada a mano, sin pasar por el analisis. */
export async function guardar(
  userId: string,
  prompt: string,
  escena: Escena,
): Promise<Ilustracion> {
  const huella = huellaDe({ texto: prompt || JSON.stringify(escena).slice(0, 400) });

  const fila = await query<Fila>(
    `INSERT INTO illustrations
       (created_by, prompt, huella, escena, version_escena, version_catalogo, origen)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual')
     ON CONFLICT (created_by, huella, version_escena, version_catalogo)
       DO UPDATE SET escena = EXCLUDED.escena, updated_at = NOW()
     RETURNING id, prompt, escena, origen, created_at`,
    [userId, prompt.slice(0, 500), huella, JSON.stringify(escena), VERSION_ESCENA, VERSION_CATALOGO],
  );

  return aIlustracion(fila.rows[0]);
}

/** Las guardadas por esta persona, para volver a usarlas. */
export async function listar(userId: string, limite = 40): Promise<Ilustracion[]> {
  const filas = await query<Fila>(
    `SELECT id, prompt, escena, origen, created_at
       FROM illustrations
      WHERE created_by = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(limite, 1), 100)],
  );
  return filas.rows.map(aIlustracion);
}

export async function obtener(userId: string, id: string): Promise<Ilustracion> {
  const filas = await query<Fila>(
    `SELECT id, prompt, escena, origen, created_at
       FROM illustrations
      WHERE id = $1 AND created_by = $2`,
    [id, userId],
  );
  if (!filas.rows[0]) throw HttpError.notFound('La ilustración no existe');
  return aIlustracion(filas.rows[0]);
}

/** Para que la interfaz sepa si decir "creada con IA" o no prometerlo. */
export function estado(): { modo: string; iaActiva: boolean } {
  return { modo: env.ILLUSTRATION_AI_MODE, iaActiva: iaDisponible() };
}
