import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './http-error.js';

export type UserRole = 'teacher' | 'student' | 'admin';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  /** `qr` identifica sesiones iniciadas con codigo QR de alumno. */
  kind: 'session' | 'qr';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: (payload.kind === 'qr' ? env.JWT_QR_EXPIRES_IN : env.JWT_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) {
      throw HttpError.unauthorized('Token malformado');
    }
    return decoded as unknown as AccessTokenPayload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw HttpError.unauthorized('Token invalido o expirado');
  }
}
