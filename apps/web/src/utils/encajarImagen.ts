/**
 * Que tamano darle a una imagen recien puesta en una pagina.
 *
 * El lienzo mide en porcentajes, pero el ancho y el alto se miden contra lados
 * distintos: un 45% de ancho y un 45% de alto solo son lo mismo en una pagina
 * cuadrada. Sin tener eso en cuenta, una foto vertical en un libro apaisado
 * recibe una caja demasiado baja y, como la imagen rellena su caja, se queda sin
 * la parte de arriba y la de abajo. Es lo que pasaba al insertar o pegar.
 */

/** Alto maximo, en % de la pagina: mas que esto no cabe con holgura. */
const ALTO_MAXIMO = 80;
/** Ancho de partida, en % de la pagina. */
const ANCHO_DESEADO = 45;

export interface MedidaNatural {
  width: number;
  height: number;
}

export interface CajaEnPagina {
  width: number;
  height: number;
}

/**
 * Caja en porcentajes de pagina que conserva la proporcion de la imagen.
 *
 * `aspectoPagina` es ancho/alto de la pagina (1 en cuadrada, 4/3 en apaisada).
 * Si no se conoce el tamano real de la imagen se devuelve una caja sensata, que
 * es lo unico que se puede hacer sin mirarla.
 */
export function cajaParaImagen(
  natural: MedidaNatural | null | undefined,
  aspectoPagina: number,
  anchoDeseado = ANCHO_DESEADO,
): CajaEnPagina {
  const aspecto = Number.isFinite(aspectoPagina) && aspectoPagina > 0 ? aspectoPagina : 1;

  if (!natural || !(natural.width > 0) || !(natural.height > 0)) {
    return { width: anchoDeseado, height: Math.min(anchoDeseado / aspecto, ALTO_MAXIMO) };
  }

  // alto% = ancho% x (alto/ancho de la imagen) x (ancho/alto de la pagina)
  const proporcion = (natural.height / natural.width) * aspecto;

  let width = anchoDeseado;
  let height = width * proporcion;

  // Si se sale de la pagina se estrecha la imagen, nunca se le recorta el alto:
  // recortarlo es exactamente el fallo que esto viene a evitar.
  if (height > ALTO_MAXIMO) {
    height = ALTO_MAXIMO;
    width = height / proporcion;
  }

  return { width: redondear(width), height: redondear(height) };
}

const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Mide una imagen cargandola en el navegador.
 *
 * Devuelve `null` si no se puede medir (no carga, o tarda demasiado); quien
 * llama debe seguir adelante con una caja por defecto en vez de quedarse
 * esperando o dejar de insertar la imagen.
 */
export function medirImagen(url: string, msLimite = 8000): Promise<MedidaNatural | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let resuelto = false;

    const acabar = (medida: MedidaNatural | null) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve(medida);
    };

    const temporizador = setTimeout(() => acabar(null), msLimite);

    img.onload = () => acabar({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => acabar(null);
    // Para que una imagen de otro dominio no rompa la medida por CORS
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/** Mide la imagen y devuelve ya la caja lista para el lienzo. */
export async function cajaMidiendo(
  url: string,
  aspectoPagina: number,
  anchoDeseado?: number,
): Promise<CajaEnPagina> {
  return cajaParaImagen(await medirImagen(url), aspectoPagina, anchoDeseado);
}
