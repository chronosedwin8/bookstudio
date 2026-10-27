import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Identificador no válido');

/**
 * Ubicacion de las herramientas del editor.
 *
 * El servidor no conoce el catalogo de herramientas (son botones del editor):
 * comprueba la forma y los limites, y el editor descarta lo que no reconozca.
 */
export const toolbarSchema = z
  .object({
    categories: z
      .array(
        z.object({
          id: slug,
          label: z.string().trim().min(1, 'Cada categoría necesita un nombre').max(40),
          icon: z.string().trim().max(12).default(''),
          tools: z.array(slug).max(80),
        }),
      )
      .min(1, 'Hace falta al menos una categoría')
      .max(30),
    openByDefault: slug.nullable().default(null),
  })
  .refine((v) => new Set(v.categories.map((c) => c.id)).size === v.categories.length, {
    message: 'Hay dos categorías con el mismo identificador',
    path: ['categories'],
  });

export type ToolbarInput = z.infer<typeof toolbarSchema>;
