import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

const PG_MESSAGES: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'El registro ya existe' },
  '23503': { status: 400, message: 'Referencia a un registro inexistente' },
  '23514': { status: 400, message: 'Valor fuera del rango permitido' },
  '22P02': { status: 400, message: 'Formato de identificador invalido' },
};

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  /*
   * Una validacion que falla dentro de un servicio, y no en el middleware de
   * entrada, seguia saliendo como 500. Es enganoso por partida doble: quien
   * llama cree que el servidor esta roto cuando lo que mando no era valido, y en
   * el registro aparece un error interno que nadie tiene que arreglar. Pasa, por
   * ejemplo, al modificar un elemento del lienzo con propiedades que no
   * corresponden a su tipo.
   */
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada invalidos',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  const pgError = err as PgError;
  const mapped = pgError.code ? PG_MESSAGES[pgError.code] : undefined;
  if (mapped) {
    res.status(mapped.status).json({
      error: {
        code: `PG_${pgError.code}`,
        message: mapped.message,
        details: isProduction ? undefined : pgError.detail ?? pgError.constraint,
      },
    });
    return;
  }

  console.error('[error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      details: isProduction ? undefined : (err as Error)?.message,
    },
  });
}
