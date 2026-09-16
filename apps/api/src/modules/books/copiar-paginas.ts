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

/**
 * Copia las paginas indicadas dentro del libro destino, con sus elementos.
 *
 * Al insertar al principio hay que abrir hueco corriendo lo que ya hay. Se hace en
 * dos pasos, pasando por numeros negativos, porque (book_id, page_number) es unico y
 * un desplazamiento directo chocaria consigo mismo a mitad de camino.
 */
export async function copiarPaginas(
  client: pg.PoolClient,
  paginas: PaginaRow[],
  destinoId: string,
  posicion: 'inicio' | 'final',
): Promise<number> {
  let numero: number;

  if (posicion === 'inicio') {
    await client.query('UPDATE pages SET page_number = -page_number WHERE book_id = $1', [destinoId]);
    await client.query(
      'UPDATE pages SET page_number = -page_number + $2 WHERE book_id = $1 AND page_number < 0',
      [destinoId, paginas.length],
    );
    numero = 1;
  } else {
    const { rows } = await client.query<{ siguiente: number }>(
      'SELECT COALESCE(MAX(page_number), 0) + 1 AS siguiente FROM pages WHERE book_id = $1',
      [destinoId],
    );
    numero = Number(rows[0].siguiente);
  }

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

    numero += 1;
  }

  return paginas.length;
}
