/**
 * Catalogo de planes.
 *
 * Esta es la unica fuente del precio. El navegador solo envia el identificador del
 * plan: si mandara el importe, cualquiera podria pagar un peso por el plan grande
 * cambiando el cuerpo de la peticion.
 *
 * Los importes van en pesos colombianos enteros; el COP no usa decimales.
 */
export type PlanId = 'individual' | 'escuela' | 'institucional';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Importe anual que se cobra de una vez. */
  amountCop: number;
  /** Solo para mostrarlo; el cobro es el anual. */
  monthlyCop: number | null;
  summary: string;
  /** null = sin limite. */
  maxTeachers: number | null;
  maxStudents: number | null;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  individual: {
    id: 'individual',
    name: 'Individual',
    amountCop: 1_800_000,
    monthlyCop: 150_000,
    summary: 'Para un docente o un profesional que trabaja por su cuenta.',
    maxTeachers: 1,
    // No se anuncia limite de estudiantes, asi que no se impone ninguno.
    maxStudents: null,
  },
  escuela: {
    id: 'escuela',
    name: 'Escuela',
    amountCop: 5_000_000,
    monthlyCop: null,
    summary: 'Hasta 5 profesores y 500 estudiantes.',
    maxTeachers: 5,
    maxStudents: 500,
  },
  institucional: {
    id: 'institucional',
    name: 'Institucional y empresas',
    amountCop: 20_000_000,
    monthlyCop: null,
    summary: 'Usuarios ilimitados.',
    maxTeachers: null,
    maxStudents: null,
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS;
}

/** Un ano natural desde la fecha dada; es el periodo de todos los planes. */
export function addOneYear(from: Date): Date {
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 1);
  return to;
}
