import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Reenvia rechazos de promesas al middleware de errores de Express 4. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
