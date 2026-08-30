import type { NextFunction, Request, Response } from 'express';
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
