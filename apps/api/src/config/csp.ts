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
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
  workerSrc: ["'self'", 'blob:'],
  // El cobro lo monta el SDK de Mercado Pago desde sus propios dominios.
  scriptSrc: ["'self'", 'https://sdk.mercadopago.com', 'https://*.mercadopago.com', 'https://*.mlstatic.com'],
  connectSrc: [
    "'self'",
    'https://api.mercadopago.com',
    'https://*.mercadopago.com',
    'https://*.mlstatic.com',
    'https://tile.openstreetmap.org',
  ],
  // Que se puede incrustar lo decide el servidor en embeds.ts, con lista cerrada de
  // proveedores. Aqui basta con exigir https porque PeerTube y H5P se alojan en el
  // servidor de cada centro y no tienen un dominio fijo que enumerar.
  frameSrc: ["'self'", 'https:'],
};
