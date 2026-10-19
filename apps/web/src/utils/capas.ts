import { cargar } from './vectorizar';

/**
 * Fondo sin el sujeto, para separar una imagen en capas de verdad.
 *
 * Quitar el fondo (Magnific) da el sujeto recortado; pero si debajo se deja la
 * imagen original, al mover el sujeto aparece otra vez el mismo sujeto pintado
 * en el fondo. Aqui se borra del fondo todo lo que es sujeto (un poco mas, para
 * no dejar el halo del borde) y el hueco se rellena con los colores de alrededor.
 *
 * El relleno es "push-pull": se reduce la imagen a la mitad una y otra vez
 * promediando solo los pixeles conocidos, y al volver a subir cada hueco toma el
 * color de su nivel mas grueso, suavizado. Queda un fondo continuo, sin costuras,
 * sin gastar creditos de IA y en una fraccion de segundo.
 */

const LADO_MAXIMO = 1600;

/** Marca (1) los pixeles a menos de `radio` de uno marcado: el borde del sujeto. */
function dilatar(mascara: Uint8Array, w: number, h: number, radio: number): Uint8Array {
  if (radio < 1) return mascara;
  // Por filas y luego por columnas, con sumas acumuladas: coste lineal.
  const filas = new Uint8Array(w * h);
  const acum = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) acum[x + 1] = acum[x] + mascara[y * w + x];
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - radio);
      const b = Math.min(w, x + radio + 1);
      filas[y * w + x] = acum[b] - acum[a] > 0 ? 1 : 0;
    }
  }
  const salida = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) acum[y + 1] = acum[y] + filas[y * w + x];
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - radio);
      const b = Math.min(h, y + radio + 1);
      salida[y * w + x] = acum[b] - acum[a] > 0 ? 1 : 0;
    }
  }
  return salida;
}

interface Nivel {
  w: number;
  h: number;
  /** Color (r, g, b) ya normalizado donde el peso es > 0. */
  c: Float32Array;
  /** Cuanto se sabe de cada pixel: 0 hueco, 1 conocido. */
  p: Float32Array;
}

/** Muestra bilineal de un nivel grueso, para que el relleno no salga a cuadros. */
function muestra(n: Nivel, fx: number, fy: number, salida: number[]): void {
  const x = Math.min(n.w - 1, Math.max(0, fx));
  const y = Math.min(n.h - 1, Math.max(0, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(n.w - 1, x0 + 1);
  const y1 = Math.min(n.h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  for (let k = 0; k < 3; k++) {
    const a = n.c[(y0 * n.w + x0) * 3 + k];
    const b = n.c[(y0 * n.w + x1) * 3 + k];
    const c = n.c[(y1 * n.w + x0) * 3 + k];
    const d = n.c[(y1 * n.w + x1) * 3 + k];
    salida[k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}

/** Rellena los huecos (peso < 1) del nivel 0 con push-pull. */
function rellenar(base: Nivel): void {
  const niveles: Nivel[] = [base];
  // Bajada: cada pixel grueso es la media de sus cuatro hijos conocidos.
  while (niveles.at(-1)!.w > 1 || niveles.at(-1)!.h > 1) {
    const f = niveles.at(-1)!;
    const w = Math.max(1, Math.ceil(f.w / 2));
    const h = Math.max(1, Math.ceil(f.h / 2));
    const g: Nivel = { w, h, c: new Float32Array(w * h * 3), p: new Float32Array(w * h) };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let suma = 0;
        let r = 0;
        let v = 0;
        let a = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const fx = x * 2 + dx;
            const fy = y * 2 + dy;
            if (fx >= f.w || fy >= f.h) continue;
            const i = fy * f.w + fx;
            const peso = f.p[i];
            suma += peso;
            r += f.c[i * 3] * peso;
            v += f.c[i * 3 + 1] * peso;
            a += f.c[i * 3 + 2] * peso;
          }
        }
        const j = y * w + x;
        if (suma > 0) {
          g.c[j * 3] = r / suma;
          g.c[j * 3 + 1] = v / suma;
          g.c[j * 3 + 2] = a / suma;
        }
        g.p[j] = Math.min(1, suma);
      }
    }
    niveles.push(g);
  }
  // Subida: lo que falta en cada nivel se toma del de encima, ya completo.
  const c = [0, 0, 0];
  for (let k = niveles.length - 2; k >= 0; k--) {
    const fino = niveles[k];
    const grueso = niveles[k + 1];
    for (let y = 0; y < fino.h; y++) {
      for (let x = 0; x < fino.w; x++) {
        const i = y * fino.w + x;
        const peso = fino.p[i];
        if (peso >= 1) continue;
        muestra(grueso, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, c);
        fino.c[i * 3] = fino.c[i * 3] * peso + c[0] * (1 - peso);
        fino.c[i * 3 + 1] = fino.c[i * 3 + 1] * peso + c[1] * (1 - peso);
        fino.c[i * 3 + 2] = fino.c[i * 3 + 2] * peso + c[2] * (1 - peso);
        fino.p[i] = 1;
      }
    }
  }
}

/**
 * El fondo de `original` sin lo que en `sujeto` (la misma imagen sin fondo) es
 * opaco. Devuelve un PNG (data URL) del tamano de la original, hasta 1600 px.
 */
export async function fondoSinSujeto(original: string, sujeto: string): Promise<string> {
  const [img, rec] = await Promise.all([cargar(original), cargar(sujeto)]);
  const nw = img.naturalWidth || 1600;
  const nh = img.naturalHeight || 1200;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * escala));
  const h = Math.max(1, Math.round(nh * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no permite preparar el fondo.');
  let pixeles: ImageData;
  let siluetas: ImageData;
  try {
    ctx.drawImage(rec, 0, 0, w, h);
    siluetas = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    pixeles = ctx.getImageData(0, 0, w, h);
  } catch {
    throw new Error('Esta imagen viene de otro sitio que no deja leerla. Súbela desde tu equipo y vuelve a intentarlo.');
  }

  const n = w * h;
  let mascara: Uint8Array = new Uint8Array(n);
  let enSujeto = 0;
  for (let i = 0; i < n; i++) {
    if (siluetas.data[i * 4 + 3] > 24) {
      mascara[i] = 1;
      enSujeto++;
    }
  }
  if (!enSujeto) throw new Error('La IA no encontró un sujeto que separar del fondo.');
  // Un margen alrededor del sujeto: el borde suavizado tambien es sujeto.
  mascara = dilatar(mascara, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.012)));

  const base: Nivel = { w, h, c: new Float32Array(n * 3), p: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    base.c[i * 3] = pixeles.data[i * 4];
    base.c[i * 3 + 1] = pixeles.data[i * 4 + 1];
    base.c[i * 3 + 2] = pixeles.data[i * 4 + 2];
    base.p[i] = mascara[i] ? 0 : 1;
  }
  rellenar(base);
  for (let i = 0; i < n; i++) {
    if (!mascara[i]) continue;
    pixeles.data[i * 4] = base.c[i * 3];
    pixeles.data[i * 4 + 1] = base.c[i * 3 + 1];
    pixeles.data[i * 4 + 2] = base.c[i * 3 + 2];
    pixeles.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(pixeles, 0, 0);
  return canvas.toDataURL('image/png');
}
