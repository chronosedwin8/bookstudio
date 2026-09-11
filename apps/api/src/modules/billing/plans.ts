import { query } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Catalogo de planes.
 *
 * Esta sigue siendo la unica fuente del precio: el navegador solo envia el
 * identificador del plan. Si mandara el importe, cualquiera podria pagar un peso
 * por el plan grande cambiando el cuerpo de la peticion.
 *
 * Lo que ha cambiado es de donde sale: antes era una constante en el codigo y
 * ahora una tabla, para que se pueda cambiar un precio sin volver a desplegar.
 * Que este en la base no lo hace menos seguro: el navegador no escribe ahi, solo
 * lo hace la administracion.
 *
 * Los importes van en pesos colombianos enteros; el COP no usa decimales.
 */
export type PlanId = string;

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Importe que se cobra de una vez, por todo el periodo. */
  amountCop: number;
  /** Solo para mostrarlo; el cobro es `amountCop`. */
  monthlyCop: number | null;
  /** Cuanto dura la licencia: 12 en los anuales, 1 en el mensual. */
  periodMonths: number;
  summary: string;
  /** null = sin limite. */
  maxTeachers: number | null;
  maxStudents: number | null;
  /** Un plan retirado no se ofrece, pero sigue existiendo para las licencias vendidas. */
  visible: boolean;
  sortOrder: number;
}

interface PlanRow {
  id: string;
  name: string;
  summary: string;
  amount_cop: string;
  monthly_cop: string | null;
  period_months: number;
  max_teachers: number | null;
  max_students: number | null;
  visible: boolean;
  sort_order: number;
}

const aPlan = (row: PlanRow): PlanDefinition => ({
  id: row.id,
  name: row.name,
  summary: row.summary,
  amountCop: Number(row.amount_cop),
  monthlyCop: row.monthly_cop === null ? null : Number(row.monthly_cop),
  periodMonths: row.period_months,
  maxTeachers: row.max_teachers,
  maxStudents: row.max_students,
  visible: row.visible,
  sortOrder: row.sort_order,
});

const COLUMNAS = `id, name, summary, amount_cop, monthly_cop, period_months,
                  max_teachers, max_students, visible, sort_order`;

/**
 * Cache muy corta.
 *
 * El catalogo se consulta en cada carga de la portada y casi nunca cambia, pero
 * un precio recien cambiado tiene que verse enseguida: treinta segundos es el
 * equilibrio entre no castigar la base y no dejar a nadie mirando un precio viejo.
 */
const CACHE_MS = 30_000;
let cache: { at: number; planes: PlanDefinition[] } | null = null;

export function invalidarCachePlanes(): void {
  cache = null;
}

/** Todos los planes, incluidos los retirados. */
export async function listPlans(): Promise<PlanDefinition[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.planes;

  const { rows } = await query<PlanRow>(
    `SELECT ${COLUMNAS} FROM plans ORDER BY sort_order, amount_cop`,
  );
  const planes = rows.map(aPlan);
  cache = { at: Date.now(), planes };
  return planes;
}

/** Los que se ofrecen: es lo que ve quien visita la pagina. */
export async function listVisiblePlans(): Promise<PlanDefinition[]> {
  return (await listPlans()).filter((p) => p.visible);
}

export async function getPlan(id: string): Promise<PlanDefinition | null> {
  return (await listPlans()).find((p) => p.id === id) ?? null;
}

/**
 * El plan con el que se va a cobrar.
 *
 * Se exige que este visible: contratar un plan retirado por su identificador
 * seria una forma de comprar a un precio que ya no se ofrece.
 */
export async function getPlanParaContratar(id: string): Promise<PlanDefinition> {
  const plan = await getPlan(id);
  if (!plan) throw HttpError.badRequest('Plan desconocido');
  if (!plan.visible) throw HttpError.badRequest('Ese plan ya no esta disponible');
  return plan;
}

/**
 * Nombre del plan para mostrarlo, tomado de la cache.
 *
 * Es sincrono a proposito: se usa dentro de funciones que convierten filas en
 * objetos y hacerlas asincronas por un texto no compensa. Si la cache aun no se
 * ha llenado devuelve el identificador, que es exactamente lo que hacia antes
 * con un plan desconocido. Aqui NUNCA se decide dinero: para eso esta
 * `getPlanParaContratar`, que si consulta la base.
 */
export function nombrePlan(id: string): string {
  return cache?.planes.find((p) => p.id === id)?.name ?? id;
}

/** Se llama al arrancar para que los nombres esten disponibles desde el primer momento. */
export async function precalentarPlanes(): Promise<void> {
  try {
    await listPlans();
  } catch {
    // Sin base de datos ya hay problemas mayores que el nombre de un plan
  }
}

// ---------------------------------------------------------------- editar

export interface CambioPlan {
  name?: string;
  summary?: string;
  amountCop?: number;
  monthlyCop?: number | null;
  periodMonths?: number;
  maxTeachers?: number | null;
  maxStudents?: number | null;
  visible?: boolean;
  sortOrder?: number;
}

/** Cambia un plan. Solo la administracion llega hasta aqui. */
export async function updatePlan(id: string, cambio: CambioPlan, adminId: string): Promise<PlanDefinition> {
  const actual = await getPlan(id);
  if (!actual) throw HttpError.notFound('Ese plan no existe');

  const campos: Array<[string, unknown]> = [];
  if (cambio.name !== undefined) campos.push(['name', cambio.name]);
  if (cambio.summary !== undefined) campos.push(['summary', cambio.summary]);
  if (cambio.amountCop !== undefined) campos.push(['amount_cop', cambio.amountCop]);
  if (cambio.monthlyCop !== undefined) campos.push(['monthly_cop', cambio.monthlyCop]);
  if (cambio.periodMonths !== undefined) campos.push(['period_months', cambio.periodMonths]);
  if (cambio.maxTeachers !== undefined) campos.push(['max_teachers', cambio.maxTeachers]);
  if (cambio.maxStudents !== undefined) campos.push(['max_students', cambio.maxStudents]);
  if (cambio.visible !== undefined) campos.push(['visible', cambio.visible]);
  if (cambio.sortOrder !== undefined) campos.push(['sort_order', cambio.sortOrder]);

  if (!campos.length) return actual;

  const sets = campos.map(([col], i) => `${col} = $${i + 3}`);
  const { rows } = await query<PlanRow>(
    `UPDATE plans
        SET ${sets.join(', ')}, updated_at = NOW(), updated_by = $2
      WHERE id = $1
      RETURNING ${COLUMNAS}`,
    [id, adminId, ...campos.map(([, valor]) => valor)],
  );

  invalidarCachePlanes();
  return aPlan(rows[0]);
}

// ---------------------------------------------------------------- periodos

/**
 * Hasta cuando vale una licencia.
 *
 * Antes siempre era un ano porque todos los planes eran anuales. Con el plan
 * mensual hace falta contar meses, y `setMonth` ya resuelve el caso incomodo:
 * del 31 de enero mas un mes sale el 3 de marzo, que es lo que hace todo el
 * mundo y lo que la gente espera de una factura.
 */
export function addMonths(from: Date, months: number): Date {
  const to = new Date(from);
  to.setMonth(to.getMonth() + months);
  return to;
}

/** Un ano natural; se conserva porque hay codigo que la usa para renovaciones. */
export function addOneYear(from: Date): Date {
  return addMonths(from, 12);
}
