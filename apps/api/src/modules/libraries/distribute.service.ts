import type pg from 'pg';
import { copiarPaginas, type PaginaRow, type PosicionCopia } from '../books/copiar-paginas.js';
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
  /** Libros tocados en total: con "existentes" un alumno puede tener varios. */
  books: number;
  /** Alumnos sin ningun libro propio donde insertar, con destino "existentes". */
  withoutBooks: number;
  /** Alumnos indicados que no pertenecen a la biblioteca. */
  skipped: number;
}

interface FuenteRow {
  id: string;
  title: string;
  layout_format: string;
  library_id: string | null;
  creator_id: string | null;
  page_numbering: Record<string, unknown> | null;
}


/**
 * El material de origen tiene que ser del docente o de una biblioteca que dirija.
 * No basta con poder verlo: entregar copia el contenido a nombre de otras personas.
 */
async function cargarFuente(sourceBookId: string, teacherId: string): Promise<FuenteRow> {
  const { rows } = await query<FuenteRow>(
    `SELECT b.id, b.title, b.layout_format, b.library_id, b.creator_id, b.page_numbering
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

/**
 * Las paginas a copiar: las indicadas, o el libro entero. Siempre en el orden
 * del libro de origen, se marcaran en el orden que se marcaran.
 */
async function cargarPaginas(sourceBookId: string, pageIds: string[] | null): Promise<PaginaRow[]> {
  const { rows } = await query<PaginaRow>(
    `SELECT id, page_number, background_color, background_pattern
     FROM pages
     WHERE book_id = $1 AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
     ORDER BY page_number`,
    [sourceBookId, pageIds],
  );

  if (!rows.length) {
    throw HttpError.notFound(pageIds ? 'Esas paginas no estan en el libro de origen' : 'El libro de origen no tiene paginas');
  }
  if (pageIds && rows.length !== new Set(pageIds).size) {
    throw HttpError.badRequest('Alguna de las paginas no esta en el libro de origen');
  }
  return rows;
}

/**
 * Donde caen las paginas en un libro concreto. "Detras de la pagina N" se ajusta
 * a lo que mida cada libro: si el de un alumno es mas corto, van al final en vez
 * de dejar un hueco en la numeracion.
 */
async function posicionEn(client: pg.PoolClient, destinoId: string, input: DistributeInput): Promise<PosicionCopia> {
  if (input.position !== 'despues') return input.position;
  const { rows } = await client.query<{ ultima: number }>(
    'SELECT COALESCE(MAX(page_number), 0) AS ultima FROM pages WHERE book_id = $1',
    [destinoId],
  );
  return { despuesDe: Math.min(input.afterPage ?? 0, Number(rows[0].ultima)) };
}


export async function distribute(
  libraryId: string,
  teacherId: string,
  input: DistributeInput,
): Promise<DistributeResult> {
  await requireManager(libraryId, teacherId);

  const fuente = await cargarFuente(input.sourceBookId, teacherId);
  const paginas = await cargarPaginas(
    input.sourceBookId,
    input.pageIds ?? (input.pageId ? [input.pageId] : null),
  );
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
    books: 0,
    withoutBooks: 0,
    skipped: (input.studentIds?.length ?? destinatarios.length) - destinatarios.length,
  };

  for (const { student_id: alumnoId } of destinatarios) {
    // Una transaccion por alumno: si una entrega falla, el resto ya repartido se
    // conserva y repetir la operacion completa los que faltan.
    await withTransaction(async (client) => {
      const destinos: string[] = [];

      if (input.target === 'existentes') {
        // Dentro de los libros que el alumno ya tiene en esta biblioteca. Se excluye
        // el propio material de origen, que es del docente, y las copias de esta
        // misma entrega, para no duplicarla sobre si misma.
        const suyos = await client.query<{ id: string }>(
          `SELECT id FROM books
           WHERE library_id = $1 AND creator_id = $2 AND id <> $3
           ORDER BY created_at
           FOR UPDATE`,
          [libraryId, alumnoId, fuente.id],
        );
        destinos.push(...suyos.rows.map((r) => r.id));
        if (!destinos.length) {
          resultado.withoutBooks += 1;
          return;
        }
        resultado.updated += destinos.length;
      } else {
        const existente = await client.query<{ id: string }>(
          `SELECT id FROM books
           WHERE origin_book_id = $1 AND creator_id = $2 AND library_id = $3
           LIMIT 1
           FOR UPDATE`,
          [fuente.id, alumnoId, libraryId],
        );

        if (existente.rows[0]) {
          destinos.push(existente.rows[0].id);
          resultado.updated += 1;
        } else {
          const creado = await client.query<{ id: string }>(
            `INSERT INTO books (title, library_id, creator_id, layout_format, origin_book_id, page_numbering)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
              titulo,
              libraryId,
              alumnoId,
              fuente.layout_format,
              fuente.id,
              // El libro de la entrega se numera como el material del que sale.
              fuente.page_numbering ? JSON.stringify(fuente.page_numbering) : null,
            ],
          );
          destinos.push(creado.rows[0].id);
          resultado.created += 1;
        }
      }

      for (const destinoId of destinos) {
        resultado.pages += await copiarPaginas(client, paginas, destinoId, await posicionEn(client, destinoId, input));
        await client.query('UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [destinoId]);
      }
      resultado.books += destinos.length;
      resultado.delivered += 1;
    });
  }

  return resultado;
}

export interface LibrosAlumnadoResult {
  /** Libros creados. */
  created: number;
  /** Alumnado que ya tenia libro en la biblioteca y se ha saltado. */
  skipped: number;
}

/**
 * Un libro en blanco para cada alumno de la biblioteca.
 *
 * Es lo que se hace al montar un grupo nuevo: que cada alumno encuentre su libro
 * listo para empezar, en vez de que treinta personas creen el suyo a la vez con
 * treinta titulos distintos. El libro es del alumno (creador y portafolio suyos),
 * no del docente: lo edita como si lo hubiera creado el.
 *
 * Por omision se salta a quien ya tiene algun libro en la biblioteca, para que
 * repetir la operacion (por ejemplo tras anadir alumnado nuevo) no duplique.
 */
export async function crearLibrosEnBlanco(
  libraryId: string,
  teacherId: string,
  input: { title: string; layoutFormat: string; soloSinLibro: boolean; studentIds?: string[] },
): Promise<LibrosAlumnadoResult> {
  await requireManager(libraryId, teacherId);

  const { rows: alumnado } = await query<{ student_id: string; tiene: boolean }>(
    `SELECT ls.student_id,
            EXISTS (SELECT 1 FROM books b WHERE b.library_id = ls.library_id AND b.creator_id = ls.student_id) AS tiene
     FROM library_students ls
     WHERE ls.library_id = $1 AND ($2::uuid[] IS NULL OR ls.student_id = ANY($2::uuid[]))`,
    [libraryId, input.studentIds ?? null],
  );
  if (!alumnado.length) throw HttpError.badRequest('Esta biblioteca todavía no tiene alumnado');

  const destinatarios = alumnado.filter((a) => !(input.soloSinLibro && a.tiene));
  const resultado: LibrosAlumnadoResult = { created: 0, skipped: alumnado.length - destinatarios.length };

  // Todo o nada: con treinta alumnos, quedarse a medias obligaria a revisar a mano
  // quien tiene libro y quien no.
  await withTransaction(async (client) => {
    for (const { student_id: alumnoId } of destinatarios) {
      const portafolio = await client.query<{ id: string }>(
        `INSERT INTO student_portfolios (student_id, name)
         SELECT id, 'Portafolio de ' || full_name FROM users WHERE id = $1
         ON CONFLICT (student_id) DO UPDATE SET student_id = EXCLUDED.student_id
         RETURNING id`,
        [alumnoId],
      );
      const libro = await client.query<{ id: string }>(
        `INSERT INTO books (title, library_id, portfolio_id, creator_id, layout_format)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [input.title, libraryId, portafolio.rows[0]?.id ?? null, alumnoId, input.layoutFormat],
      );
      // Como cualquier libro: nace con portada para que el editor tenga lienzo.
      await client.query('INSERT INTO pages (book_id, page_number) VALUES ($1, 1)', [libro.rows[0].id]);
      resultado.created += 1;
    }
  });

  return resultado;
}

/** Alumnado de la biblioteca que aun no tiene su copia de un libro concreto. */
export async function alumnadoSinCopia(
  libraryId: string,
  teacherId: string,
  sourceBookId: string,
): Promise<{ total: number; faltan: string[] }> {
  await requireManager(libraryId, teacherId);
  const { rows } = await query<{ student_id: string; tiene: boolean }>(
    `SELECT ls.student_id,
            EXISTS (SELECT 1 FROM books b
                     WHERE b.library_id = ls.library_id AND b.creator_id = ls.student_id
                       AND b.origin_book_id = $2) AS tiene
     FROM library_students ls WHERE ls.library_id = $1`,
    [libraryId, sourceBookId],
  );
  if (!rows.length) throw HttpError.badRequest('Esta biblioteca todavía no tiene alumnado');
  return { total: rows.length, faltan: rows.filter((r) => !r.tiene).map((r) => r.student_id) };
}
