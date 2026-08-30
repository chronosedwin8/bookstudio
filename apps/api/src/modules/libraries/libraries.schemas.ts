import { z } from 'zod';

export const createLibrarySchema = z.object({
  name: z.string().min(2).max(100).trim(),
  studentBookLimit: z.number().int().min(1).max(500).default(40),
  studentEditable: z.boolean().default(true),
  studentPublishable: z.boolean().default(false),
  commentsEnabled: z.boolean().default(true),
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

export type CreateLibraryInput = z.infer<typeof createLibrarySchema>;
export type UpdateLibraryInput = z.infer<typeof updateLibrarySchema>;
export type ClassViewQuery = z.infer<typeof classViewQuerySchema>;
