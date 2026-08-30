import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { HttpError } from '../lib/http-error.js';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        HttpError.badRequest(
          'Datos de entrada invalidos',
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
