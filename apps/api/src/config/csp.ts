/**
 * Politica de contenido de la web servida en produccion.
 *
 * Solo se enumeran los origenes que la aplicacion necesita de verdad; todo lo demas
 * queda prohibido. Las imagenes y los sonidos se permiten desde cualquier https
 * porque vienen de bancos abiertos (Wikimedia, Flickr, Openverse) que reparten el
 * contenido por decenas de dominios distintos.
 */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.paddle.com'],
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
  workerSrc: ["'self'", 'blob:'],
  /*
   * Desde el 5 de octubre de 2026, ademas de los propios, Paddle.js: abre la
   * ventana de pago de Paddle (un iframe de buy.paddle.com, que ya cabe en
   * frameSrc) y habla con su API. Solo su CDN, no cualquier origen.
   *
   * Paddle.js intenta cargar tambien ProfitWell (public.profitwell.com), la
   * analitica de retencion de Paddle. Se deja BLOQUEADO a proposito: el pago no
   * lo necesita y el aviso de privacidad dice que no hay analitica. El navegador
   * lo anota en la consola; es esperado.
   *
   * Antes: solo scripts propios. Hasta el 30 de septiembre de 2026 se abria a Mercado
   * Pago para montar su formulario de tarjeta; desde que se cobra con enlaces de
   * pago (que se abren en su propia pagina) ya no hace falta, y cada dominio de
   * menos es una puerta de menos.
   */
  scriptSrc: ["'self'", 'https://cdn.paddle.com'],
  connectSrc: ["'self'", 'https://tile.openstreetmap.org', 'https://*.paddle.com'],

  // Que se puede incrustar lo decide el servidor en embeds.ts, con lista cerrada de
  // proveedores. Aqui basta con exigir https porque PeerTube y H5P se alojan en el
  // servidor de cada centro y no tienen un dominio fijo que enumerar.
  frameSrc: ["'self'", 'https:'],
};
