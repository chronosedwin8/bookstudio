import type pg from 'pg';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import type { DistributeInput } from './libraries.schemas.js';
import { requireManager } from './libraries.service.js';

/**
 * Entrega de material al alumnado.
 *
 * El docente manda una pagina suelta o un libro entero y cada alumno recibe su propia
 * copia, editable y a su nombre, dentro de la biblioteca. No es un enlace compartido:
 * es material del que cada uno se apropia.
 *
 * La copia recuerda de donde salio (`origin_book_id`). Gracias a eso, entregar la
 * pagina 2 del mismo material manana cae en el libro que el alumno ya tiene, en vez de
 * dejarle un libro nuevo por cada envio.
 */

export interface DistributeResult {
  /** Cuantos alumnos han recibido algo. */
  delivered: number;
  /** A cuantos se les creo el libro por primera vez. */
  created: number;
  /** A cuantos se les anadio a un libro que ya tenian. */
  updated: number;
  /** Paginas copiadas en total. */
  pages: number;
  /** Alumnos indicados que no pertenecen a la biblioteca. */
  skipped: number;
}

interface FuenteRow {
  id: string;
  title: string;
  layout_format: string;
  library_id: string | null;
  creator_id: string | null;
}

interface PaginaRow {
  id: string;
  page_number: number;
  background_color: string | null;
  background_pattern: string | null;
}

/**
 * El material de origen tiene que ser del docente o de una biblioteca que dirija.
 * No basta con poder verlo: entregar copia el contenido a nombre de otras personas.
 */
async function cargarFuente(sourceBookId: string, teacherId: string): Promise<FuenteRow> {
  const { rows } = await query<FuenteRow>(
    `SELECT b.id, b.title, b.layout_format, b.library_id, b.creator_id
     FROM books b WHERE b.id = $1`,
    [sourceBookId],
  );
  const fuente = rows[0];
  if (!fuente) throw HttpError.notFound('No se encontro el libro de origen');

  if (fuente.creator_id === teacherId) return fuente;
  if (!fuente.library_id) throw HttpError.forbidden('Ese libro no es tuyo');

  await requireManager(fuente.library_id, teacherId);
  return fuente;
}

/** Las paginas a copiar: una sola si se indica, o el libro entero en orden. */
async function cargarPaginas(sourceBookId: string, pageId?: string): Promise<PaginaRow[]> {
  const { rows } = await query<PaginaRow>(
    `SELECT id, page_number, background_color, background_pattern
     FROM pages
     WHERE book_id = $1 AND ($2::uuid IS NULL OR id = $2)
     ORDER BY page_number`,
    [sourceBookId, pageId ?? null],
  );

  if (!rows.length) {
    throw HttpError.notFound(pageId ? 'Esa pagina no esta en el libro de origen' : 'El libro de origen no tiene paginas');
  }
  return rows;
}

/** Copia las paginas indicadas al final del libro destino, con sus elementos. */
async function copiarPaginas(
  client: pg.PoolClient,
  paginas: PaginaRow[],
  destinoId: string,
): Promise<number> {
  const { rows } = await client.query<{ siguiente: number }>(
    'SELECT COALESCE(MAX(page_number), 0) + 1 AS siguiente FROM pages WHERE book_id = $1',
    [destinoId],
  );
  let numero = Number(rows[0].siguiente);

  for (const pagina of paginas) {
    const insertada = await client.query<{ id: string }>(
      `INSERT INTO pages (book_id, page_number, background_color, background_pattern)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [destinoId, numero, pagina.background_color, pagina.background_pattern],
    );

    await client.query(
      `INSERT INTO canvas_elements (page_id, type, z_index, transform_matrix, properties, is_locked, opacity)
       SELECT $1, type, z_index, transform_matrix, properties, is_locked, opacity
       FROM canvas_elements WHERE page_id = $2
       ORDER BY z_index`,
      [insertada.rows[0].id, pagina.id],
    );

    numero += 1;
  }

  return paginas.length;
}

export async function distribute(
  libraryId: string,
  teacherId: string,
  input: DistributeInput,
): Promise<DistributeResult> {
  await requireManager(libraryId, teacherId);

  const fuente = await cargarFuente(input.sourceBookId, teacherId);
  const paginas = await cargarPaginas(input.sourceBookId, input.pageId);
  const titulo = input.title ?? fuente.title;

  // Sin lista explicita va a toda la clase, que es el caso normal.
  const { rows: destinatarios } = await query<{ student_id: string }>(
    `SELECT student_id FROM library_students
     WHERE library_id = $1 AND ($2::uuid[] IS NULL OR student_id = ANY($2::uuid[]))`,
    [libraryId, input.studentIds ?? null],
  );

  if (!destinatarios.length) throw HttpError.badRequest('No hay alumnado al que entregar en esta biblioteca');

  const resultado: DistributeResult = {
    delivered: 0,
    created: 0,
    updated: 0,
    pages: 0,
    skipped: (input.studentIds?.length ?? destinatarios.length) - destinatarios.length,
  };

  for (const { student_id: alumnoId } of destinatarios) {
    // Una transaccion por alumno: si una entrega falla, el resto ya repartido se
    // conserva y repetir la operacion completa los que faltan.
    await withTransaction(async (client) => {
      const existente = await client.query<{ id: string }>(
        `SELECT id FROM books
         WHERE origin_book_id = $1 AND creator_id = $2 AND library_id = $3
         LIMIT 1
         FOR UPDATE`,
        [fuente.id, alumnoId, libraryId],
      );

      let destinoId = existente.rows[0]?.id;

      if (destinoId) {
        resultado.updated += 1;
      } else {
        const creado = await client.query<{ id: string }>(
          `INSERT INTO books (title, library_id, creator_id, layout_format, origin_book_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [titulo, libraryId, alumnoId, fuente.layout_format, fuente.id],
        );
        destinoId = creado.rows[0].id;
        resultado.created += 1;
      }

      resultado.pages += await copiarPaginas(client, paginas, destinoId);
      await client.query('UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [destinoId]);
      resultado.delivered += 1;
    });
  }

  return resultado;
}
