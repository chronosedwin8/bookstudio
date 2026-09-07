/**
 * Como se reparten las paginas de un libro abierto.
 *
 * La portada va sola a la derecha, igual que al abrir un libro de papel, y a
 * partir de ahi las paginas van de dos en dos. Sin esa primera vista suelta, la
 * portada compartiria pliego con la pagina 2 y el libro entero quedaria corrido
 * respecto a lo impreso.
 *
 * Vive aparte del componente porque es aritmetica de indices, que es justo donde
 * se cuelan los errores de uno en uno, y asi se puede comprobar sin navegador.
 */

export interface Vista {
  /** Indice de la pagina de la izquierda; null en la portada. */
  izquierda: number | null;
  /** Indice de la pagina de la derecha; null si el libro termina en impar. */
  derecha: number | null;
}

/**
 * Reparte las paginas en vistas.
 *
 * Con `doble` en falso cada pagina es su propia vista, que es lo que hace falta en
 * una pantalla estrecha o en un libro apaisado: dos paginas juntas ahi se leen
 * peor que una sola.
 */
export function construirVistas(total: number, doble: boolean): Vista[] {
  if (total <= 0) return [];

  if (!doble) {
    return Array.from({ length: total }, (_, i) => ({ izquierda: null, derecha: i }));
  }

  const vistas: Vista[] = [{ izquierda: null, derecha: 0 }];
  for (let i = 1; i < total; i += 2) {
    vistas.push({ izquierda: i, derecha: i + 1 < total ? i + 1 : null });
  }
  return vistas;
}

/** En que vista cae una pagina. Devuelve 0 si no aparece, para no dejar el libro en blanco. */
export function vistaDe(vistas: Vista[], pagina: number): number {
  const encontrada = vistas.findIndex((v) => v.izquierda === pagina || v.derecha === pagina);
  return encontrada >= 0 ? encontrada : 0;
}

/**
 * Que pagina queda "abierta" en una vista.
 *
 * Manda la izquierda: es la que el lector ha terminado de descubrir al pasar la
 * hoja, y es la que deben resaltar las miniaturas.
 */
export function paginaDe(vista: Vista | undefined): number {
  if (!vista) return 0;
  return vista.izquierda ?? vista.derecha ?? 0;
}
