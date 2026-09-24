import type pg from 'pg';

/**
 * Copiar paginas con todo su contenido de un libro a otro.
 *
 * Lo usan la entrega de material al alumnado y la transferencia de libros de
 * "Mis libros" a una biblioteca. Vive aparte para que las dos copien exactamente
 * igual: si un dia se anade una columna a los elementos, se anade aqui una vez.
 */

export interface PaginaRow {
  id: string;
  page_number: number;
  background_color: string | null;
  background_pattern: string | null;
}

/** Donde se insertan: al principio, al final, o justo detras de una pagina. */
export type PosicionCopia = 'inicio' | 'final' | { despuesDe: number };

/**
 * Copia las paginas indicadas dentro del libro destino, con sus elementos.
 * Devuelve cuantas copio.
 */
export async function copiarPaginas(
  client: pg.PoolClient,
  paginas: PaginaRow[],
  destinoId: string,
  posicion: PosicionCopia,
): Promise<number> {
  return (await copiarPaginasConIds(client, paginas, destinoId, posicion)).length;
}

/**
 * Lo mismo, devolviendo los ids de las copias en orden: quien pega paginas quiere
 * abrir la primera que ha pegado.
 *
 * Para insertar en medio hay que abrir hueco corriendo lo que viene detras. Se hace
 * en dos pasos, pasando por numeros negativos, porque (book_id, page_number) es
 * unico y un desplazamiento directo chocaria consigo mismo a mitad de camino.
 */
export async function copiarPaginasConIds(
  client: pg.PoolClient,
  paginas: PaginaRow[],
  destinoId: string,
  posicion: PosicionCopia,
): Promise<string[]> {
  let numero: number;
  const despuesDe = posicion === 'inicio' ? 0 : posicion === 'final' ? null : posicion.despuesDe;

  if (despuesDe !== null) {
    await client.query(
      'UPDATE pages SET page_number = -page_number WHERE book_id = $1 AND page_number > $2',
      [destinoId, despuesDe],
    );
    await client.query(
      'UPDATE pages SET page_number = -page_number + $2 WHERE book_id = $1 AND page_number < 0',
      [destinoId, paginas.length],
    );
    numero = despuesDe + 1;
  } else {
    const { rows } = await client.query<{ siguiente: number }>(
      'SELECT COALESCE(MAX(page_number), 0) + 1 AS siguiente FROM pages WHERE book_id = $1',
      [destinoId],
    );
    numero = Number(rows[0].siguiente);
  }

  const ids: string[] = [];
  for (const pagina of paginas) {
    const insertada = await client.query<{ id: string }>(
      `INSERT INTO pages (book_id, page_number, background_color, background_pattern)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [destinoId, numero, pagina.background_color, pagina.background_pattern],
    );

    await client.query(
      /*
       * Las reglas de mostrar y ocultar apuntan por nombre, no por id, asi que
       * la copia de cada alumno funciona con solo llevarse la columna: los
       * nombres se resuelven dentro de su propia pagina.
       */
      `INSERT INTO canvas_elements
         (page_id, type, z_index, transform_matrix, properties, is_locked, opacity,
          interaction, animation, actions)
       SELECT $1, type, z_index, transform_matrix, properties, is_locked, opacity,
              interaction, animation, actions
       FROM canvas_elements WHERE page_id = $2
       ORDER BY z_index`,
      [insertada.rows[0].id, pagina.id],
    );

    ids.push(insertada.rows[0].id);
    numero += 1;
  }

  return ids;
}
