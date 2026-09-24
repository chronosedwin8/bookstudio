/**
 * Nombres de personas: repartirlos en apellidos y nombres, y detectar los dañados.
 */

/**
 * El caracter de sustitucion de Unicode (U+FFFD).
 *
 * Aparece cuando un nombre con tildes o eñes paso por un sistema que no sabia
 * leerlas: "HENRÍQUEZ" llega como "HENR�QUEZ". La letra original se perdio,
 * asi que no se puede arreglar sola; solo avisar para que alguien la escriba.
 */
const SUSTITUCION = '�';

export function tieneLetrasDanadas(nombre: string | null | undefined): boolean {
  return Boolean(nombre?.includes(SUSTITUCION));
}

/**
 * Propuesta de reparto cuando no se conocen las partes: la primera mitad de las
 * palabras como apellidos y el resto como nombres.
 *
 * Es solo un punto de partida para corregir, no una adivinanza fiable: los
 * nombres llegan en los dos ordenes. Por eso el formulario lleva un boton para
 * intercambiar las dos partes. Las particulas ("de", "la", "del") van con la
 * palabra que les sigue, para no partir "DE LA CRUZ" por la mitad.
 */
export function partirNombre(completo: string): { apellidos: string; nombres: string } {
  const palabras = completo.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (palabras.length <= 1) return { apellidos: palabras[0] ?? '', nombres: '' };

  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von', 'da', 'di']);
  const bloques: string[][] = [];
  let pendiente: string[] = [];
  for (const p of palabras) {
    pendiente.push(p);
    if (!PARTICULAS.has(p.toLowerCase())) {
      bloques.push(pendiente);
      pendiente = [];
    }
  }
  if (pendiente.length) bloques.push(pendiente);

  const corte = Math.ceil(bloques.length / 2);
  return {
    apellidos: bloques.slice(0, corte).flat().join(' '),
    nombres: bloques.slice(corte).flat().join(' '),
  };
}
