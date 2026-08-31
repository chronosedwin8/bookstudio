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

export const updateBookSchema = z
  .object({
    title: z.string().min(1).max(255).trim().optional(),
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
  /** Ids de las opciones elegidas; en las de ordenar, en el orden propuesto. */
  answer: z.array(z.string().min(1).max(40)).min(1).max(8),
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

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
export type GradeSchemaInput = z.infer<typeof gradeSchema>;
