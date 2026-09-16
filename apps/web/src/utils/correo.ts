/**
 * Pedir un correo nuevo para una cuenta ajena.
 *
 * Lo usan la biblioteca (el docente con su alumnado) y la administracion, y las
 * dos tienen que comportarse igual: mismas comprobaciones, mismo texto.
 *
 * El caso que lo motivo: alumnado con un correo de fuera del colegio, que por eso
 * no puede entrar con su cuenta de Microsoft. Da igual si la cuenta se creo a mano
 * o vino de Phidias; la importacion reconoce al alumno por su identificador y no
 * le vuelve a pisar el correo corregido.
 */

/** Suficiente para frenar erratas; la comprobacion de verdad la hace el servidor. */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResultadoCorreo =
  | { tipo: 'cancelado' }
  | { tipo: 'igual' }
  | { tipo: 'invalido'; motivo: string }
  | { tipo: 'nuevo'; email: string };

/** La parte que se puede probar sin navegador: normalizar y validar lo escrito. */
export function interpretarCorreo(escrito: string | null, actual: string | null | undefined): ResultadoCorreo {
  if (escrito === null) return { tipo: 'cancelado' };

  const email = escrito.trim().toLowerCase();
  if (!email) return { tipo: 'cancelado' };
  if (email === (actual ?? '').trim().toLowerCase()) return { tipo: 'igual' };
  if (!FORMA_DE_CORREO.test(email)) {
    return { tipo: 'invalido', motivo: `«${escrito.trim()}» no parece un correo válido.` };
  }
  if (email.endsWith('@qr.local') || email.endsWith('@trial.local')) {
    return { tipo: 'invalido', motivo: 'Ese dominio lo reserva la aplicación; usa un correo real.' };
  }
  return { tipo: 'nuevo', email };
}

/** Las cuentas de acceso con QR no tienen un correo que merezca la pena enseñar. */
export function correoVisible(email: string | null | undefined): string {
  return email && !email.endsWith('@qr.local') ? email : '';
}

export function pedirCorreoNuevo(nombre: string, actual: string | null | undefined): ResultadoCorreo {
  const escrito = window.prompt(
    `Nuevo correo para ${nombre}.\n\n` +
      'Será su usuario para entrar. Si el colegio usa cuentas de Microsoft, pon el del ' +
      'colegio para que pueda entrar con ellas.',
    correoVisible(actual),
  );
  return interpretarCorreo(escrito, actual);
}
