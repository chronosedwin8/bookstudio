import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { sanitizeCover, type CanvasElement } from './books.service.js';

/**
 * Mural: la vitrina publica de la plataforma.
 *
 * Se ve sin cuenta y sin enlace secreto, a diferencia de compartir un libro, que
 * reparte una direccion que solo tiene quien la recibe. Por eso publicar aqui es
 * una decision aparte y explicita del profesorado: que un libro sea "publico"
 * por enlace no significa que su autor quiera verlo en la portada del colegio.
 *
 * El alumnado no publica en el mural. Puede crear y compartir sus libros, pero
 * sacarlos a un escaparate abierto a internet lo decide quien responde de la
 * clase.
 */

export interface MuralBook {
  id: string;
  title: string;
  layoutFormat: 'portrait' | 'square' | 'landscape';
  /** Token del enlace compartido: es con lo que se abre el libro desde el mural. */
  shareToken: string;
  authorName: string | null;
  libraryName: string | null;
  pageCount: number;
  publishedAt: string;
  cover: {
    backgroundColor: string;
    backgroundPattern: string | null;
    elements: CanvasElement[];
  } | null;
}

export interface MuralPage {
  items: MuralBook[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MuralRow {
  id: string;
  title: string;
  layout_format: MuralBook['layoutFormat'];
  share_token: string;
  author_name: string | null;
  library_name: string | null;
  page_count: string;
  mural_at: Date;
  cover_background: string | null;
  cover_pattern: string | null;
  cover_elements: CanvasElement[] | null;
  total: string;
}

/**
 * Lista lo publicado, de lo mas reciente a lo mas antiguo.
 *
 * Solo salen libros que ademas siguen siendo publicos por enlace: si alguien
 * vuelve su libro privado, deja de verse en el mural sin tener que acordarse de
 * retirarlo aparte. La marca de publicacion se conserva, asi que al volver a
 * hacerlo publico reaparece donde estaba.
 */
export async function listMural(opciones: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<MuralPage> {
  const page = Math.max(1, opciones.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, opciones.pageSize ?? 24));
  const busqueda = (opciones.search ?? '').trim();

  const { rows } = await query<MuralRow>(
    `SELECT b.id, b.title, b.layout_format, b.share_token, b.mural_at,
            u.full_name AS author_name,
            l.name AS library_name,
            (SELECT COUNT(*) FROM pages p WHERE p.book_id = b.id) AS page_count,
            cover.background_color AS cover_background,
            cover.background_pattern AS cover_pattern,
            elems.elements AS cover_elements,
            COUNT(*) OVER () AS total
     FROM books b
     LEFT JOIN users u ON u.id = b.creator_id
     LEFT JOIN libraries l ON l.id = b.library_id
     LEFT JOIN LATERAL (
       SELECT p.id, p.background_color, p.background_pattern
       FROM pages p WHERE p.book_id = b.id ORDER BY p.page_number LIMIT 1
     ) cover ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(
                JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', ce.id, 'pageId', ce.page_id, 'type', ce.type, 'zIndex', ce.z_index,
                    'transformMatrix', ce.transform_matrix, 'properties', ce.properties,
                    'isLocked', ce.is_locked, 'opacity', ce.opacity,
                    'interaction', ce.interaction, 'animation', ce.animation,
                    'actions', ce.actions,
                    'updatedAt', ce.updated_at
                  ) ORDER BY ce.z_index
                ),
                '[]'::jsonb
              ) AS elements
       FROM canvas_elements ce WHERE ce.page_id = cover.id
     ) elems ON TRUE
     WHERE b.mural_at IS NOT NULL
       AND b.share_visibility = 'public'
       AND b.share_token IS NOT NULL
       AND ($3 = '' OR b.title ILIKE '%' || $3 || '%' OR u.full_name ILIKE '%' || $3 || '%')
     ORDER BY b.mural_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize, busqueda],
  );

  const total = rows[0] ? Number(rows[0].total) : 0;

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      layoutFormat: row.layout_format,
      shareToken: row.share_token,
      authorName: row.author_name,
      libraryName: row.library_name,
      pageCount: Number(row.page_count),
      publishedAt: row.mural_at.toISOString(),
      cover: row.cover_background
        ? {
            backgroundColor: row.cover_background,
            backgroundPattern: row.cover_pattern ?? null,
            /*
             * Sin esto, una pregunta en la primera pagina publicaba en internet
             * abierto la opcion correcta, la guia del docente y lo que hubiera
             * escrito un alumno. El mural es la unica parte que se sirve sin
             * cuenta, asi que aqui no vale confiar en que nadie mire.
             */
            elements: sanitizeCover(row.cover_elements),
          }
        : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface MuralState {
  inMural: boolean;
  publishedAt: string | null;
  /** Direccion publica del libro, para copiarla y repartirla. */
  shareToken: string | null;
}

interface Permiso {
  creator_id: string | null;
  library_id: string | null;
  role: string;
  es_duenio: boolean;
  es_docente: boolean;
}

/**
 * Quien puede poner o quitar un libro del mural.
 *
 * La administracion alcanza cualquier libro, como en el resto de la plataforma.
 * Fuera de eso hace falta ser docente Y mandar en el libro: su autor si es
 * personal, o alguien que dirige la biblioteca a la que pertenece.
 */
async function comprobarPermiso(bookId: string, userId: string): Promise<Permiso> {
  const { rows } = await query<Permiso>(
    `SELECT b.creator_id, b.library_id,
            u.role,
            (b.creator_id = $2) AS es_duenio,
            (l.owner_id = $2 OR EXISTS (
               SELECT 1 FROM library_teachers lt
               WHERE lt.library_id = l.id AND lt.teacher_id = $2
             )) AS es_docente
     FROM books b
     LEFT JOIN libraries l ON l.id = b.library_id
     JOIN users u ON u.id = $2
     WHERE b.id = $1`,
    [bookId, userId],
  );

  const fila = rows[0];
  if (!fila) throw HttpError.notFound('Libro no encontrado');

  if (fila.role === 'admin') return fila;

  if (fila.role !== 'teacher') {
    throw HttpError.forbidden('Solo el profesorado publica en el mural');
  }
  // Un libro personal es de su autor; uno de clase, de quien dirige la clase.
  const manda = fila.library_id ? fila.es_docente === true : fila.es_duenio === true;
  if (!manda) throw HttpError.forbidden('Este libro no es tuyo');

  return fila;
}

/**
 * Saca el libro al mural.
 *
 * De paso lo vuelve publico por enlace y le da uno si no lo tenia: sin eso el
 * mural ensenaria portadas que nadie puede abrir, que es peor que no ensenarlas.
 */
export async function publicarEnMural(bookId: string, userId: string): Promise<MuralState> {
  await comprobarPermiso(bookId, userId);

  const { rows } = await query<{ mural_at: Date | null; share_token: string | null }>(
    `UPDATE books
     SET mural_at = COALESCE(mural_at, NOW()),
         mural_by = $2,
         share_visibility = 'public',
         share_token = COALESCE(share_token, gen_random_uuid())
     WHERE id = $1
     RETURNING mural_at, share_token`,
    [bookId, userId],
  );

  return {
    inMural: true,
    publishedAt: rows[0].mural_at?.toISOString() ?? null,
    shareToken: rows[0].share_token,
  };
}

/**
 * Lo retira del mural. No lo vuelve privado: el enlace que se hubiera repartido
 * sigue funcionando, porque retirarlo del escaparate y romper los enlaces que ya
 * tiene la gente son dos decisiones distintas.
 */
export async function retirarDelMural(bookId: string, userId: string): Promise<MuralState> {
  await comprobarPermiso(bookId, userId);

  const { rows } = await query<{ share_token: string | null }>(
    `UPDATE books SET mural_at = NULL, mural_by = NULL WHERE id = $1 RETURNING share_token`,
    [bookId],
  );

  return { inMural: false, publishedAt: null, shareToken: rows[0].share_token };
}

/** Si el libro esta en el mural; lo consulta el editor para pintar el interruptor. */
export async function estadoMural(bookId: string, userId: string): Promise<MuralState> {
  await comprobarPermiso(bookId, userId);

  const { rows } = await query<{ mural_at: Date | null; share_token: string | null }>(
    'SELECT mural_at, share_token FROM books WHERE id = $1',
    [bookId],
  );

  return {
    inMural: rows[0].mural_at !== null,
    publishedAt: rows[0].mural_at?.toISOString() ?? null,
    shareToken: rows[0].share_token,
  };
}
