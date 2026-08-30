import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error.js';
import { verifyAccessToken, type UserRole } from '../lib/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: UserRole; kind: 'session' | 'qr' };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(HttpError.unauthorized('Falta el encabezado Authorization'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    req.auth = { userId: payload.sub, role: payload.role, kind: payload.kind };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Identifica al usuario si trae un token valido, pero deja pasar a los anonimos.
 * Lo usan los enlaces compartidos: en publico no hace falta cuenta, y si el libro
 * esta restringido a su clase se comprueba la pertenencia mas adelante.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7).trim());
    req.auth = { userId: payload.sub, role: payload.role, kind: payload.kind };
  } catch {
    // Un token caducado no debe impedir ver un libro publico.
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(HttpError.unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(HttpError.forbidden(`Requiere rol: ${roles.join(' o ')}`));
      return;
    }
    next();
  };
}
