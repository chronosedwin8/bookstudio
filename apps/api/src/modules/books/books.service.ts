import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess } from '../libraries/libraries.service.js';
import { TRIAL_LIMITS } from '../auth/trial.service.js';
import { EDITOR_TOOLS, sanitizeTools } from '../canvas/tools.js';
import {
  parseProperties,
  type CreateElementInput,
  type ElementType,
  type TransformMatrix,
  type UpdateElementInput,
} from '../canvas/canvas.schemas.js';
import type {
  CreateBookInput,
  CreatePageInput,
  ListBooksQuery,
  UpdateBookInput,
  UpdatePageInput,
} from './books.schemas.js';

export interface CanvasElement {
  id: string;
  pageId: string;
  type: ElementType;
  zIndex: number;
  transformMatrix: TransformMatrix;
  properties: Record<string, unknown>;
  isLocked: boolean;
  opacity: number;
  updatedAt: string;
}

export interface Page {
  id: string;
  bookId: string;
  pageNumber: number;
  backgroundColor: string;
  backgroundPattern: string | null;
  elements: CanvasElement[];
}

/** Primera pagina del libro, para pintar la portada en las listas. */
export interface CoverPage {
  backgroundColor: string;
  backgroundPattern: string | null;
  elements: CanvasElement[];
}

export interface Book {
  id: string;
  title: string;
  /** null cuando el libro es personal y no pertenece a ninguna biblioteca. */
  libraryId: string | null;
  portfolioId: string | null;
  creatorId: string | null;
  layoutFormat: 'portrait' | 'square' | 'landscape';
  isTemplate: boolean;
  isPublished: boolean;
  publishingSettings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  pageCount?: number;
  cover?: CoverPage | null;
  shareVisibility?: ShareVisibility;
  shareToken?: string | null;
  /** Todo miembro de la biblioteca puede editarlo, no solo su autor. */
  collaborative?: boolean;
  /** Nombre de quien lo creo; solo llega al listar, para agrupar por autor. */
  creatorName?: string | null;
  /** Curso del autor, tomado de su clase del sistema academico. */
  creatorCourse?: string | null;
  /** Material del que salio, si el libro llego por una entrega del docente. */
  originBookId?: string | null;
}

export type ShareVisibility = 'private' | 'library' | 'public';

interface BookRow {
  id: string;
  title: string;
  library_id: string | null;
  portfolio_id: string | null;
  creator_id: string | null;
  layout_format: Book['layoutFormat'];
  is_template: boolean;
  is_published: boolean;
  publishing_settings: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  page_count?: string;
  cover_background?: string | null;
  cover_pattern?: string | null;
  cover_elements?: CanvasElement[] | null;
  share_visibility?: ShareVisibility;
  share_token?: string | null;
  collaborative?: boolean;
  creator_name?: string | null;
  creator_course?: string | null;
  origin_book_id?: string | null;
}

const BOOK_COLUMNS = `id, title, library_id, portfolio_id, creator_id, layout_format,
  is_template, is_published, publishing_settings, created_at, updated_at,
  share_visibility, share_token, collaborative`;

function toBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    libraryId: row.library_id,
    portfolioId: row.portfolio_id,
    creatorId: row.creator_id,
    layoutFormat: row.layout_format,
    isTemplate: row.is_template,
    isPublished: row.is_published,
    publishingSettings: row.publishing_settings,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.share_visibility !== undefined
      ? {
          shareVisibility: row.share_visibility,
          shareToken: row.share_token ?? null,
          collaborative: row.collaborative === true,
        }
      : {}),
    ...(row.page_count !== undefined ? { pageCount: Number(row.page_count) } : {}),
    ...(row.creator_name !== undefined ? { creatorName: row.creator_name } : {}),
    ...(row.creator_course !== undefined ? { creatorCourse: row.creator_course } : {}),
    ...(row.origin_book_id !== undefined ? { originBookId: row.origin_book_id } : {}),
    ...(row.cover_background !== undefined
      ? {
          cover: row.cover_background
            ? {
                backgroundColor: row.cover_background,
                backgroundPattern: row.cover_pattern ?? null,
                elements: row.cover_elements ?? [],
              }
            : null,
        }
      : {}),
  };
}

export interface BookPermissions {
  canView: boolean;
  canEdit: boolean;
  canPublish: boolean;
  isManager: boolean;
}

interface BookContext {
  book: BookRow;
  permissions: BookPermissions;
  /** Herramientas del editor que el alumnado de esta biblioteca no puede usar. */
  disabledTools: ElementType[];
}

/** Resuelve el libro junto a los permisos efectivos derivados de la biblioteca y del rol. */
async function loadContext(bookId: string, userId: string): Promise<BookContext> {
  // LEFT JOIN: los libros personales no tienen biblioteca de la que heredar permisos.
  const { rows } = await query<
    BookRow & {
      student_editable: boolean;
      student_publishable: boolean;
      students_see_peers: boolean;
      creator_is_manager: boolean;
      es_administracion: boolean | null;
      disabled_tools: ElementType[] | null;
    }
  >(
    `SELECT b.id, b.title, b.library_id, b.portfolio_id, b.creator_id, b.layout_format,
            b.is_template, b.is_published, b.publishing_settings, b.created_at, b.updated_at,
            b.share_visibility, b.share_token, b.collaborative,
            l.student_editable, l.student_publishable, l.students_see_peers, l.disabled_tools,
            -- El material que reparte el profesorado se ve siempre, aunque el resto
            -- de creaciones esten ocultas entre companeros.
            (b.creator_id = l.owner_id OR EXISTS (
               SELECT 1 FROM library_teachers lt
               WHERE lt.library_id = l.id AND lt.teacher_id = b.creator_id
             )) AS creator_is_manager,
            (SELECT role = 'admin' FROM users WHERE id = $2) AS es_administracion
     FROM books b LEFT JOIN libraries l ON l.id = b.library_id
     WHERE b.id = $1`,
    [bookId, userId],
  );

  const row = rows[0];
  if (!row) throw HttpError.notFound('Libro no encontrado');

  /*
   * La administracion de la plataforma alcanza cualquier libro, tambien los
   * personales de otras personas. Es lo que permite arreglar un libro roto sin
   * pedirle la contrasena a su autor.
   */
  if (row.es_administracion) {
    return {
      book: row,
      permissions: { canView: true, canEdit: true, canPublish: true, isManager: true },
      disabledTools: [],
    };
  }

  // Libro personal: su autor manda sobre todo y nadie mas lo ve.
  if (!row.library_id) {
    if (row.creator_id !== userId) throw HttpError.notFound('Libro no encontrado');
    // Un libro personal no pertenece a ninguna clase: no hay nada que limitar.
    return {
      book: row,
      permissions: { canView: true, canEdit: true, canPublish: true, isManager: true },
      disabledTools: [],
    };
  }

  const access = await getAccess(row.library_id, userId);
  const isManager = access !== 'student';
  const isOwner = row.creator_id === userId;
  // Libro colaborativo: cualquier miembro de la biblioteca aporta contenido.
  const collaborator = row.collaborative === true && row.student_editable;

  // Con la visibilidad entre companeros apagada, un alumno solo alcanza lo suyo, lo
  // que reparte el profesorado y lo que se hace en comun. Se comprueba aqui, y no
  // solo al listar, porque si no bastaria con conocer la URL del libro de otro.
  const puedeVer =
    isManager || isOwner || row.students_see_peers !== false || row.creator_is_manager || row.collaborative === true;
  if (!puedeVer) {
    throw HttpError.forbidden('En esta biblioteca no se pueden ver las creaciones de otros companeros');
  }

  return {
    book: row,
    permissions: {
      canView: true,
      canEdit: isManager || collaborator || (isOwner && row.student_editable),
      canPublish: isManager || (isOwner && row.student_publishable),
      isManager,
    },
    disabledTools: sanitizeTools(row.disabled_tools),
  };
}

async function requireEdit(bookId: string, userId: string): Promise<BookContext> {
  const context = await loadContext(bookId, userId);
  if (!context.permissions.canEdit) {
    throw HttpError.forbidden('No tienes permiso para editar este libro');
  }
  return context;
}

/**
 * Cupos del modo de prueba.
 *
 * Se comprueban en el servidor, no en la interfaz: la cuenta de prueba tiene rol de
 * docente y podria llamar a la API directamente. Una sola consulta resuelve si la
 * cuenta es de prueba y cuanto lleva usado.
 */
async function assertTrialAllowsNewBook(userId: string): Promise<void> {
  const { rows } = await query<{ is_trial: boolean; books: string }>(
    `SELECT u.is_trial, (SELECT COUNT(*) FROM books b WHERE b.creator_id = u.id) AS books
     FROM users u WHERE u.id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row?.is_trial) return;

  if (Number(row.books) >= TRIAL_LIMITS.maxBooks) {
    throw HttpError.forbidden(
      `La prueba permite ${TRIAL_LIMITS.maxBooks} libro. Crea una cuenta para seguir.`,
    );
  }
}

/** Igual que la anterior, pero para el numero de paginas de un libro. */
async function assertTrialAllowsNewPage(userId: string, bookId: string): Promise<void> {
  const { rows } = await query<{ is_trial: boolean; pages: string }>(
    `SELECT u.is_trial, (SELECT COUNT(*) FROM pages p WHERE p.book_id = $2) AS pages
     FROM users u WHERE u.id = $1`,
    [userId, bookId],
  );

  const row = rows[0];
  if (!row?.is_trial) return;

  if (Number(row.pages) >= TRIAL_LIMITS.maxPagesPerBook) {
    throw HttpError.forbidden(
      `La prueba permite ${TRIAL_LIMITS.maxPagesPerBook} paginas por libro. Crea una cuenta para seguir.`,
    );
  }
}

/** Comprueba cuota y permisos de la biblioteca antes de crear un libro de clase. */
async function assertCanCreateInLibrary(libraryId: string, userId: string, isTemplate: boolean): Promise<void> {
  const access = await getAccess(libraryId, userId);
  const isManager = access !== 'student';

  if (isTemplate && !isManager) {
    throw HttpError.forbidden('Solo los docentes pueden crear plantillas');
  }
  if (isManager) return;

  const library = await query<{ student_book_limit: number; student_editable: boolean }>(
    'SELECT student_book_limit, student_editable FROM libraries WHERE id = $1',
    [libraryId],
  );
  if (!library.rows[0].student_editable) {
    throw HttpError.forbidden('La creacion de libros esta deshabilitada en esta biblioteca');
  }

  const existing = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM books WHERE library_id = $1 AND creator_id = $2',
    [libraryId, userId],
  );
  if (Number(existing.rows[0].count) >= library.rows[0].student_book_limit) {
    throw HttpError.forbidden(`Alcanzaste el limite de ${library.rows[0].student_book_limit} libros`);
  }
}

/**
 * Crea un libro de clase (con libraryId) o personal (sin el). El libro personal no
 * depende de ninguna biblioteca, asi que no aplica cuotas ni permisos de docente:
 * cualquier usuario autenticado puede tener los suyos, dentro o fuera de un curso.
 */
export async function createBook(userId: string, role: string, input: CreateBookInput): Promise<Book> {
  const libraryId = input.libraryId ?? null;

  await assertTrialAllowsNewBook(userId);

  if (libraryId) {
    await assertCanCreateInLibrary(libraryId, userId, input.isTemplate);
  } else if (input.isTemplate && role === 'student') {
    throw HttpError.forbidden('Solo los docentes pueden crear plantillas');
  }

  return withTransaction(async (client) => {
    // El portafolio agrupa la obra personal del autor; se crea al vuelo si aun no existe.
    const portfolio = await client.query<{ id: string }>(
      `INSERT INTO student_portfolios (student_id, name)
       SELECT id, 'Portafolio de ' || full_name FROM users WHERE id = $1
       ON CONFLICT (student_id) DO UPDATE SET student_id = EXCLUDED.student_id
       RETURNING id`,
      [userId],
    );

    const inserted = await client.query<BookRow>(
      `INSERT INTO books (title, library_id, portfolio_id, creator_id, layout_format, is_template)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${BOOK_COLUMNS}`,
      [
        input.title,
        libraryId,
        portfolio.rows[0]?.id ?? null,
        userId,
        input.layoutFormat,
        input.isTemplate,
      ],
    );

    // Todo libro nace con portada para que el editor siempre tenga lienzo.
    await client.query('INSERT INTO pages (book_id, page_number) VALUES ($1, 1)', [inserted.rows[0].id]);

    return toBook(inserted.rows[0]);
  });
}

export async function listBooks(userId: string, filters: ListBooksQuery): Promise<Book[]> {
  if (filters.libraryId) await getAccess(filters.libraryId, userId);

  const values: unknown[] = [userId, filters.all === 'true'];

  /*
   * Con el interruptor de la administracion, las dos reglas de visibilidad se
   * levantan de golpe. Solo surte efecto para quien tiene rol `admin`: el
   * parametro por si solo no abre nada.
   */
  const ADMIN = `($2 AND EXISTS (SELECT 1 FROM users adm WHERE adm.id = $1 AND adm.role = 'admin'))`;

  // Un libro es visible si pertenece a una biblioteca del usuario o si es su libro personal.
  // Con EXISTS en vez de JOIN no hacen falta DISTINCT (que ademas no admite columnas json).
  const conditions: string[] = [
    `(${ADMIN} OR ((b.library_id IS NOT NULL AND (
         l.owner_id = $1
         OR EXISTS (SELECT 1 FROM library_teachers lt WHERE lt.library_id = l.id AND lt.teacher_id = $1)
         OR EXISTS (SELECT 1 FROM library_students ls WHERE ls.library_id = l.id AND ls.student_id = $1)
      ))
      OR (b.library_id IS NULL AND b.creator_id = $1)))`,
    // Visibilidad entre companeros: si la biblioteca la tiene apagada y quien mira es
    // alumno, solo salen sus libros, los del profesorado y los colaborativos.
    `(${ADMIN}
      OR b.library_id IS NULL
      OR l.students_see_peers
      OR b.creator_id = $1
      OR b.collaborative
      OR l.owner_id = $1
      OR EXISTS (SELECT 1 FROM library_teachers lt WHERE lt.library_id = l.id AND lt.teacher_id = $1)
      OR b.creator_id = l.owner_id
      OR EXISTS (SELECT 1 FROM library_teachers lt2 WHERE lt2.library_id = l.id AND lt2.teacher_id = b.creator_id))`,
  ];

  if (filters.scope === 'personal') conditions.push('b.library_id IS NULL');
  if (filters.scope === 'library') conditions.push('b.library_id IS NOT NULL');

  if (filters.libraryId) {
    values.push(filters.libraryId);
    conditions.push(`b.library_id = $${values.length}`);
  }
  if (filters.creatorId) {
    values.push(filters.creatorId);
    conditions.push(`b.creator_id = $${values.length}`);
  }
  if (filters.isTemplate) {
    values.push(filters.isTemplate === 'true');
    conditions.push(`b.is_template = $${values.length}`);
  }

  // La portada viaja con la lista para no pedir el detalle de cada libro por separado.
  const { rows } = await query<BookRow>(
    `SELECT b.id, b.title, b.library_id, b.portfolio_id, b.creator_id, b.layout_format,
            b.is_template, b.is_published, b.publishing_settings, b.created_at, b.updated_at,
            b.share_visibility, b.share_token, b.collaborative, b.origin_book_id,
            (SELECT COUNT(*) FROM pages p WHERE p.book_id = b.id) AS page_count,
            autor.full_name AS creator_name,
            -- El curso del autor (K10A y similares), guardado en su propia cuenta.
            -- Antes se buscaba una biblioteca suya importada del sistema academico,
            -- y salia vacio en cuanto se le anadia suelto a una biblioteca creada a
            -- mano, que es justo el caso de una biblioteca con varios cursos.
            autor.external_group AS creator_course,
            cover.background_color AS cover_background,
            cover.background_pattern AS cover_pattern,
            elems.elements AS cover_elements
     FROM books b
     LEFT JOIN libraries l ON l.id = b.library_id
     LEFT JOIN users autor ON autor.id = b.creator_id
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
                    'isLocked', ce.is_locked, 'opacity', ce.opacity, 'updatedAt', ce.updated_at
                  ) ORDER BY ce.z_index
                ),
                '[]'::jsonb
              ) AS elements
       FROM canvas_elements ce WHERE ce.page_id = cover.id
     ) elems ON TRUE
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.updated_at DESC`,
    values,
  );

  return rows.map(toBook);
}

interface PageRow {
  id: string;
  book_id: string;
  page_number: number;
  background_color: string;
  background_pattern: string | null;
}

interface ElementRow {
  id: string;
  page_id: string;
  type: ElementType;
  z_index: number;
  transform_matrix: TransformMatrix;
  properties: Record<string, unknown>;
  is_locked: boolean;
  opacity: string;
  updated_at: Date;
}

function toElement(row: ElementRow): CanvasElement {
  return {
    id: row.id,
    pageId: row.page_id,
    type: row.type,
    zIndex: row.z_index,
    transformMatrix: row.transform_matrix,
    properties: row.properties,
    isLocked: row.is_locked,
    opacity: Number(row.opacity),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface BookDetail extends Book {
  pages: Page[];
  permissions: BookPermissions;
  /**
   * Herramientas que el editor debe esconder a quien abre el libro. Llega vacia
   * para el profesorado: la limitacion es para el alumnado.
   */
  disabledTools: ElementType[];
}

interface StoredQuestionOption {
  id: string;
  text?: string;
  imageUrl?: string;
  correct?: boolean;
}

/** Baraja una copia sin tocar el array original (Fisher-Yates). */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Quita la solucion de un bloque de pregunta antes de enviarlo a quien solo lee.
 *
 * Sin esto bastaria con abrir las herramientas del navegador para ver que opcion
 * es la correcta. En las preguntas de ordenar, ademas, el propio orden guardado es
 * la solucion, asi que las opciones se barajan.
 */
function sanitizeQuestion(properties: Record<string, unknown>): Record<string, unknown> {
  const options = Array.isArray(properties.options) ? (properties.options as StoredQuestionOption[]) : [];
  const withoutAnswers = options.map(({ correct: _correct, ...rest }) => rest);

  return {
    ...properties,
    options: properties.kind === 'order' ? shuffled(withoutAnswers) : withoutAnswers,
  };
}

/**
 * Paginas del libro con sus elementos ya agrupados y ordenados por capa.
 * `revealAnswers` solo es cierto para quien puede editar el libro.
 */
async function loadPages(bookId: string, revealAnswers: boolean): Promise<Page[]> {
  const [pages, elements] = await Promise.all([
    query<PageRow>(
      `SELECT id, book_id, page_number, background_color, background_pattern
       FROM pages WHERE book_id = $1 ORDER BY page_number`,
      [bookId],
    ),
    query<ElementRow>(
      `SELECT ce.id, ce.page_id, ce.type, ce.z_index, ce.transform_matrix, ce.properties,
              ce.is_locked, ce.opacity, ce.updated_at
       FROM canvas_elements ce
       JOIN pages p ON p.id = ce.page_id
       WHERE p.book_id = $1
       ORDER BY ce.z_index`,
      [bookId],
    ),
  ]);

  const byPage = new Map<string, CanvasElement[]>();
  for (const row of elements.rows) {
    const element = toElement(row);
    if (element.type === 'question' && !revealAnswers) {
      element.properties = sanitizeQuestion(element.properties);
    }
    const list = byPage.get(row.page_id) ?? [];
    list.push(element);
    byPage.set(row.page_id, list);
  }

  return pages.rows.map((page) => ({
    id: page.id,
    bookId: page.book_id,
    pageNumber: page.page_number,
    backgroundColor: page.background_color,
    backgroundPattern: page.background_pattern,
    elements: byPage.get(page.id) ?? [],
  }));
}

export async function getBookDetail(bookId: string, userId: string): Promise<BookDetail> {
  const { book, permissions, disabledTools } = await loadContext(bookId, userId);
  // Solo quien puede editar necesita ver cuales son las respuestas correctas.
  return {
    ...toBook(book),
    permissions,
    disabledTools: permissions.isManager ? [] : disabledTools,
    pages: await loadPages(bookId, permissions.canEdit),
  };
}

// --- Comparticion por enlace ---

export interface ShareState {
  visibility: ShareVisibility;
  /** null mientras el libro es privado y nunca se ha compartido. */
  token: string | null;
}

/**
 * Cambia quien puede abrir el libro por enlace.
 *
 * - `private`: solo quien tenga permiso dentro de la aplicacion.
 * - `library`: cualquier miembro de la biblioteca del libro, tras identificarse.
 * - `public`: cualquiera con el enlace, sin cuenta.
 *
 * El token se crea la primera vez y se conserva, para que un enlace repartido en
 * clase siga sirviendo si se alterna la visibilidad.
 */
export async function setSharing(
  bookId: string,
  userId: string,
  visibility: ShareVisibility,
): Promise<ShareState> {
  const { book, permissions } = await loadContext(bookId, userId);

  if (!permissions.canEdit) {
    throw HttpError.forbidden('No tienes permiso para compartir este libro');
  }
  // Abrirlo a cualquiera equivale a publicarlo.
  if (visibility === 'public' && !permissions.canPublish) {
    throw HttpError.forbidden('No tienes permiso para publicar este libro');
  }
  // Un libro personal no tiene biblioteca con la que compartirlo.
  if (visibility === 'library' && !book.library_id) {
    throw HttpError.badRequest('Un libro personal no pertenece a ninguna clase; compártelo en público');
  }

  const { rows } = await query<{ share_visibility: ShareVisibility; share_token: string | null }>(
    // El cast es necesario: sin el, Postgres deduce dos tipos distintos para $2.
    `UPDATE books
     SET share_visibility = $2::text,
         share_token = CASE WHEN $2::text = 'private' THEN share_token
                            ELSE COALESCE(share_token, gen_random_uuid()) END
     WHERE id = $1
     RETURNING share_visibility, share_token`,
    [bookId, visibility],
  );

  return { visibility: rows[0].share_visibility, token: rows[0].share_token };
}

/** Invalida el enlace repartido y genera uno nuevo. */
export async function rotateShareToken(bookId: string, userId: string): Promise<ShareState> {
  const { permissions } = await loadContext(bookId, userId);
  if (!permissions.canEdit) throw HttpError.forbidden('No tienes permiso para compartir este libro');

  const { rows } = await query<{ share_visibility: ShareVisibility; share_token: string | null }>(
    `UPDATE books SET share_token = gen_random_uuid() WHERE id = $1
     RETURNING share_visibility, share_token`,
    [bookId],
  );
  return { visibility: rows[0].share_visibility, token: rows[0].share_token };
}

export interface SharedBook extends BookDetail {
  authorName: string | null;
}

/**
 * Abre un libro a partir de su token de enlace. `userId` solo hace falta cuando el
 * libro esta restringido a su biblioteca; en publico se sirve sin identificar.
 */
export async function getSharedBook(token: string, userId?: string): Promise<SharedBook> {
  const { rows } = await query<BookRow & { author_name: string | null }>(
    `SELECT b.id, b.title, b.library_id, b.portfolio_id, b.creator_id, b.layout_format,
            b.is_template, b.is_published, b.publishing_settings, b.created_at, b.updated_at,
            b.share_visibility, b.share_token, b.collaborative, u.full_name AS author_name
     FROM books b
     LEFT JOIN users u ON u.id = b.creator_id
     WHERE b.share_token = $1`,
    [token],
  );

  const row = rows[0];
  // Mismo 404 para un token inexistente y para uno revocado: no se filtra que exista.
  if (!row || row.share_visibility === 'private') {
    throw HttpError.notFound('Este enlace no esta disponible');
  }

  if (row.share_visibility === 'library') {
    if (!userId) throw HttpError.unauthorized('Inicia sesión para abrir este libro');
    // getAccess lanza 403 si el usuario no pertenece a la biblioteca.
    if (row.library_id) await getAccess(row.library_id, userId);
    else if (row.creator_id !== userId) throw HttpError.forbidden('Este libro no es tuyo');
  }

  return {
    ...toBook(row),
    authorName: row.author_name,
    // Un enlace compartido siempre es de solo lectura: no hay nada que insertar,
    // asi que la lista de herramientas vetadas no pinta nada aqui.
    permissions: { canView: true, canEdit: false, canPublish: false, isManager: false },
    disabledTools: [],
    pages: await loadPages(row.id, false),
  };
}

// --- Correccion de preguntas ---

export interface AnswerResult {
  correct: boolean;
  /** Que opciones eran correctas, para poder mostrar la solucion tras responder. */
  solution: string[];
  feedback: string;
  /**
   * Las preguntas abiertas no se corrigen solas: se guardan y las lee el docente.
   * Sin esta marca, una respuesta perfecta se mostraria como fallada.
   */
  pendingReview?: boolean;
}

/** Compara dos listas de ids como conjuntos. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Corrige la respuesta en el servidor; el cliente nunca recibio la solucion. */
function gradeQuestion(properties: Record<string, unknown>, answer: string[]): AnswerResult {
  const kind = String(properties.kind ?? 'single');
  const options = Array.isArray(properties.options) ? (properties.options as StoredQuestionOption[]) : [];

  // Abierta: no hay nada que comparar. Se acusa recibo y la revisa el docente.
  if (kind === 'open') {
    const texto = (answer[0] ?? '').trim();
    return {
      correct: false,
      pendingReview: true,
      solution: [],
      feedback: texto
        ? 'Respuesta guardada. La leerá tu profesor.'
        : 'Escribe tu respuesta antes de enviarla.',
    };
  }

  // En las de ordenar la solucion es el orden guardado; en el resto, las marcadas.
  const solution =
    kind === 'order'
      ? options.map((option) => option.id)
      : options.filter((option) => option.correct).map((option) => option.id);

  const correct =
    kind === 'order'
      ? answer.length === solution.length && answer.every((id, index) => id === solution[index])
      : sameSet(solution, answer);

  return {
    correct,
    solution,
    feedback: String(correct ? (properties.feedbackCorrect ?? '') : (properties.feedbackWrong ?? '')),
  };
}

/** Localiza un bloque de pregunta dentro de un libro. */
async function findQuestion(bookId: string, elementId: string): Promise<Record<string, unknown>> {
  const { rows } = await query<{ properties: Record<string, unknown>; type: string }>(
    `SELECT ce.type, ce.properties
     FROM canvas_elements ce
     JOIN pages p ON p.id = ce.page_id
     WHERE ce.id = $1 AND p.book_id = $2`,
    [elementId, bookId],
  );
  if (!rows[0] || rows[0].type !== 'question') throw HttpError.notFound('Pregunta no encontrada');
  return rows[0].properties;
}

/** Corrige una pregunta de un libro al que se accede con sesion. */
export async function answerQuestion(
  bookId: string,
  elementId: string,
  userId: string,
  answer: string[],
): Promise<AnswerResult> {
  // loadContext ya rechaza a quien no deberia ni ver el libro.
  await loadContext(bookId, userId);
  const properties = await findQuestion(bookId, elementId);
  const resultado = gradeQuestion(properties, answer);

  /**
   * La respuesta abierta se guarda en el propio elemento.
   *
   * Funciona porque al entregar material cada alumno recibe SU copia del libro: lo
   * que escribe queda en su ejemplar y no lo ve nadie mas. Guardar solo si el libro
   * es suyo evita que alguien escriba en el de un companero.
   */
  if (resultado.pendingReview && (answer[0] ?? '').trim()) {
    const { rows } = await query<{ creator_id: string | null }>(
      'SELECT creator_id FROM books WHERE id = $1',
      [bookId],
    );
    if (rows[0]?.creator_id === userId) {
      await query(
        `UPDATE canvas_elements
         SET properties = properties || $2::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          elementId,
          JSON.stringify({ studentAnswer: answer[0].trim().slice(0, 4000), answeredAt: new Date().toISOString() }),
        ],
      );
    }
  }

  return resultado;
}

/** Corrige una pregunta de un libro abierto por enlace compartido. */
export async function answerSharedQuestion(
  token: string,
  elementId: string,
  answer: string[],
  userId?: string,
): Promise<AnswerResult> {
  const book = await getSharedBook(token, userId);
  return gradeQuestion(await findQuestion(book.id, elementId), answer);
}

/** Activa o desactiva la edicion compartida; solo el docente o el autor deciden. */
export async function setCollaborative(
  bookId: string,
  userId: string,
  collaborative: boolean,
): Promise<Book> {
  const { book, permissions } = await loadContext(bookId, userId);

  if (!permissions.isManager && book.creator_id !== userId) {
    throw HttpError.forbidden('Solo el autor o un docente pueden cambiar la edición compartida');
  }
  if (collaborative && !book.library_id) {
    throw HttpError.badRequest('Un libro personal no tiene grupo con el que colaborar');
  }

  const { rows } = await query<BookRow>(
    `UPDATE books SET collaborative = $2 WHERE id = $1 RETURNING ${BOOK_COLUMNS}`,
    [bookId, collaborative],
  );
  return toBook(rows[0]);
}

export async function updateBook(bookId: string, userId: string, input: UpdateBookInput): Promise<Book> {
  const { permissions } = await requireEdit(bookId, userId);

  if (input.isPublished !== undefined && !permissions.canPublish) {
    throw HttpError.forbidden('No tienes permiso para publicar este libro');
  }
  if (input.isTemplate !== undefined && !permissions.isManager) {
    throw HttpError.forbidden('Solo los docentes pueden marcar plantillas');
  }

  const columns: Record<string, string> = {
    title: 'title',
    isPublished: 'is_published',
    isTemplate: 'is_template',
    publishingSettings: 'publishing_settings',
  };

  const sets: string[] = [];
  const values: unknown[] = [bookId];
  for (const [key, column] of Object.entries(columns)) {
    const value = input[key as keyof UpdateBookInput];
    if (value === undefined) continue;
    values.push(key === 'publishingSettings' ? JSON.stringify(value) : value);
    sets.push(`${column} = $${values.length}`);
  }

  const { rows } = await query<BookRow>(
    `UPDATE books SET ${sets.join(', ')} WHERE id = $1 RETURNING ${BOOK_COLUMNS}`,
    values,
  );
  return toBook(rows[0]);
}

export async function deleteBook(bookId: string, userId: string): Promise<void> {
  const { book, permissions } = await loadContext(bookId, userId);
  if (!permissions.isManager && book.creator_id !== userId) {
    throw HttpError.forbidden('Solo el autor o un docente pueden eliminar el libro');
  }
  await query('DELETE FROM books WHERE id = $1', [bookId]);
}

async function touchBook(client: PoolClient, bookId: string): Promise<void> {
  await client.query('UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [bookId]);
}

export async function addPage(bookId: string, userId: string, input: CreatePageInput): Promise<Page> {
  await requireEdit(bookId, userId);
  await assertTrialAllowsNewPage(userId, bookId);

  return withTransaction(async (client) => {
    // Serializa inserciones concurrentes: FOR UPDATE no admite agregaciones, se bloquea el libro.
    await client.query('SELECT 1 FROM books WHERE id = $1 FOR UPDATE', [bookId]);

    const last = await client.query<{ max: number | null }>(
      'SELECT MAX(page_number) AS max FROM pages WHERE book_id = $1',
      [bookId],
    );
    const lastNumber = last.rows[0].max ?? 0;
    const position = input.afterPageNumber === undefined ? lastNumber : Math.min(input.afterPageNumber, lastNumber);

    // Se desplaza en negativo primero porque (book_id, page_number) es unico.
    if (position < lastNumber) {
      await client.query(
        'UPDATE pages SET page_number = -page_number WHERE book_id = $1 AND page_number > $2',
        [bookId, position],
      );
      await client.query(
        'UPDATE pages SET page_number = -page_number + 1 WHERE book_id = $1 AND page_number < 0',
        [bookId],
      );
    }

    const inserted = await client.query<PageRow>(
      `INSERT INTO pages (book_id, page_number, background_color, background_pattern)
       VALUES ($1, $2, $3, $4)
       RETURNING id, book_id, page_number, background_color, background_pattern`,
      [bookId, position + 1, input.backgroundColor, input.backgroundPattern],
    );

    const page = inserted.rows[0];

    // Contenido inicial (plantillas): dentro de la misma transaccion que la pagina.
    const elements: CanvasElement[] = [];
    for (const [index, element] of (input.elements ?? []).entries()) {
      const properties = parseProperties(element.type, element.properties);
      const created = await client.query<ElementRow>(
        `INSERT INTO canvas_elements (page_id, type, z_index, transform_matrix, properties, is_locked, opacity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, page_id, type, z_index, transform_matrix, properties, is_locked, opacity, updated_at`,
        [
          page.id,
          element.type,
          element.zIndex ?? index,
          JSON.stringify(element.transformMatrix),
          JSON.stringify(properties),
          element.isLocked,
          element.opacity,
        ],
      );
      elements.push(toElement(created.rows[0]));
    }

    await touchBook(client, bookId);

    return {
      id: page.id,
      bookId: page.book_id,
      pageNumber: page.page_number,
      backgroundColor: page.background_color,
      backgroundPattern: page.background_pattern,
      elements,
    };
  });
}

/** Copia una pagina con todos sus elementos justo detras de la original. */
export async function duplicatePage(bookId: string, pageId: string, userId: string): Promise<Page> {
  await requireEdit(bookId, userId);
  await assertTrialAllowsNewPage(userId, bookId);

  return withTransaction(async (client) => {
    // Se bloquea el libro para que dos duplicados a la vez no choquen al renumerar.
    await client.query('SELECT 1 FROM books WHERE id = $1 FOR UPDATE', [bookId]);

    const source = await client.query<PageRow>(
      `SELECT id, book_id, page_number, background_color, background_pattern
       FROM pages WHERE id = $1 AND book_id = $2`,
      [pageId, bookId],
    );
    if (!source.rows[0]) throw HttpError.notFound('Página no encontrada');
    const original = source.rows[0];

    // Hueco para la copia: se desplaza en negativo primero por el indice unico.
    await client.query(
      'UPDATE pages SET page_number = -page_number WHERE book_id = $1 AND page_number > $2',
      [bookId, original.page_number],
    );
    await client.query(
      'UPDATE pages SET page_number = -page_number + 1 WHERE book_id = $1 AND page_number < 0',
      [bookId],
    );

    const inserted = await client.query<PageRow>(
      `INSERT INTO pages (book_id, page_number, background_color, background_pattern)
       VALUES ($1, $2, $3, $4)
       RETURNING id, book_id, page_number, background_color, background_pattern`,
      [bookId, original.page_number + 1, original.background_color, original.background_pattern],
    );
    const copy = inserted.rows[0];

    // Los elementos se copian en bloque conservando capas, bloqueo y opacidad.
    const elements = await client.query<ElementRow>(
      `INSERT INTO canvas_elements (page_id, type, z_index, transform_matrix, properties, is_locked, opacity)
       SELECT $1, type, z_index, transform_matrix, properties, is_locked, opacity
       FROM canvas_elements WHERE page_id = $2
       ORDER BY z_index
       RETURNING id, page_id, type, z_index, transform_matrix, properties, is_locked, opacity, updated_at`,
      [copy.id, pageId],
    );

    await touchBook(client, bookId);

    return {
      id: copy.id,
      bookId: copy.book_id,
      pageNumber: copy.page_number,
      backgroundColor: copy.background_color,
      backgroundPattern: copy.background_pattern,
      elements: elements.rows.map(toElement),
    };
  });
}

export async function updatePage(
  bookId: string,
  pageId: string,
  userId: string,
  input: UpdatePageInput,
): Promise<Omit<Page, 'elements'>> {
  await requireEdit(bookId, userId);

  const sets: string[] = [];
  const values: unknown[] = [pageId, bookId];
  if (input.backgroundColor !== undefined) {
    values.push(input.backgroundColor);
    sets.push(`background_color = $${values.length}`);
  }
  if (input.backgroundPattern !== undefined) {
    values.push(input.backgroundPattern);
    sets.push(`background_pattern = $${values.length}`);
  }

  const { rows } = await query<PageRow>(
    `UPDATE pages SET ${sets.join(', ')} WHERE id = $1 AND book_id = $2
     RETURNING id, book_id, page_number, background_color, background_pattern`,
    values,
  );
  if (!rows[0]) throw HttpError.notFound('Página no encontrada');

  return {
    id: rows[0].id,
    bookId: rows[0].book_id,
    pageNumber: rows[0].page_number,
    backgroundColor: rows[0].background_color,
    backgroundPattern: rows[0].background_pattern,
  };
}

export async function deletePage(bookId: string, pageId: string, userId: string): Promise<void> {
  await requireEdit(bookId, userId);

  await withTransaction(async (client) => {
    const total = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM pages WHERE book_id = $1', [
      bookId,
    ]);
    if (Number(total.rows[0].count) <= 1) {
      throw HttpError.badRequest('El libro debe conservar al menos una página');
    }

    const deleted = await client.query<{ page_number: number }>(
      'DELETE FROM pages WHERE id = $1 AND book_id = $2 RETURNING page_number',
      [pageId, bookId],
    );
    if (!deleted.rows[0]) throw HttpError.notFound('Página no encontrada');

    await client.query('UPDATE pages SET page_number = page_number - 1 WHERE book_id = $1 AND page_number > $2', [
      bookId,
      deleted.rows[0].page_number,
    ]);
    await touchBook(client, bookId);
  });
}

export async function reorderPages(bookId: string, userId: string, pageIds: string[]): Promise<void> {
  await requireEdit(bookId, userId);

  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>('SELECT id FROM pages WHERE book_id = $1', [bookId]);
    const known = new Set(existing.rows.map((r) => r.id));

    if (pageIds.length !== known.size || pageIds.some((id) => !known.has(id))) {
      throw HttpError.badRequest('La lista debe contener exactamente todas las páginas del libro');
    }

    await client.query('UPDATE pages SET page_number = -page_number WHERE book_id = $1', [bookId]);
    for (const [index, id] of pageIds.entries()) {
      await client.query('UPDATE pages SET page_number = $1 WHERE id = $2 AND book_id = $3', [
        index + 1,
        id,
        bookId,
      ]);
    }
    await touchBook(client, bookId);
  });
}

async function assertPageBelongs(client: PoolClient, bookId: string, pageId: string): Promise<void> {
  const { rowCount } = await client.query('SELECT 1 FROM pages WHERE id = $1 AND book_id = $2', [pageId, bookId]);
  if (!rowCount) throw HttpError.notFound('Página no encontrada en este libro');
}

export async function createElement(
  bookId: string,
  pageId: string,
  userId: string,
  input: CreateElementInput,
): Promise<CanvasElement> {
  const { permissions, disabledTools } = await requireEdit(bookId, userId);

  /*
   * Herramientas vetadas al alumnado. Se comprueba aqui y no solo escondiendo el
   * boton: un alumno con la consola del navegador abierta se saltaria un menu
   * oculto en un minuto. Al profesorado no le afecta, que es quien decide.
   */
  if (!permissions.isManager && disabledTools.includes(input.type)) {
    const nombre = EDITOR_TOOLS.find((t) => t.id === input.type)?.label ?? input.type;
    throw HttpError.forbidden(`En esta biblioteca no se puede usar la herramienta "${nombre}"`);
  }

  const properties = parseProperties(input.type, input.properties);

  return withTransaction(async (client) => {
    await assertPageBelongs(client, bookId, pageId);

    let zIndex = input.zIndex;
    if (zIndex === undefined) {
      const top = await client.query<{ max: number | null }>(
        'SELECT MAX(z_index) AS max FROM canvas_elements WHERE page_id = $1',
        [pageId],
      );
      zIndex = (top.rows[0].max ?? -1) + 1;
    }

    const inserted = await client.query<ElementRow>(
      `INSERT INTO canvas_elements (page_id, type, z_index, transform_matrix, properties, is_locked, opacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, page_id, type, z_index, transform_matrix, properties, is_locked, opacity, updated_at`,
      [
        pageId,
        input.type,
        zIndex,
        JSON.stringify(input.transformMatrix),
        JSON.stringify(properties),
        input.isLocked,
        input.opacity,
      ],
    );

    await touchBook(client, bookId);
    return toElement(inserted.rows[0]);
  });
}

export async function updateElement(
  bookId: string,
  pageId: string,
  elementId: string,
  userId: string,
  input: UpdateElementInput,
): Promise<CanvasElement> {
  const { permissions } = await requireEdit(bookId, userId);

  return withTransaction(async (client) => {
    await assertPageBelongs(client, bookId, pageId);

    const current = await client.query<{ type: ElementType; is_locked: boolean }>(
      'SELECT type, is_locked FROM canvas_elements WHERE id = $1 AND page_id = $2 FOR UPDATE',
      [elementId, pageId],
    );
    if (!current.rows[0]) throw HttpError.notFound('Elemento no encontrado');

    // Los elementos bloqueados solo los libera un docente.
    if (current.rows[0].is_locked && !permissions.isManager) {
      throw HttpError.forbidden('Este elemento esta bloqueado por el docente');
    }
    if (input.isLocked !== undefined && !permissions.isManager) {
      throw HttpError.forbidden('Solo los docentes pueden bloquear elementos');
    }

    const sets: string[] = [];
    const values: unknown[] = [elementId, pageId];

    if (input.transformMatrix !== undefined) {
      values.push(JSON.stringify(input.transformMatrix));
      sets.push(`transform_matrix = $${values.length}`);
    }
    if (input.properties !== undefined) {
      values.push(JSON.stringify(parseProperties(current.rows[0].type, input.properties)));
      sets.push(`properties = $${values.length}`);
    }
    if (input.zIndex !== undefined) {
      values.push(input.zIndex);
      sets.push(`z_index = $${values.length}`);
    }
    if (input.isLocked !== undefined) {
      values.push(input.isLocked);
      sets.push(`is_locked = $${values.length}`);
    }
    if (input.opacity !== undefined) {
      values.push(input.opacity);
      sets.push(`opacity = $${values.length}`);
    }

    const updated = await client.query<ElementRow>(
      `UPDATE canvas_elements SET ${sets.join(', ')} WHERE id = $1 AND page_id = $2
       RETURNING id, page_id, type, z_index, transform_matrix, properties, is_locked, opacity, updated_at`,
      values,
    );

    await touchBook(client, bookId);
    return toElement(updated.rows[0]);
  });
}

export async function deleteElement(
  bookId: string,
  pageId: string,
  elementId: string,
  userId: string,
): Promise<void> {
  const { permissions } = await requireEdit(bookId, userId);

  await withTransaction(async (client) => {
    await assertPageBelongs(client, bookId, pageId);

    const current = await client.query<{ is_locked: boolean }>(
      'SELECT is_locked FROM canvas_elements WHERE id = $1 AND page_id = $2',
      [elementId, pageId],
    );
    if (!current.rows[0]) throw HttpError.notFound('Elemento no encontrado');
    if (current.rows[0].is_locked && !permissions.isManager) {
      throw HttpError.forbidden('Este elemento esta bloqueado por el docente');
    }

    await client.query('DELETE FROM canvas_elements WHERE id = $1 AND page_id = $2', [elementId, pageId]);
    await touchBook(client, bookId);
  });
}

/** Reasigna z_index de forma contigua siguiendo el orden recibido (fondo -> frente). */
export async function reorderLayers(
  bookId: string,
  pageId: string,
  userId: string,
  elementIds: string[],
): Promise<CanvasElement[]> {
  await requireEdit(bookId, userId);

  return withTransaction(async (client) => {
    await assertPageBelongs(client, bookId, pageId);

    const existing = await client.query<{ id: string }>('SELECT id FROM canvas_elements WHERE page_id = $1', [
      pageId,
    ]);
    const known = new Set(existing.rows.map((r) => r.id));

    if (elementIds.length !== known.size || elementIds.some((id) => !known.has(id))) {
      throw HttpError.badRequest('La lista debe contener exactamente todos los elementos de la página');
    }

    for (const [index, id] of elementIds.entries()) {
      await client.query('UPDATE canvas_elements SET z_index = $1 WHERE id = $2 AND page_id = $3', [
        index,
        id,
        pageId,
      ]);
    }
    await touchBook(client, bookId);

    const refreshed = await client.query<ElementRow>(
      `SELECT id, page_id, type, z_index, transform_matrix, properties, is_locked, opacity, updated_at
       FROM canvas_elements WHERE page_id = $1 ORDER BY z_index`,
      [pageId],
    );
    return refreshed.rows.map(toElement);
  });
}
