import type { DistributeResult } from '@/types/api';

/**
 * Opciones de una entrega de material al alumnado.
 *
 * Las comparten "Entregar" (desde el editor o la biblioteca) y "Pasar a
 * biblioteca…" (desde Mis libros), para que las dos digan lo mismo y lo manden
 * igual al servidor.
 */
export interface OpcionesEntrega {
  /** El libro entero o solo las paginas marcadas. */
  alcance: 'libro' | 'paginas';
  /** Paginas marcadas, por id del libro de origen. */
  pageIds: string[];
  /** En un libro propio de la entrega o dentro de los que ya tienen. */
  destino: 'nuevo' | 'existentes';
  /** Al principio, al final, o detras de la pagina `despuesDe`. */
  posicion: 'inicio' | 'final' | 'despues';
  /** Numero de pagina (la portada es la 1) detras del cual se insertan. */
  despuesDe: number;
  /** Titulo del libro que recibe cada alumno, con destino "nuevo". */
  titulo: string;
}

export function entregaPorDefecto(titulo: string, pageIds: string[] = []): OpcionesEntrega {
  return {
    alcance: pageIds.length ? 'paginas' : 'libro',
    pageIds,
    destino: 'nuevo',
    posicion: 'final',
    despuesDe: 1,
    titulo,
  };
}

/** Lo que falta para poder entregar, o null si esta todo. */
export function faltaEnEntrega(o: OpcionesEntrega): string | null {
  if (o.alcance === 'paginas' && !o.pageIds.length) return 'Marca al menos una página';
  if (o.posicion === 'despues' && !(Number.isInteger(o.despuesDe) && o.despuesDe >= 1)) {
    return 'Indica detrás de qué página va';
  }
  return null;
}

/**
 * Cuerpo de la peticion de entrega. `pageIds` se pasa aparte porque, al pasar un
 * libro a una biblioteca, las paginas marcadas son las del original y hay que
 * traducirlas a las de la copia que queda en cada biblioteca.
 */
export function cuerpoEntrega(o: OpcionesEntrega, pageIds: string[] = o.pageIds) {
  return {
    pageIds: o.alcance === 'paginas' ? pageIds : undefined,
    title: o.destino === 'nuevo' ? o.titulo.trim() || undefined : undefined,
    target: o.destino,
    position: o.posicion,
    afterPage: o.posicion === 'despues' ? o.despuesDe : undefined,
  };
}

/** Como fue la entrega en cada biblioteca, al pasar un libro con "entregar". */
export interface EntregaEnBiblioteca {
  libraryName: string;
  result?: DistributeResult;
  error?: string;
}
