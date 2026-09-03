import { z } from 'zod';

/**
 * Gestion de clientes.
 *
 * Los importes van en pesos colombianos enteros, como en el resto de facturacion:
 * el COP no usa decimales y guardarlo en coma flotante acaba produciendo
 * diferencias de centavos.
 */

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del cliente es obligatorio').max(160),
  legalName: z.string().trim().max(200).nullish(),
  taxId: z.string().trim().max(40).nullish(),
  contactName: z.string().trim().max(120).nullish(),
  contactEmail: z.string().trim().email('El correo de contacto no es valido').max(255).nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(240).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().max(2000).default(''),
});

/** Lo que el propio cliente puede corregir de sus datos: no su nombre ni sus notas. */
export const billingDataSchema = z
  .object({
    legalName: z.string().trim().max(200).nullish(),
    taxId: z.string().trim().max(40).nullish(),
    contactName: z.string().trim().max(120).nullish(),
    contactEmail: z.string().trim().email('El correo de contacto no es valido').max(255).nullish(),
    contactPhone: z.string().trim().max(40).nullish(),
    address: z.string().trim().max(240).nullish(),
    city: z.string().trim().max(120).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const chargeItemSchema = z.object({
  description: z.string().trim().min(2, 'Cada linea necesita un concepto').max(200),
  quantity: z.number().int().min(1).max(9999).default(1),
  unitCop: z.number().int().min(1, 'El importe debe ser mayor que cero').max(2_000_000_000),
});

export const createChargeSchema = z.object({
  concept: z.string().trim().min(3, 'Escribe de que es la cuenta de cobro').max(200),
  items: z.array(chargeItemSchema).min(1, 'Anade al menos una linea').max(30),
  /** Fecha limite de pago; sin ella, la cuenta no vence. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')
    .nullish(),
  subscriptionId: z.string().uuid().nullish(),
  notes: z.string().max(2000).default(''),
  /** Emitirla ya, en lugar de dejarla en borrador. */
  issue: z.boolean().default(false),
});

export const updateChargeSchema = z
  .object({
    status: z.enum(['emitida', 'anulada']).optional(),
    notes: z.string().max(2000).optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe ser AAAA-MM-DD')
      .nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

/**
 * Alta de un docente por parte del cliente.
 *
 * Sin contrasena: la genera el servidor y se le muestra una sola vez a quien la
 * crea, igual que al anadir alumnado. Que el cliente elija la clave de otra
 * persona invita a poner la misma para todo el claustro.
 */
export const createTeacherSchema = z.object({
  fullName: z.string().trim().min(2, 'El nombre es obligatorio').max(100),
  email: z.string().trim().email('El correo no es valido').max(255),
});

export const updateTeacherSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const payChargeSchema = z.object({
  token: z.string().max(200).optional(),
  paymentMethodId: z.string().min(1).max(40),
  installments: z.number().int().min(1).max(36).default(1),
  payerEmail: z.string().trim().email('El correo del pagador no es valido').max(255),
  payerDocType: z.string().max(10).optional(),
  payerDocNumber: z.string().max(30).optional(),
});

export const orgParamsSchema = z.object({ id: z.string().uuid('Cliente no valido') });
export const chargeParamsSchema = z.object({ id: z.string().uuid('Cuenta de cobro no valida') });
export const teacherParamsSchema = z.object({ id: z.string().uuid('Cuenta no valida') });
export const linkOwnerSchema = z.object({ email: z.string().trim().email('El correo no es valido').max(255) });

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type BillingDataInput = z.infer<typeof billingDataSchema>;
export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type PayChargeInput = z.infer<typeof payChargeSchema>;
export type ChargeItem = z.infer<typeof chargeItemSchema>;
