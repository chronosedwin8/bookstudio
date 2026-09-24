/**
 * Geometria del cambio de formato de un libro.
 *
 * Aparte del servicio para poder probarla sin base de datos: es aritmetica pura,
 * y un error aqui deformaria todos los libros que cambien de formato.
 */

/** Ancho entre alto de cada formato. El lienzo mide siempre 1000 de ancho. */
const PROPORCION: Record<string, number> = { square: 1, portrait: 3 / 4, landscape: 4 / 3 };

const redondeo = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Donde queda una caja al pasar de un formato a otro.
 *
 * Las cajas van en porcentajes de la pagina. Cambiar el formato sin mas las
 * estiraria: un circulo en una pagina apaisada saldria como un huevo en una
 * vertical. Asi que la pagina vieja se encaja entera dentro de la nueva, como una
 * foto en un marco: se reduce lo justo para que quepa y se centra. Nada se
 * deforma y nada se sale.
 *
 * `s` es cuanto se reduce el contenido (1 = nada) y `r` la relacion entre la
 * altura vieja y la nueva, en las unidades del lienzo.
 */
export function reencajar(
  t: { x: number; y: number; width: number; height: number; angle?: number },
  desde: string,
  hasta: string,
): { x: number; y: number; width: number; height: number; angle: number } {
  const a0 = PROPORCION[desde] ?? 1;
  const a1 = PROPORCION[hasta] ?? 1;
  const s = Math.min(1, a0 / a1);
  const r = a1 / a0;
  return {
    x: redondeo(50 * (1 - s) + s * t.x),
    y: redondeo(50 * (1 - s * r) + s * r * t.y),
    width: redondeo(s * t.width),
    height: redondeo(s * r * t.height),
    angle: t.angle ?? 0,
  };
}

/** Cuanto se reduce el contenido al cambiar de formato; 1 si no se reduce. */
export const reduccionDeFormato = (desde: string, hasta: string): number =>
  Math.min(1, (PROPORCION[desde] ?? 1) / (PROPORCION[hasta] ?? 1));

/**
 * La letra reducida junto con su caja, sin bajar del minimo de cada tipo: el del
 * texto es el tamano accesible, el de la tabla el que admite su esquema.
 */
export function reducirTexto(tamano: number, s: number, tipo: string): number {
  const minimo = tipo === 'table' ? 8 : 24;
  return Math.max(minimo, Math.round(tamano * s));
}
