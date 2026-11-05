/**
 * OpenMoji: emojis dibujados como SVG, iguales en cualquier equipo.
 *
 * Los emojis de siempre (`utils/emojis.ts`) los pinta la fuente del sistema, asi
 * que cambian de aspecto entre Windows, Mac, Android o al imprimir. Los de
 * OpenMoji son dibujos: se ven igual en todas partes y traen ademas cientos de
 * extras (medio ambiente, salud, tecnologia, interfaz...).
 *
 * Se guardan en el libro por su codigo (`1F415` es el perro) y se sirven desde
 * `/openmoji/<codigo>.svg`, que copia `scripts/openmoji.mjs` del paquete npm. El
 * catalogo con los nombres en castellano esta en `assets/openmoji.json`.
 *
 * Licencia CC BY-SA 4.0: hay que citar a OpenMoji donde se usan.
 */

export const OPENMOJI = {
  web: 'https://openmoji.org',
  licencia: 'CC BY-SA 4.0',
  licenciaUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  credito: 'Emojis de OpenMoji, el proyecto de emojis e iconos de código abierto. Licencia CC BY-SA 4.0.',
} as const;

export interface EntradaOpenmoji {
  /** Codigo del emoji, tal como se llama su dibujo. */
  h: string;
  /** Indice de su grupo en `grupos`. */
  g: number;
  /** Nombre en castellano (los extras de OpenMoji solo lo tienen en ingles). */
  n: string;
  /** Palabras para buscar, en castellano e ingles, sin tildes. */
  k: string;
  /** Los cinco tonos de piel, de mas claro a mas oscuro, si los tiene. */
  t?: string[];
}

export interface CatalogoOpenmoji {
  version: string;
  grupos: { id: string; label: string }[];
  emojis: EntradaOpenmoji[];
}

/** Codigos validos: grupos hexadecimales separados por guiones. */
const CODIGO = /^[0-9A-F]{2,6}(-[0-9A-F]{2,6}){0,12}$/;

export const esCodigoOpenmoji = (codigo: unknown): codigo is string =>
  typeof codigo === 'string' && CODIGO.test(codigo);

/**
 * Direccion del dibujo. `origen` sirve para el libro exportado, que se abre
 * fuera de la plataforma y necesita la direccion completa.
 */
export function urlOpenmoji(codigo: string, origen = ''): string {
  return esCodigoOpenmoji(codigo) ? `${origen}/openmoji/${codigo}.svg` : '';
}

/** Tonos de piel del selector; 0 es el amarillo de siempre. */
export const TONOS_PIEL = [
  { id: 0, label: 'Amarillo', color: '#FCEA2B' },
  { id: 1, label: 'Claro', color: '#FADCBC' },
  { id: 2, label: 'Claro medio', color: '#DEBB90' },
  { id: 3, label: 'Medio', color: '#C19A65' },
  { id: 4, label: 'Oscuro medio', color: '#A57939' },
  { id: 5, label: 'Oscuro', color: '#6A462F' },
] as const;

/** El codigo con el tono elegido, si ese emoji lo tiene. */
export function conTono(e: EntradaOpenmoji, tono: number): string {
  return tono > 0 ? e.t?.[tono - 1] ?? e.h : e.h;
}

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Busca en el catalogo. Cada palabra escrita tiene que aparecer (al principio de
 * alguna palabra clave o del nombre): "perro" encuentra al perro y "per" tambien,
 * pero no a la "superestrella". Sin texto, todo el grupo elegido.
 */
export function buscarOpenmoji(
  catalogo: Pick<CatalogoOpenmoji, 'emojis'>,
  consulta: string,
  grupo: number | null = null,
): EntradaOpenmoji[] {
  const enGrupo = grupo === null ? catalogo.emojis : catalogo.emojis.filter((e) => e.g === grupo);
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!terminos.length) return enGrupo;
  return enGrupo.filter((e) => {
    const claves = ` ${e.k} ${normalizar(e.n)}`;
    return terminos.every((t) => claves.includes(` ${t}`));
  });
}
