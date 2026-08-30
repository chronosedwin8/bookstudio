export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Credenciales invalidas o sesion expirada'): HttpError {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'No tienes permisos para esta accion'): HttpError {
    return new HttpError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Recurso no encontrado'): HttpError {
    return new HttpError(404, message, 'NOT_FOUND');
  }

  static conflict(message: string): HttpError {
    return new HttpError(409, message, 'CONFLICT');
  }
}
