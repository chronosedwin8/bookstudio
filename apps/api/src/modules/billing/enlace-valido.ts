/**
 * Solo enlaces de Mercado Pago, y por https.
 *
 * El enlace se muestra a clientes que van a pagar: una errata o un enlace pegado
 * de otro sitio los mandaria a pagar fuera de Mercado Pago. Tambien descarta
 * cosas como `javascript:`, que en un <a href> ejecutarian codigo.
 */
const DOMINIOS = ['mpago.li', 'mpago.la', 'mercadopago.com.co', 'www.mercadopago.com.co', 'link.mercadopago.com.co'];

export function esEnlaceDeMercadoPago(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && DOMINIOS.includes(u.hostname.toLowerCase()) && !u.username && !u.password;
  } catch {
    return false;
  }
}
