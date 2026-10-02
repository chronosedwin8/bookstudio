import { z } from 'zod';
import { createElementSchema } from '../canvas/canvas.schemas.js';

export const layoutFormat = z.enum(['portrait', 'square', 'landscape']);

export const createBookSchema = z.object({
  title: z.string().min(1).max(255).trim().default('Libro sin titulo'),
  // Sin libraryId el libro es personal: no pertenece a ninguna clase.
  libraryId: z.string().uuid().nullish(),
  layoutFormat: layoutFormat.default('square'),
  isTemplate: z.boolean().default(false),
});

/**
 * Numeracion de paginas. La pinta el navegador encima de cada hoja; aqui solo se
 * valida que lo guardado sea algo que sepa pintar. null la quita.
 */
export const pageNumberingSchema = z.object({
  /** numero: 7 · pagina: Página 7 · pag: Pág. 7 · de-total: 7 de 20 · guiones: — 7 — · romano: vii · romano-mayus: VII */
  format: z.enum(['numero', 'pagina', 'pag', 'de-total', 'guiones', 'romano', 'romano-mayus']).default('numero'),
  /** exterior-*: a la derecha en las impares y a la izquierda en las pares, como en un libro impreso. */
  position: z
    .enum([
      'abajo-centro', 'abajo-derecha', 'abajo-izquierda', 'exterior-abajo',
      'arriba-centro', 'arriba-derecha', 'arriba-izquierda', 'exterior-arriba',
    ])
    .default('abajo-centro'),
  /** Distancia al borde, en % de la hoja. */
  margin: z.number().min(0).max(20).default(4),
  fontFamily: z.string().trim().max(80).default('Lato'),
  /** En px del lienzo logico de 1000 de ancho, como el resto de textos. */
  fontSize: z.number().int().min(8).max(120).default(22),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#334155'),
  bold: z.boolean().default(false),
  /** ninguno · circulo · pastilla · linea (una raya encima) */
  decoration: z.enum(['ninguno', 'circulo', 'pastilla', 'linea']).default('ninguno'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E2E8F0'),
  /** La portada no lleva numero, como en un libro impreso. */
  skipCover: z.boolean().default(true),
  /** Numero que lleva la primera hoja numerada. */
  startAt: z.number().int().min(0).max(9999).default(2),
});

export const updateBookSchema = z
  .object({
    title: z.string().min(1).max(255).trim().optional(),
    pageNumbering: pageNumberingSchema.nullable().optional(),
    isPublished: z.boolean().optional(),
    isTemplate: z.boolean().optional(),
    publishingSettings: z
      .object({
        allowRemix: z.boolean().default(false),
        allowDownload: z.boolean().default(true),
        visibility: z.enum(['private', 'library', 'public']).default('library'),
      })
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const shareSchema = z.object({
  visibility: z.enum(['private', 'library', 'public']),
});

export const shareTokenSchema = z.object({ token: z.string().uuid('Enlace no valido') });

export const answerSchema = z.object({
  /**
   * Ids de las opciones elegidas; en las de ordenar, en el orden propuesto.
   *
   * En las preguntas abiertas llega un unico elemento con el texto redactado, de
   * ahi el limite alto: con el de 40 caracteres que valia para un id, cualquier
   * respuesta escrita se rechazaba con un 400.
   */
  answer: z.array(z.string().min(1).max(4000)).min(1).max(8),
});

export const questionParamsSchema = z.object({
  id: z.string().uuid(),
  elementId: z.string().uuid(),
});

export const sharedQuestionParamsSchema = z.object({
  token: z.string().uuid('Enlace no valido'),
  elementId: z.string().uuid(),
});

export const bookIdSchema = z.object({ id: z.string().uuid() });
export const pageParamsSchema = z.object({ id: z.string().uuid(), pageId: z.string().uuid() });
export const elementParamsSchema = pageParamsSchema.extend({ elementId: z.string().uuid() });

export const listBooksQuerySchema = z.object({
  libraryId: z.string().uuid().optional(),
  creatorId: z.string().uuid().optional(),
  isTemplate: z.enum(['true', 'false']).optional(),
  /** personal = libros fuera de clase; library = libros de una biblioteca. */
  scope: z.enum(['all', 'personal', 'library']).default('all'),
  /**
   * Interruptor de la administracion para ver los libros de todo el colegio. Solo
   * surte efecto con rol `admin`; a cualquier otra persona no le abre nada.
   */
  all: z.enum(['true', 'false']).optional(),
});

export const createPageSchema = z.object({
  afterPageNumber: z.number().int().min(0).max(999).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFFFFF'),
  backgroundPattern: z.string().max(255).nullable().default(null),
  /**
   * Contenido inicial de la pagina. Lo usan las plantillas: una sola transaccion en
   * vez de una peticion por elemento, y la pagina nunca queda a medio construir.
   */
  elements: z.array(createElementSchema).max(120).optional(),
});

export const updatePageSchema = z
  .object({
    backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    backgroundPattern: z.string().max(255).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const reorderPagesSchema = z.object({
  pageIds: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * Valoracion de un libro. La escala es la alemana: 1.0 lo mejor, 6.0 lo peor, con un
 * decimal. El paso de 0.1 se comprueba en el servidor porque el campo del navegador
 * se puede saltar.
 */
export const gradeSchema = z.object({
  title: z.string().min(2, 'Ponle un titulo, por ejemplo "Revision 1"').max(120).trim(),
  score: z.coerce
    .number()
    .min(1, 'La mejor nota es 1.0')
    .max(6, 'La peor nota es 6.0')
    // La columna es NUMERIC(2,1): un 2.55 se guardaria redondeado a 2.6 sin avisar.
    // Se compara contra el decimo mas cercano con holgura, porque 1.1 * 10 no da
    // exactamente 11 en coma flotante.
    .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9, 'Usa como mucho un decimal'),
  description: z.string().max(4000).trim().default(''),
});

export const gradeParamsSchema = bookIdSchema.extend({
  gradeId: z.string().uuid('El id de la valoracion debe ser un UUID'),
});

/**
 * Pasar un libro de "Mis libros" a una o varias bibliotecas.
 *
 * `keepPersonal` decide si es un traslado o una copia: sin el, el libro se mueve a
 * la primera biblioteca de la lista y en las demas queda una copia; con el, todas
 * son copias y el original sigue donde estaba.
 */
export const transferBookSchema = z.object({
  libraryIds: z
    .array(z.string().uuid())
    .min(1, 'Elige al menos una biblioteca')
    .max(30, 'Como mucho 30 bibliotecas de una vez')
    .transform((ids) => [...new Set(ids)]),
  keepPersonal: z.boolean().default(false),
});

export const changeFormatSchema = z.object({ layoutFormat });

/** Pegar paginas copiadas de otro libro. */
export const pastePagesSchema = z.object({
  sourceBookId: z.string().uuid(),
  pageIds: z
    .array(z.string().uuid())
    .min(1, 'No hay páginas que pegar')
    .max(100, 'Como mucho 100 páginas de una vez')
    .transform((ids) => [...new Set(ids)]),
  afterPageId: z.string().uuid().optional(),
});

export type TransferBookInput = z.infer<typeof transferBookSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
export type GradeSchemaInput = z.infer<typeof gradeSchema>;

/** Consulta del mural publico. */
export const muralQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  search: z.string().max(120).optional(),
});
