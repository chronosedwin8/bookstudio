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

/** Un SVG con width y height sacados de su viewBox, si no los traia. */
function conTamano(svg: string): Blob {
  const apertura = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  let texto = svg;
  if (apertura && !/\swidth=/.test(apertura)) {
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(apertura);
    const w = vb ? Number(vb[1]) : 1600;
    const h = vb ? Number(vb[2]) : 1200;
    texto = svg.replace(apertura, apertura.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`));
  }
  return new Blob([texto], { type: 'image/svg+xml' });
}

async function cargar(fileUrl: string): Promise<HTMLImageElement> {
  const propia = fileUrl.startsWith('/storage/') || !/^https?:\/\//.test(fileUrl) || fileUrl.includes('amazonaws.com');
  let src = fileUrl;
  let liberar: string | null = null;
  if (propia) {
    try {
      let blob = await mediaApi.raw(fileUrl);
      // Un SVG sin ancho ni alto (los vectorizados de antes del 20-10-2026) no se
      // puede pintar en un canvas en Firefox: se le pone el tamano de su viewBox.
      if (blob.type.includes('svg') || /\.svg(\?|$)/i.test(fileUrl)) blob = conTamano(await blob.text());
      liberar = URL.createObjectURL(blob);
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

/** Formatos que Magnific lee tal cual; el resto se pasa antes a PNG. */
export const legibleParaIa = (fileUrl: string): boolean => /\.(png|jpe?g|webp)(\?|$)/i.test(fileUrl);

/**
 * La imagen como PNG (data URL), para las herramientas de IA. Hace falta con las
 * vectorizadas: son SVG, y Magnific solo sabe leer mapas de bits ("Image cannot
 * be loaded"). Un SVG sin tamano propio se pinta a 1600 px de ancho.
 */
export async function aPng(fileUrl: string, ladoMaximo = 2048): Promise<string> {
  const img = await cargar(fileUrl);
  let w = img.naturalWidth || 1600;
  let h = img.naturalHeight || Math.round(1600 * 0.75);
  const escala = Math.min(1, ladoMaximo / Math.max(w, h));
  // Los SVG suelen dar un tamano natural pequeno: se agrandan para no perder nitidez.
  const aumento = /\.svg(\?|$)/i.test(fileUrl) && Math.max(w, h) < 1200 ? 1200 / Math.max(w, h) : 1;
  w = Math.round(w * escala * aumento);
  h = Math.round(h * escala * aumento);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite preparar la imagen.');
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('Esta imagen viene de otro sitio que no deja leerla. Súbela desde tu equipo y vuelve a intentarlo.');
  }
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
  // Con su ancho y alto: en la hoja lo ajusta la caja igualmente, y asi cualquier
  // navegador sabe su tamano (Firefox no pinta en un canvas un SVG que no lo trae).
  const conMedidas = await conTamano(svg).text();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(conMedidas)))}`;
}
