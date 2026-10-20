import type { Book } from '@/types/api';

/**
 * Libros de una biblioteca ordenados por los apellidos de su autor, como se pasa
 * lista. La clave la calcula el servidor (apellidos y nombre, sin tildes), porque
 * el nombre completo viene en distinto orden segun por donde se dio de alta la
 * cuenta. Dos libros del mismo alumno van por titulo; los que no tienen autor, al
 * final.
 *
 * La usan la lista de la biblioteca y el lector ("Siguiente libro"): asi el
 * siguiente es siempre el de debajo en la lista.
 */
export function ordenarPorAlumno<T extends Pick<Book, 'title' | 'creatorName' | 'creatorSortKey'>>(libros: T[]): T[] {
  const clave = (b: T) => b.creatorSortKey ?? b.creatorName ?? '￿';
  return [...libros].sort(
    (a, b) =>
      clave(a).localeCompare(clave(b), 'es', { sensitivity: 'base' }) ||
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }),
  );
}

/** "ORTIZ HERAZO EDWIN K11C - Mi libro": quien lo hizo, su curso y el titulo. */
export function tituloConAutor(libro: Pick<Book, 'title' | 'creatorName' | 'creatorSurnameFirst' | 'creatorCourse'>): string {
  const autor = libro.creatorSurnameFirst ?? libro.creatorName;
  if (!autor) return libro.title;
  return `${[autor, libro.creatorCourse].filter(Boolean).join(' ')} - ${libro.title}`;
}
