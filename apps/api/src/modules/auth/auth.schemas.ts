import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email invalido').max(255).toLowerCase().trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  fullName: z.string().min(2).max(100).trim(),
  role: z.enum(['teacher', 'student', 'admin']).default('teacher'),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalido').toLowerCase().trim(),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const qrLoginSchema = z.object({
  token: z.string().min(10, 'Token QR invalido'),
});

export const createStudentSchema = z.object({
  fullName: z.string().min(2).max(100).trim(),
  libraryId: z.string().uuid('libraryId debe ser un UUID'),
});

/** La actual es opcional: quien entra con QR no tiene ninguna todavia. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type QrLoginInput = z.infer<typeof qrLoginSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
