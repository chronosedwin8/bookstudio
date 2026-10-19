import { mediaApi } from '@/services/api';

/**
 * Vectorizar una imagen en el navegador, con imagetracerjs (dominio publico).
 *
 * Magnific, el proveedor de IA que ya usa BookStudio, no ofrece vectorizar, y
 * hacerlo aqui no gasta creditos ni manda la imagen a nadie. El resultado es un
 * SVG de manchas de color: queda nitido a cualquier tamano.
 *
 * Para leer los pixeles hace falta que la imagen no "contamine" el canvas: las
 * nuestras se piden a /api/media/raw (mismo dominio); las de fuera se intentan
 * con CORS y, si su servidor no lo permite, se avisa.
 */

/** Lado maximo con el que se traza: mas grande no gana detalle y tarda mucho. */
const LADO_MAXIMO = 900;

export type Detalle = 'simple' | 'detallado';

async function cargar(fileUrl: string): Promise<HTMLImageElement> {
  const propia = fileUrl.startsWith('/storage/') || !/^https?:\/\//.test(fileUrl) || fileUrl.includes('amazonaws.com');
  let src = fileUrl;
  let liberar: string | null = null;
  if (propia) {
    try {
      liberar = URL.createObjectURL(await mediaApi.raw(fileUrl));
      src = liberar;
    } catch {
      // Si no es nuestra, se intenta tal cual con CORS.
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolve(img);
      if (liberar) setTimeout(() => URL.revokeObjectURL(liberar!), 1000);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen para vectorizarla.'));
    img.src = src;
  });
}

/** Devuelve el SVG como data URL, listo para subir. */
export async function vectorizar(fileUrl: string, detalle: Detalle = 'detallado'): Promise<string> {
  const img = await cargar(fileUrl);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite vectorizar.');
  ctx.drawImage(img, 0, 0, w, h);
  let datos: ImageData;
  try {
    datos = ctx.getImageData(0, 0, w, h);
  } catch {
    throw new Error('Esta imagen viene de otro sitio que no deja leerla. Súbela desde tu equipo y vectorízala.');
  }

  // Se carga solo al usarlo: son ~50 KB que la mayoria nunca necesita.
  const ImageTracer = (await import('imagetracerjs')).default as {
    imagedataToSVG: (d: ImageData, o: Record<string, unknown>) => string;
  };
  const svg = ImageTracer.imagedataToSVG(datos, {
    numberofcolors: detalle === 'simple' ? 8 : 24,
    pathomit: detalle === 'simple' ? 16 : 6,
    ltres: 1,
    qtres: 1,
    roundcoords: 1,
    blurradius: detalle === 'simple' ? 2 : 0,
    viewbox: true,
    desc: false,
  });
  // Sin width/height fijos: que llene la caja que le toque en la hoja.
  const limpio = svg.replace(/<svg ([^>]*?)width="[^"]*" height="[^"]*"/, '<svg $1');
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(limpio)))}`;
}
