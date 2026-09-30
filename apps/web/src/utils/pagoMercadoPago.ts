/**
 * Ir a pagar a la pagina de Mercado Pago y saber, al volver, que pago era.
 *
 * Antes de salir se guarda la referencia (y, en las altas nuevas, el secreto con
 * el que se recibe la sesion de la cuenta) en sessionStorage: sobrevive a ir y
 * volver de Mercado Pago en la misma pestana, no sale nunca de este navegador y
 * desaparece al cerrarla. El secreto no viaja en ninguna URL.
 */

const CLAVE = 'bookstudio:pago-mp';

export interface PagoPendiente {
  reference: string;
  kind: 'plan' | 'charge';
  /** Solo en altas nuevas. */
  claim?: string;
  /** El correo, para poder decir con cual entrar si hace falta. */
  email?: string;
}

export function guardarPagoPendiente(pago: PagoPendiente): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(pago));
  } catch {
    // Sin almacenamiento el pago sigue funcionando: solo no se recibira la sesion
    // sola al volver, y habra que entrar con el correo y la contrasena.
  }
}

export function leerPagoPendiente(reference: string): PagoPendiente | null {
  try {
    const dato = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as PagoPendiente | null;
    return dato && dato.reference === reference ? dato : null;
  } catch {
    return null;
  }
}

export function olvidarPagoPendiente(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // nada que hacer
  }
}

/** Salir a la pagina de pago de Mercado Pago. */
export function irAMercadoPago(initPoint: string): void {
  window.location.assign(initPoint);
}
