import { z } from 'zod';

export const createLibrarySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  studentBookLimit: z.number().int().min(1).max(500).default(40),
  studentEditable: z.boolean().default(true),
  studentPublishable: z.boolean().default(false),
  commentsEnabled: z.boolean().default(true),
  studentsSeePeers: z.boolean().default(true),
});

export const updateLibrarySchema = createLibrarySchema.partial();

export const libraryIdSchema = z.object({
  id: z.string().uuid('El id de biblioteca debe ser un UUID'),
});

export const joinLibrarySchema = z.object({
  codeInvite: z.string().length(5, 'El codigo debe tener 5 caracteres').toUpperCase().trim(),
});

export const addTeacherSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const classViewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

/**
 * Busqueda de alumnado para sumarlo a la biblioteca.
 *
 * Se exigen dos caracteres: sin minimo, una peticion vacia devolveria el listado de
 * todo el alumnado del centro, que no es lo que hace falta para anadir a alguien
 * concreto.
 */
export const studentSearchSchema = z.object({
  q: z.string().trim().min(2, 'Escribe al menos dos letras').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const addStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'Elige al menos un alumno').max(200),
});

/**
 * Entrega de material: una pagina suelta o el libro entero, a quien se elija.
 *
 * Sin `studentIds` va a toda la biblioteca; es el caso habitual y evita tener que
 * marcar treinta casillas.
 */
export const distributeSchema = z.object({
  sourceBookId: z.string().uuid(),
  pageId: z.string().uuid().optional(),
  studentIds: z.array(z.string().uuid()).max(500).optional(),
  title: z.string().min(1).max(255).trim().optional(),
});

export type CreateLibraryInput = z.infer<typeof createLibrarySchema>;
export type UpdateLibraryInput = z.infer<typeof updateLibrarySchema>;
export type ClassViewQuery = z.infer<typeof classViewQuerySchema>;
export type StudentSearchQuery = z.infer<typeof studentSearchSchema>;
export type AddStudentsInput = z.infer<typeof addStudentsSchema>;
export type DistributeInput = z.infer<typeof distributeSchema>;
