import { mediaApi } from '@/services/api';

/**
 * Vectorizar una imagen en el navegador, con imagetracerjs (dominio publico).
 *
 * Magnific, el proveedor de IA que ya usa BookStudio, no ofrece vectorizar, y
 * hacerlo aqui no gasta creditos ni manda la imagen a nadie. El resultado son
 * manchas de color, nitidas a cualquier tamano.
 *
 * Para leer los pixeles hace falta que la imagen no "contamine" el canvas: las
 * nuestras se piden a /api/media/raw (mismo dominio); las de fuera se intentan
 * con CORS y, si su servidor no lo permite, se avisa.
 */

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

export async function cargar(fileUrl: string): Promise<HTMLImageElement> {
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

/* ---------------------------------------------------------------------------
 * Vectorizar en piezas
 *
 * Cada color de la imagen se convierte en una pieza aparte (un "dibujo" del
 * lienzo), con su propia caja: se pueden mover, borrar o cambiar de color una a
 * una, y quedan agrupadas para moverlas juntas.
 *
 * La paleta la elige esta funcion y no imagetracer. La suya promedia la imagen
 * entera y se come los colores que ocupan poco (las rayas rosas de una manta, el
 * centro amarillo de una flor): la imagen salia apagada, "sin colores". Aqui se
 * eligen primero los colores mas distintos entre si (el mas lejano a los ya
 * elegidos, una y otra vez) y luego se afinan con unas vueltas de k-means.
 * ------------------------------------------------------------------------ */

type Rgba = { r: number; g: number; b: number; a: number };

/** Region visible de la imagen, en fracciones (0-1) de la imagen entera. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PiezaVector {
  /** #RRGGBB */
  color: string;
  /** Trazado en pixeles del lienzo de trazado (ver `ancho` y `alto`). */
  d: string;
  /** Caja de la pieza en esos mismos pixeles. */
  caja: { x: number; y: number; w: number; h: number };
}

/** Lado con el que se traza en piezas: mas detalle infla mucho cada pieza. */
const LADO_PIEZAS = 600;
/** El servidor admite trazados de hasta 500 000 caracteres por dibujo. */
const TOPE_TRAZADO = 450_000;

const distancia = (a: number[], b: number[]) =>
  (a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11;

function elegirPaleta(datos: ImageData, maximo: number): { paleta: Rgba[]; conTransparencia: boolean } {
  const n = datos.width * datos.height;
  const paso = Math.max(1, Math.floor(n / 12_000));
  const muestra: number[][] = [];
  let transparentes = 0;
  for (let i = 0; i < n; i += paso) {
    const o = i * 4;
    if (datos.data[o + 3] < 128) {
      transparentes++;
      continue;
    }
    muestra.push([datos.data[o], datos.data[o + 1], datos.data[o + 2]]);
  }
  const conTransparencia = transparentes > 0;
  if (!muestra.length) return { paleta: [{ r: 0, g: 0, b: 0, a: 0 }], conTransparencia: true };

  const centros = [muestra[Math.floor(muestra.length / 2)]];
  const cerca = muestra.map((x) => distancia(x, centros[0]));
  while (centros.length < maximo) {
    let lejos = 0;
    for (let i = 1; i < muestra.length; i++) if (cerca[i] > cerca[lejos]) lejos = i;
    // Lo que queda ya se parece a algun color elegido: no hace falta otro.
    if (cerca[lejos] < 30) break;
    centros.push(muestra[lejos]);
    for (let i = 0; i < muestra.length; i++) cerca[i] = Math.min(cerca[i], distancia(muestra[i], muestra[lejos]));
  }
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const sumas = centros.map(() => [0, 0, 0, 0]);
    for (const x of muestra) {
      let mejor = 0;
      let mejorD = Infinity;
      for (let j = 0; j < centros.length; j++) {
        const d = distancia(x, centros[j]);
        if (d < mejorD) {
          mejorD = d;
          mejor = j;
        }
      }
      sumas[mejor][0] += x[0];
      sumas[mejor][1] += x[1];
      sumas[mejor][2] += x[2];
      sumas[mejor][3]++;
    }
    sumas.forEach((s, j) => {
      if (s[3]) centros[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  const paleta: Rgba[] = centros.map(([r, g, b]) => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 255 }));
  // Lo transparente (una imagen sin fondo) tiene su propio "color", que no se dibuja.
  if (conTransparencia) paleta.push({ r: 0, g: 0, b: 0, a: 0 });
  return { paleta, conTransparencia };
}

const hex = (c: Rgba) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/**
 * La parte de la imagen que se ve en su caja: la recortada si tiene recorte o,
 * si no, la que deja ver `object-fit: cover` (centrada).
 */
export function regionVisible(ancho: number, alto: number, recorte: Region | null, aspectoCaja: number): Region {
  if (recorte) return recorte;
  const a = ancho / alto;
  if (a > aspectoCaja) {
    const w = aspectoCaja / a;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = a / aspectoCaja;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/**
 * Traza la parte visible de la imagen y la devuelve en piezas, una por color
 * (o mas, si un color es tan complejo que no cabe en un solo dibujo). La pieza
 * del color que mas ocupa va primero y lleva ademas un rectangulo de fondo: tapa
 * las rendijas que deja el trazado entre colores.
 */
export async function vectorizarEnPiezas(
  fileUrl: string,
  opciones: { recorte: Region | null; aspectoCaja: number; colores?: number },
): Promise<{ ancho: number; alto: number; piezas: PiezaVector[] }> {
  const img = await cargar(fileUrl);
  const nw = img.naturalWidth || 1600;
  const nh = img.naturalHeight || 1200;
  const r = regionVisible(nw, nh, opciones.recorte, opciones.aspectoCaja);
  const sw = r.w * nw;
  const sh = r.h * nh;
  const escala = Math.min(1, LADO_PIEZAS / Math.max(sw, sh));
  // Lo muy pequeno (un SVG sin tamano, un icono) se agranda: con pocos pixeles
  // el trazado sale a escalones.
  const aumento = Math.max(sw, sh) * escala < 400 ? 400 / (Math.max(sw, sh) * escala) : 1;
  const ancho = Math.max(1, Math.round(sw * escala * aumento));
  const alto = Math.max(1, Math.round(sh * escala * aumento));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite vectorizar.');
  ctx.drawImage(img, r.x * nw, r.y * nh, sw, sh, 0, 0, ancho, alto);
  let datos: ImageData;
  try {
    datos = ctx.getImageData(0, 0, ancho, alto);
  } catch {
    throw new Error('Esta imagen viene de otro sitio que no deja leerla. Súbela desde tu equipo y vectorízala.');
  }

  const { paleta, conTransparencia } = elegirPaleta(datos, opciones.colores ?? 24);
  // Se carga solo al usarlo: son ~50 KB que la mayoria nunca necesita.
  const ImageTracer = (await import('imagetracerjs')).default as {
    imagedataToTracedata: (
      d: ImageData,
      o: Record<string, unknown>,
    ) => { layers: Array<Array<{ boundingbox: number[]; isholepath: boolean }>>; palette: Rgba[] };
    svgpathstring: (td: unknown, capa: number, camino: number, o: Record<string, unknown>) => string;
  };
  const o = {
    pal: paleta,
    numberofcolors: paleta.length,
    // Con una sola vuelta imagetracer usa la paleta tal cual, sin "mejorarla".
    colorquantcycles: 1,
    mincolorratio: 0,
    pathomit: 8,
    ltres: 1,
    qtres: 1,
    roundcoords: 1,
    blurradius: 0,
    viewbox: true,
    desc: false,
  };
  const td = ImageTracer.imagedataToTracedata(datos, o);

  type Capa = { color: Rgba; trazos: string[]; area: number; caja: [number, number, number, number] };
  const capas: Capa[] = [];
  td.layers.forEach((caminos, i) => {
    const color = td.palette[i];
    if (!caminos.length || color.a < 128) return;
    const capa: Capa = { color, trazos: [], area: 0, caja: [Infinity, Infinity, -Infinity, -Infinity] };
    caminos.forEach((camino, j) => {
      // Los huecos ya van dentro del trazado de su camino padre.
      if (camino.isholepath) return;
      const d = / d="([^"]*)"/.exec(ImageTracer.svgpathstring(td, i, j, o))?.[1];
      if (!d) return;
      const [x1, y1, x2, y2] = camino.boundingbox;
      capa.trazos.push(d);
      capa.area += (x2 - x1) * (y2 - y1);
      capa.caja = [Math.min(capa.caja[0], x1), Math.min(capa.caja[1], y1), Math.max(capa.caja[2], x2), Math.max(capa.caja[3], y2)];
    });
    if (capa.trazos.length) capas.push(capa);
  });
  // Lo grande debajo y los detalles encima.
  capas.sort((a, b) => b.area - a.area);

  const piezas: PiezaVector[] = [];
  capas.forEach((capa, indice) => {
    let caja = capa.caja;
    let d = '';
    if (indice === 0 && !conTransparencia) {
      d = `M0 0H${ancho}V${alto}H0Z `;
      caja = [0, 0, ancho, alto];
    }
    // Un color muy complejo se parte en varias piezas para no pasar del tope.
    const cerrar = () => {
      if (!d.trim()) return;
      piezas.push({
        color: hex(capa.color),
        d: d.trim(),
        caja: { x: caja[0] - 1, y: caja[1] - 1, w: caja[2] - caja[0] + 2, h: caja[3] - caja[1] + 2 },
      });
      d = '';
    };
    for (const t of capa.trazos) {
      if (d.length + t.length > TOPE_TRAZADO) cerrar();
      d += t;
    }
    cerrar();
  });
  if (!piezas.length) throw new Error('La imagen no tiene nada que vectorizar.');
  return { ancho, alto, piezas };
}
