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
  // El formulario de pago trae sus propios estilos y tipografias de mlstatic.
  styleSrc: ["'self'", "'unsafe-inline'", 'https://*.mlstatic.com'],
  fontSrc: ["'self'", 'data:', 'https://*.mlstatic.com'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
  workerSrc: ["'self'", 'blob:'],
  // El cobro lo monta el SDK de Mercado Pago desde sus propios dominios.
  scriptSrc: [
    "'self'",
    'https://sdk.mercadopago.com',
    'https://*.mercadopago.com',
    'https://*.mlstatic.com',
  ],
  connectSrc: [
    "'self'",
    'https://api.mercadopago.com',
    'https://*.mercadopago.com',
    // Los bricks piden los medios de pago a la API de Mercado Libre, no a la de
    // Mercado Pago. Sin esta linea el formulario se queda cargando para siempre y
    // no da ningun error: es exactamente el fallo que aparecio al pagar una
    // cuenta de cobro el 3 de septiembre de 2026.
    'https://api.mercadolibre.com',
    'https://*.mercadolibre.com',
    'https://*.mlstatic.com',
    'https://tile.openstreetmap.org',
  ],
  // Que se puede incrustar lo decide el servidor en embeds.ts, con lista cerrada de
  // proveedores. Aqui basta con exigir https porque PeerTube y H5P se alojan en el
  // servidor de cada centro y no tienen un dominio fijo que enumerar.
  frameSrc: ["'self'", 'https:'],
};
