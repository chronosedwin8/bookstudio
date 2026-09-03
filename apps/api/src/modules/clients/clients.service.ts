import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { PLANS, type PlanId } from '../billing/plans.js';
import * as mp from '../billing/mercadopago.service.js';
import type {
  BillingDataInput,
  GrantPlanInput,
  ChargeItem,
  CreateChargeInput,
  CreateTeacherInput,
  OrganizationInput,
  PayChargeInput,
  UpdateChargeInput,
  UpdateTeacherInput,
} from './clients.schemas.js';

/**
 * Gestion de clientes.
 *
 * En los planes Escuela e Institucional quien paga no da clase: contrata, reparte
 * las cuentas de su claustro y lleva los pagos. Esa persona es el "dueno" de una
 * organizacion y es la unica que ve el portal, junto con la administracion de
 * BookStudio.
 *
 * Lo que aqui se llama cuenta de cobro no es una factura fiscal colombiana: el
 * servicio se presta como comercio internacional y no esta sujeto a la
 * facturacion electronica de Colombia. Es el documento con el que se gestiona el
 * pago, y el propio documento lo dice para que nadie lo confunda.
 */

const SALT_ROUNDS = 12;
/** Estados de Mercado Pago que dan por cobrada una cuenta. */
const APROBADO = new Set(['approved', 'authorized']);

// --- Organizacion ---

export interface Organization {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  ownerId: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  city: string | null;
  notes: string;
  createdAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  owner_id: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  notes: string;
  created_at: Date;
}

const ORG_COLUMNS = `o.id, o.name, o.legal_name, o.tax_id, o.owner_id, o.contact_name,
  o.contact_email, o.contact_phone, o.address, o.city, o.notes, o.created_at`;

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    taxId: row.tax_id,
    ownerId: row.owner_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    address: row.address,
    city: row.city,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    ...(row.owner_name !== undefined ? { ownerName: row.owner_name } : {}),
    ...(row.owner_email !== undefined ? { ownerEmail: row.owner_email } : {}),
  };
}

// --- Cuentas de cobro ---

export interface Charge {
  id: string;
  number: number;
  organizationId: string;
  organizationName?: string;
  subscriptionId: string | null;
  concept: string;
  items: ChargeItem[];
  amountCop: number;
  status: 'borrador' | 'emitida' | 'pagada' | 'anulada';
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  notes: string;
  createdAt: string;
  /** Dias que faltan para el vencimiento; negativo si ya vencio. */
  daysLeft?: number | null;
}

interface ChargeRow {
  id: string;
  number: string;
  organization_id: string;
  organization_name?: string;
  subscription_id: string | null;
  concept: string;
  items: ChargeItem[] | null;
  amount_cop: string;
  status: Charge['status'];
  due_date: Date | null;
  issued_at: Date | null;
  paid_at: Date | null;
  notes: string;
  created_at: Date;
}

const CHARGE_COLUMNS = `c.id, c.number, c.organization_id, c.subscription_id, c.concept,
  c.items, c.amount_cop, c.status, c.due_date, c.issued_at, c.paid_at, c.notes, c.created_at`;

/** Fecha en AAAA-MM-DD, sin hora: due_date es un DATE y no tiene zona. */
function soloFecha(valor: Date | null): string | null {
  if (!valor) return null;
  return valor.toISOString().slice(0, 10);
}

function toCharge(row: ChargeRow): Charge {
  const vence = soloFecha(row.due_date);
  return {
    id: row.id,
    number: Number(row.number),
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    concept: row.concept,
    items: Array.isArray(row.items) ? row.items : [],
    amountCop: Number(row.amount_cop),
    status: row.status,
    dueDate: vence,
    issuedAt: row.issued_at?.toISOString() ?? null,
    paidAt: row.paid_at?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    ...(row.organization_name !== undefined ? { organizationName: row.organization_name } : {}),
    daysLeft:
      vence && row.status === 'emitida'
        ? Math.ceil((new Date(`${vence}T23:59:59Z`).getTime() - Date.now()) / 86_400_000)
        : null,
  };
}

/** El total lo calcula el servidor: si viniera del navegador se podria cobrar un peso. */
export function totalDe(items: ChargeItem[]): number {
  return items.reduce((suma, linea) => suma + linea.quantity * linea.unitCop, 0);
}

// --- Acceso ---

/** La organizacion que esta persona paga. Es la puerta del portal de cliente. */
async function organizacionPropia(userId: string): Promise<OrganizationRow> {
  const { rows } = await query<OrganizationRow>(
    `SELECT ${ORG_COLUMNS} FROM organizations o WHERE o.owner_id = $1 ORDER BY o.created_at LIMIT 1`,
    [userId],
  );
  if (!rows[0]) {
    throw HttpError.notFound('No hay ninguna cuenta de cliente asociada a este usuario');
  }
  return rows[0];
}

/**
 * Resuelve la organizacion sobre la que se va a operar.
 *
 * La administracion de BookStudio puede entrar en la de cualquier cliente pasando
 * su id; el resto solo alcanza la suya. Sin esta distincion, un cliente podria
 * mirar el equipo y los cobros de otro cambiando un id en la direccion.
 */
async function resolver(userId: string, role: string, organizationId?: string): Promise<OrganizationRow> {
  if (!organizationId) return organizacionPropia(userId);

  if (role === 'admin') {
    const { rows } = await query<OrganizationRow>(`SELECT ${ORG_COLUMNS} FROM organizations o WHERE o.id = $1`, [
      organizationId,
    ]);
    if (!rows[0]) throw HttpError.notFound('Cliente no encontrado');
    return rows[0];
  }

  const propia = await organizacionPropia(userId);
  if (propia.id !== organizationId) throw HttpError.notFound('Cliente no encontrado');
  return propia;
}

// --- Portal del cliente ---

export interface Usage {
  teachers: number;
  maxTeachers: number | null;
  students: number;
  maxStudents: number | null;
}

export interface PortalSubscription {
  id: string;
  plan: PlanId;
  planName: string;
  status: string;
  amountCop: number;
  autoRenew: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
}

export interface Portal {
  organization: Organization;
  subscriptions: PortalSubscription[];
  usage: Usage;
  charges: Charge[];
  payments: PortalPayment[];
  /** Suma de lo emitido y aun sin pagar. */
  pendingCop: number;
  /** Suma de todo lo cobrado, historico. */
  paidCop: number;
}

export interface PortalPayment {
  id: string;
  invoiceNumber: number;
  amountCop: number;
  status: string;
  statusDetail: string | null;
  paymentMethod: string | null;
  installments: number | null;
  paidAt: string | null;
  createdAt: string;
  /** A que cuenta de cobro corresponde, si viene de una. */
  chargeNumber: number | null;
  concept: string | null;
}

export async function getPortal(userId: string, role: string, organizationId?: string): Promise<Portal> {
  const org = await resolver(userId, role, organizationId);

  const { rows: suscripciones } = await query<{
    id: string;
    plan: PlanId;
    status: string;
    amount_cop: string;
    auto_renew: boolean;
    max_teachers: number | null;
    max_students: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
  }>(
    `SELECT id, plan, status, amount_cop, auto_renew, max_teachers, max_students, starts_at, expires_at
     FROM subscriptions
     WHERE organization_id = $1 OR owner_id = $2
     ORDER BY created_at DESC`,
    [org.id, org.owner_id],
  );

  const dias = (hasta: Date | null) =>
    hasta ? Math.ceil((hasta.getTime() - Date.now()) / 86_400_000) : null;

  // Los limites que cuentan son los de la licencia vigente; una vencida no da cupo.
  const vigente = suscripciones.find((s) => s.status === 'activa') ?? suscripciones[0];

  const { rows: equipo } = await query<{ total: string }>(
    // Solo cuentan los docentes: la administracion de la plataforma no ocupa una
    // plaza que el cliente haya pagado.
    `SELECT COUNT(*) AS total FROM users
     WHERE organization_id = $1 AND role = 'teacher' AND is_active`,
    [org.id],
  );

  /**
   * Alumnado del cliente: el que esta en bibliotecas de sus docentes.
   *
   * Se cuenta asi, y no por una columna en cada alumno, para no tener que tocar los
   * tres sitios que crean cuentas de alumnado. DISTINCT porque un alumno puede
   * estar en varias bibliotecas y seria un solo cupo.
   */
  const { rows: alumnado } = await query<{ total: string }>(
    `SELECT COUNT(DISTINCT ls.student_id) AS total
     FROM library_students ls
     JOIN libraries l ON l.id = ls.library_id
     JOIN users duenio ON duenio.id = l.owner_id
     WHERE duenio.organization_id = $1`,
    [org.id],
  );

  const { rows: cobros } = await query<ChargeRow>(
    `SELECT ${CHARGE_COLUMNS} FROM charges c
     WHERE c.organization_id = $1
       ${role === 'admin' ? '' : "AND c.status <> 'borrador'"}
     ORDER BY c.created_at DESC LIMIT 100`,
    [org.id],
  );

  const { rows: pagos } = await query<{
    id: string;
    invoice_number: string;
    amount_cop: string;
    status: string;
    status_detail: string | null;
    payment_method: string | null;
    installments: number | null;
    paid_at: Date | null;
    created_at: Date;
    charge_number: string | null;
    concept: string | null;
  }>(
    `SELECT p.id, p.invoice_number, p.amount_cop, p.status, p.status_detail, p.payment_method,
            p.installments, p.paid_at, p.created_at, c.number AS charge_number, c.concept
     FROM payments p
     LEFT JOIN charges c ON c.id = p.charge_id
     WHERE p.owner_id = $1 OR c.organization_id = $2
     ORDER BY p.created_at DESC LIMIT 100`,
    [org.owner_id, org.id],
  );

  const charges = cobros.map(toCharge);

  return {
    organization: toOrganization(org),
    subscriptions: suscripciones.map((s) => ({
      id: s.id,
      plan: s.plan,
      planName: PLANS[s.plan]?.name ?? s.plan,
      status: s.status,
      amountCop: Number(s.amount_cop),
      autoRenew: s.auto_renew,
      startsAt: s.starts_at?.toISOString() ?? null,
      expiresAt: s.expires_at?.toISOString() ?? null,
      daysLeft: dias(s.expires_at),
    })),
    usage: {
      teachers: Number(equipo[0].total),
      maxTeachers: vigente?.max_teachers ?? null,
      students: Number(alumnado[0].total),
      maxStudents: vigente?.max_students ?? null,
    },
    charges,
    payments: pagos.map((p) => ({
      id: p.id,
      invoiceNumber: Number(p.invoice_number),
      amountCop: Number(p.amount_cop),
      status: p.status,
      statusDetail: p.status_detail,
      paymentMethod: p.payment_method,
      installments: p.installments,
      paidAt: p.paid_at?.toISOString() ?? null,
      createdAt: p.created_at.toISOString(),
      chargeNumber: p.charge_number === null ? null : Number(p.charge_number),
      concept: p.concept,
    })),
    pendingCop: charges.filter((c) => c.status === 'emitida').reduce((s, c) => s + c.amountCop, 0),
    paidCop: pagos
      .filter((p) => APROBADO.has(p.status))
      .reduce((s, p) => s + Number(p.amount_cop), 0),
  };
}

/** Datos de facturacion. El cliente corrige los suyos sin pasar por soporte. */
export async function updateBillingData(
  userId: string,
  role: string,
  input: BillingDataInput,
  organizationId?: string,
): Promise<Organization> {
  const org = await resolver(userId, role, organizationId);

  const campos: Record<string, unknown> = {
    legal_name: input.legalName,
    tax_id: input.taxId,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    address: input.address,
    city: input.city,
  };
  const entradas = Object.entries(campos).filter(([, valor]) => valor !== undefined);
  if (!entradas.length) throw HttpError.badRequest('No hay campos para actualizar');

  const asignaciones = entradas.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const { rows } = await query<OrganizationRow>(
    `UPDATE organizations SET ${asignaciones} WHERE id = $1
     RETURNING id, name, legal_name, tax_id, owner_id, contact_name, contact_email,
               contact_phone, address, city, notes, created_at`,
    [org.id, ...entradas.map(([, valor]) => valor)],
  );
  return toOrganization(rows[0]);
}

// --- Equipo docente ---

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: 'teacher' | 'admin';
  isActive: boolean;
  passwordIsDefault: boolean;
  libraries: number;
  createdAt: string;
}

export async function listTeam(userId: string, role: string, organizationId?: string): Promise<TeamMember[]> {
  const org = await resolver(userId, role, organizationId);

  const { rows } = await query<{
    id: string;
    full_name: string;
    email: string;
    role: 'teacher' | 'admin';
    is_active: boolean;
    password_is_default: boolean;
    libraries: string;
    created_at: Date;
  }>(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.password_is_default,
            (SELECT COUNT(*) FROM libraries l WHERE l.owner_id = u.id) AS libraries,
            u.created_at
     FROM users u
     WHERE u.organization_id = $1 AND u.role IN ('teacher', 'admin')
     ORDER BY u.is_active DESC, u.full_name`,
    [org.id],
  );

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    passwordIsDefault: r.password_is_default,
    libraries: Number(r.libraries),
    createdAt: r.created_at.toISOString(),
  }));
}

export interface TeacherCreated {
  member: TeamMember;
  /** Se muestra una sola vez: no se puede volver a consultar. */
  password: string;
}

/**
 * Alta de un docente del cliente.
 *
 * Respeta el cupo del plan. Los limites ya se guardaban en la licencia desde el
 * principio, pero no se aplicaban en ningun sitio: un plan Escuela de cinco
 * docentes admitia cincuenta. Aqui si se comprueban, porque es justo lo que el
 * cliente esta comprando.
 */
export async function createTeacher(
  userId: string,
  role: string,
  input: CreateTeacherInput,
  organizationId?: string,
): Promise<TeacherCreated> {
  const org = await resolver(userId, role, organizationId);
  const email = input.email.toLowerCase();

  const { usage } = await getPortal(userId, role, organizationId);
  if (usage.maxTeachers !== null && usage.teachers >= usage.maxTeachers) {
    throw HttpError.badRequest(
      `El plan incluye ${usage.maxTeachers} docentes y ya estan todos ocupados. ` +
        'Desactiva una cuenta que no se use o amplia el plan.',
    );
  }

  const { rows: existente } = await query<{ id: string; organization_id: string | null; role: string }>(
    'SELECT id, organization_id, role FROM users WHERE email = $1',
    [email],
  );
  if (existente[0]) {
    // Reclamar una cuenta ajena dejaria a esa persona dentro de otro cliente.
    throw HttpError.conflict('Ya existe una cuenta con ese correo');
  }

  // La genera el servidor: si la eligiera el cliente, acabaria siendo la misma para
  // todo el claustro. Se entrega una vez y cada docente la cambia al entrar.
  const password = randomBytes(6).toString('base64url').replace(/[-_]/g, '');
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const { rows } = await query<{ id: string; full_name: string; email: string; created_at: Date }>(
    `INSERT INTO users (email, password_hash, full_name, role, organization_id, password_is_default)
     VALUES ($1, $2, $3, 'teacher', $4, TRUE)
     RETURNING id, full_name, email, created_at`,
    [email, hash, input.fullName, org.id],
  );

  return {
    member: {
      id: rows[0].id,
      fullName: rows[0].full_name,
      email: rows[0].email,
      role: 'teacher',
      isActive: true,
      passwordIsDefault: true,
      libraries: 0,
      createdAt: rows[0].created_at.toISOString(),
    },
    password,
  };
}

/** Comprueba que esa cuenta es del equipo de este cliente antes de tocarla. */
async function docenteDelCliente(orgId: string, teacherId: string): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND role IN ('teacher', 'admin')`,
    [teacherId, orgId],
  );
  if (!rows[0]) throw HttpError.notFound('Esa cuenta no pertenece a este cliente');
}

export async function updateTeacher(
  userId: string,
  role: string,
  teacherId: string,
  input: UpdateTeacherInput,
  organizationId?: string,
): Promise<TeamMember> {
  const org = await resolver(userId, role, organizationId);
  await docenteDelCliente(org.id, teacherId);

  // Reactivar tambien ocupa cupo: si no, desactivar y volver a activar lo saltaria.
  if (input.isActive === true) {
    const { usage } = await getPortal(userId, role, organizationId);
    const { rows } = await query<{ is_active: boolean }>('SELECT is_active FROM users WHERE id = $1', [teacherId]);
    if (!rows[0].is_active && usage.maxTeachers !== null && usage.teachers >= usage.maxTeachers) {
      throw HttpError.badRequest(`El plan incluye ${usage.maxTeachers} docentes y ya estan todos ocupados.`);
    }
  }

  const campos: Record<string, unknown> = { full_name: input.fullName, is_active: input.isActive };
  const entradas = Object.entries(campos).filter(([, valor]) => valor !== undefined);
  const asignaciones = entradas.map(([col], i) => `${col} = $${i + 2}`).join(', ');

  await query(`UPDATE users SET ${asignaciones} WHERE id = $1`, [
    teacherId,
    ...entradas.map(([, valor]) => valor),
  ]);

  const equipo = await listTeam(userId, role, organizationId);
  return equipo.find((m) => m.id === teacherId)!;
}

/**
 * Saca a un docente del cliente.
 *
 * NO borra la cuenta ni su contenido: los libros de sus clases son trabajo del
 * alumnado. Se desliga del cliente y se desactiva, con lo que libera cupo. El
 * borrado de verdad, con todo lo que hizo, sigue estando solo en administracion.
 */
export async function removeTeacher(
  userId: string,
  role: string,
  teacherId: string,
  organizationId?: string,
): Promise<{ freedSeat: boolean }> {
  const org = await resolver(userId, role, organizationId);
  await docenteDelCliente(org.id, teacherId);

  if (org.owner_id === teacherId) {
    throw HttpError.badRequest('No se puede sacar del equipo a quien figura como titular de la cuenta');
  }

  await query('UPDATE users SET organization_id = NULL, is_active = FALSE WHERE id = $1', [teacherId]);
  return { freedSeat: true };
}

// --- Cuentas de cobro ---

export async function getCharge(userId: string, role: string, chargeId: string): Promise<Charge> {
  const { rows } = await query<ChargeRow & { organization_name: string }>(
    `SELECT ${CHARGE_COLUMNS}, o.name AS organization_name
     FROM charges c JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = $1`,
    [chargeId],
  );
  const fila = rows[0];
  if (!fila) throw HttpError.notFound('Cuenta de cobro no encontrada');

  // Se comprueba el acceso a su organizacion, no al documento: asi un cliente no
  // puede leer los cobros de otro probando identificadores.
  const org = await resolver(userId, role, fila.organization_id);
  if (org.id !== fila.organization_id) throw HttpError.notFound('Cuenta de cobro no encontrada');
  // Un borrador es papel de trabajo de la administracion.
  if (fila.status === 'borrador' && role !== 'admin') {
    throw HttpError.notFound('Cuenta de cobro no encontrada');
  }

  return toCharge(fila);
}

export interface PayResult {
  charge: Charge;
  payment: { status: string; statusDetail: string; invoiceNumber: number | null };
}

/**
 * Paga una cuenta de cobro con Mercado Pago.
 *
 * El importe sale de la base de datos, nunca del navegador. Si viniera en la
 * peticion, cualquiera podria liquidar cinco millones con un peso.
 */
export async function payCharge(
  userId: string,
  role: string,
  chargeId: string,
  input: PayChargeInput,
): Promise<PayResult> {
  if (!mp.isBillingEnabled()) throw HttpError.badRequest('Los pagos no estan configurados');

  const charge = await getCharge(userId, role, chargeId);
  if (charge.status === 'pagada') throw HttpError.badRequest('Esta cuenta ya esta pagada');
  if (charge.status === 'anulada') throw HttpError.badRequest('Esta cuenta esta anulada');
  if (charge.status === 'borrador') throw HttpError.badRequest('Esta cuenta aun no se ha emitido');

  const { rows: duenio } = await query<{ owner_id: string | null }>(
    'SELECT owner_id FROM organizations WHERE id = $1',
    [charge.organizationId],
  );

  const payment = await mp.createPayment({
    token: input.token,
    paymentMethodId: input.paymentMethodId,
    amountCop: charge.amountCop,
    description: `BookStudio · Cuenta de cobro ${charge.number}`,
    installments: input.installments,
    payerEmail: input.payerEmail,
    payerDocType: input.payerDocType,
    payerDocNumber: input.payerDocNumber,
    externalReference: mp.newExternalReference(`bs-cobro-${charge.number}`),
    metadata: { chargeId: charge.id, organizationId: charge.organizationId },
  });

  const aprobado = APROBADO.has(payment.status);

  const { invoiceNumber, actualizada } = await withTransaction(async (client) => {
    const factura = await client.query<{ invoice_number: string }>(
      `INSERT INTO payments
         (subscription_id, owner_id, charge_id, mp_payment_id, amount_cop, status,
          status_detail, payment_method, installments, payer_email, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING invoice_number`,
      [
        charge.subscriptionId,
        duenio[0]?.owner_id ?? null,
        charge.id,
        String(payment.id),
        charge.amountCop,
        payment.status,
        payment.status_detail,
        payment.payment_method_id ?? null,
        payment.installments ?? null,
        payment.payer?.email ?? input.payerEmail,
        payment.date_approved ?? null,
      ],
    );

    // Solo se da por pagada si el cobro se aprobo. Con PSE o Efecty llega mas
    // tarde, y de eso se encarga el aviso de Mercado Pago.
    const cobro = aprobado
      ? await client.query<ChargeRow>(
          `UPDATE charges SET status = 'pagada', paid_at = CURRENT_TIMESTAMP
           WHERE id = $1 RETURNING ${CHARGE_COLUMNS.replace(/c\./g, '')}`,
          [charge.id],
        )
      : null;

    return { invoiceNumber: Number(factura.rows[0].invoice_number), actualizada: cobro?.rows[0] };
  });

  return {
    charge: actualizada ? toCharge(actualizada) : charge,
    payment: { status: payment.status, statusDetail: payment.status_detail, invoiceNumber },
  };
}

// --- Administracion de BookStudio ---

export interface AdminOrganization extends Organization {
  teachers: number;
  students: number;
  plan: string | null;
  planStatus: string | null;
  expiresAt: string | null;
  pendingCharges: number;
  pendingCop: number;
}

export async function listOrganizations(): Promise<AdminOrganization[]> {
  const { rows } = await query<
    OrganizationRow & {
      owner_name: string | null;
      owner_email: string | null;
      teachers: string;
      students: string;
      plan: string | null;
      plan_status: string | null;
      expires_at: Date | null;
      pending_charges: string;
      pending_cop: string | null;
    }
  >(
    `SELECT ${ORG_COLUMNS}, u.full_name AS owner_name, u.email AS owner_email,
            (SELECT COUNT(*) FROM users t
              WHERE t.organization_id = o.id AND t.role = 'teacher' AND t.is_active) AS teachers,
            (SELECT COUNT(DISTINCT ls.student_id)
               FROM library_students ls
               JOIN libraries l ON l.id = ls.library_id
               JOIN users d ON d.id = l.owner_id
              WHERE d.organization_id = o.id) AS students,
            s.plan, s.status AS plan_status, s.expires_at,
            (SELECT COUNT(*) FROM charges c
              WHERE c.organization_id = o.id AND c.status = 'emitida') AS pending_charges,
            (SELECT COALESCE(SUM(c.amount_cop), 0) FROM charges c
              WHERE c.organization_id = o.id AND c.status = 'emitida') AS pending_cop
     FROM organizations o
     LEFT JOIN users u ON u.id = o.owner_id
     -- La licencia mas reciente del cliente; LATERAL para traer una sola fila.
     LEFT JOIN LATERAL (
       SELECT plan, status, expires_at FROM subscriptions
       WHERE organization_id = o.id OR owner_id = o.owner_id
       ORDER BY created_at DESC LIMIT 1
     ) s ON TRUE
     ORDER BY o.name`,
  );

  return rows.map((row) => ({
    ...toOrganization(row),
    teachers: Number(row.teachers),
    students: Number(row.students),
    plan: row.plan ? (PLANS[row.plan as PlanId]?.name ?? row.plan) : null,
    planStatus: row.plan_status,
    expiresAt: row.expires_at?.toISOString() ?? null,
    pendingCharges: Number(row.pending_charges),
    pendingCop: Number(row.pending_cop ?? 0),
  }));
}

export async function createOrganization(input: OrganizationInput): Promise<Organization> {
  const nit = input.taxId?.trim() || null;
  if (nit) {
    const { rows } = await query<{ id: string }>('SELECT id FROM organizations WHERE lower(tax_id) = lower($1)', [
      nit,
    ]);
    if (rows[0]) throw HttpError.conflict('Ya existe un cliente con ese NIT');
  }

  const { rows } = await query<OrganizationRow>(
    `INSERT INTO organizations
       (name, legal_name, tax_id, contact_name, contact_email, contact_phone, address, city, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, legal_name, tax_id, owner_id, contact_name, contact_email,
               contact_phone, address, city, notes, created_at`,
    [
      input.name,
      input.legalName ?? null,
      nit,
      input.contactName ?? null,
      input.contactEmail ?? null,
      input.contactPhone ?? null,
      input.address ?? null,
      input.city ?? null,
      input.notes,
    ],
  );
  return toOrganization(rows[0]);
}

/**
 * Pone a alguien como titular de la cuenta de cliente.
 *
 * Es quien vera el portal y pagara. Se busca por correo porque es el dato que la
 * administracion tiene a mano; la cuenta debe existir ya.
 */
export async function linkOwner(organizationId: string, email: string): Promise<Organization> {
  const { rows: persona } = await query<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE email = $1 AND is_active',
    [email.toLowerCase()],
  );
  if (!persona[0]) throw HttpError.notFound('No hay ninguna cuenta activa con ese correo');
  if (persona[0].role === 'student') {
    throw HttpError.badRequest('Una cuenta de alumnado no puede ser titular de un cliente');
  }

  const { rows } = await query<OrganizationRow>(
    `UPDATE organizations SET owner_id = $2 WHERE id = $1
     RETURNING id, name, legal_name, tax_id, owner_id, contact_name, contact_email,
               contact_phone, address, city, notes, created_at`,
    [organizationId, persona[0].id],
  );
  if (!rows[0]) throw HttpError.notFound('Cliente no encontrado');

  // El titular tambien pertenece a su organizacion, para que cuente y se liste.
  await query('UPDATE users SET organization_id = $2 WHERE id = $1', [persona[0].id, organizationId]);

  return toOrganization(rows[0]);
}

export async function createCharge(
  organizationId: string,
  issuedBy: string,
  input: CreateChargeInput,
): Promise<Charge> {
  const { rows: org } = await query<{ id: string }>('SELECT id FROM organizations WHERE id = $1', [organizationId]);
  if (!org[0]) throw HttpError.notFound('Cliente no encontrado');

  const total = totalDe(input.items);
  if (total <= 0) throw HttpError.badRequest('El total debe ser mayor que cero');

  const { rows } = await query<ChargeRow>(
    `INSERT INTO charges
       (organization_id, subscription_id, issued_by, concept, items, amount_cop, status, due_date, issued_at, notes)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING id, number, organization_id, subscription_id, concept, items, amount_cop,
               status, due_date, issued_at, paid_at, notes, created_at`,
    [
      organizationId,
      input.subscriptionId ?? null,
      issuedBy,
      input.concept,
      JSON.stringify(input.items),
      total,
      input.issue ? 'emitida' : 'borrador',
      input.dueDate ?? null,
      input.issue ? new Date() : null,
      input.notes,
    ],
  );
  return toCharge(rows[0]);
}

export async function updateCharge(chargeId: string, input: UpdateChargeInput): Promise<Charge> {
  const { rows: actual } = await query<{ status: Charge['status'] }>('SELECT status FROM charges WHERE id = $1', [
    chargeId,
  ]);
  if (!actual[0]) throw HttpError.notFound('Cuenta de cobro no encontrada');

  // Una cuenta pagada no se reabre ni se anula: el rastro del dinero no se toca.
  if (actual[0].status === 'pagada' && input.status) {
    throw HttpError.badRequest('Una cuenta ya pagada no cambia de estado');
  }

  const campos: Record<string, unknown> = {
    status: input.status,
    notes: input.notes,
    due_date: input.dueDate,
    // Emitir deja constancia de cuando se le entrego al cliente.
    issued_at: input.status === 'emitida' ? new Date() : undefined,
  };
  const entradas = Object.entries(campos).filter(([, valor]) => valor !== undefined);
  if (!entradas.length) throw HttpError.badRequest('No hay campos para actualizar');

  const asignaciones = entradas.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const { rows } = await query<ChargeRow>(
    `UPDATE charges SET ${asignaciones} WHERE id = $1
     RETURNING id, number, organization_id, subscription_id, concept, items, amount_cop,
               status, due_date, issued_at, paid_at, notes, created_at`,
    [chargeId, ...entradas.map(([, valor]) => valor)],
  );
  return toCharge(rows[0]);
}

/**
 * Otorga una licencia sin pasar por caja.
 *
 * Para acuerdos cerrados fuera de la plataforma. Los cupos nulos son ilimitados.
 * Sustituye a la licencia vigente del cliente en lugar de acumularse: dos activas
 * a la vez harian que los cupos dependieran de cual se leyera primero.
 */
export interface GrantResult {
  subscription: PortalSubscription;
  /** La cuenta de cobro emitida a la vez, si se pidio. */
  charge: Charge | null;
}

export async function grantPlan(
  organizationId: string,
  issuedBy: string,
  input: GrantPlanInput,
): Promise<GrantResult> {
  const { rows: org } = await query<{ id: string; owner_id: string | null; name: string }>(
    'SELECT id, owner_id, name FROM organizations WHERE id = $1',
    [organizationId],
  );
  if (!org[0]) throw HttpError.notFound('Cliente no encontrado');
  if (!org[0].owner_id) {
    throw HttpError.badRequest('Asigna primero un titular: la licencia va a nombre de alguien');
  }

  const plan = PLANS[input.plan];
  const desde = new Date();
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + input.months);

  const { rows } = await withTransaction(async (client) => {
    // Las anteriores quedan canceladas, con su rastro y su fecha.
    await client.query(
      `UPDATE subscriptions SET status = 'cancelada', cancelled_at = CURRENT_TIMESTAMP
       WHERE (organization_id = $1 OR owner_id = $2) AND status IN ('activa', 'pendiente')`,
      [organizationId, org[0].owner_id],
    );

    return client.query<{
      id: string;
      plan: PlanId;
      status: string;
      amount_cop: string;
      auto_renew: boolean;
      starts_at: Date;
      expires_at: Date;
    }>(
      `INSERT INTO subscriptions
         (owner_id, organization_id, organization, plan, status, amount_cop,
          max_teachers, max_students, auto_renew, starts_at, expires_at)
       VALUES ($1, $2, $3, $4, 'activa', $5, $6, $7, FALSE, $8, $9)
       RETURNING id, plan, status, amount_cop, auto_renew, starts_at, expires_at`,
      [
        org[0].owner_id,
        organizationId,
        org[0].name,
        input.plan,
        input.amountCop,
        input.maxTeachers ?? null,
        input.maxStudents ?? null,
        desde,
        hasta,
      ],
    );
  });

  const fila = rows[0];
  const subscription: PortalSubscription = {
    id: fila.id,
    plan: fila.plan,
    planName: plan.name,
    status: fila.status,
    amountCop: Number(fila.amount_cop),
    autoRenew: fila.auto_renew,
    startsAt: fila.starts_at.toISOString(),
    expiresAt: fila.expires_at.toISOString(),
    daysLeft: Math.ceil((fila.expires_at.getTime() - Date.now()) / 86_400_000),
  };

  // El cobro de la licencia, en el mismo gesto. Una cuenta de cero no se emite.
  let charge: Charge | null = null;
  if (input.issueCharge && input.amountCop > 0) {
    const vence = new Date();
    vence.setDate(vence.getDate() + input.dueDays);
    charge = await createCharge(organizationId, issuedBy, {
      concept: `Plan ${plan.name} · ${input.months} meses`,
      items: [
        {
          description: `Licencia ${plan.name} (${input.months} meses)`,
          quantity: 1,
          unitCop: input.amountCop,
        },
      ],
      dueDate: vence.toISOString().slice(0, 10),
      subscriptionId: subscription.id,
      notes: input.notes,
      issue: true,
    });
  }

  return { subscription, charge };
}

/**
 * Mete en el equipo de un cliente una cuenta que ya existe.
 *
 * Hace falta para los colegios que ya usaban la plataforma antes de tener ficha
 * de cliente: sin esto, su claustro nunca apareceria en el portal y el consumo
 * saldria siempre en cero.
 *
 * Solo lo hace la administracion de BookStudio. Si pudiera hacerlo el propio
 * cliente, bastaria con escribir el correo de un docente cualquiera para
 * quedarselo dentro de su organizacion.
 */
export async function linkTeacher(organizationId: string, email: string): Promise<TeamMember> {
  const { rows: org } = await query<{ id: string }>('SELECT id FROM organizations WHERE id = $1', [organizationId]);
  if (!org[0]) throw HttpError.notFound('Cliente no encontrado');

  const { rows: persona } = await query<{ id: string; role: string; organization_id: string | null }>(
    'SELECT id, role, organization_id FROM users WHERE email = $1 AND is_active',
    [email.toLowerCase()],
  );
  if (!persona[0]) throw HttpError.notFound('No hay ninguna cuenta activa con ese correo');
  if (persona[0].role === 'student') {
    throw HttpError.badRequest('El alumnado no ocupa cupo de docente: se anade a las bibliotecas, no al equipo');
  }
  if (persona[0].organization_id && persona[0].organization_id !== organizationId) {
    throw HttpError.conflict('Esa cuenta ya pertenece a otro cliente');
  }

  await query('UPDATE users SET organization_id = $2 WHERE id = $1', [persona[0].id, organizationId]);

  const equipo = await listTeam('', 'admin', organizationId);
  const miembro = equipo.find((m) => m.id === persona[0].id);
  // No deberia ocurrir: el UPDATE ya se hizo. Si pasa, decir la verdad, no que
  // "no quedo en el equipo" cuando en realidad si quedo.
  if (!miembro) throw HttpError.badRequest('La cuenta quedo vinculada pero no se pudo leer de vuelta');
  return miembro;
}

/**
 * Borra un cliente.
 *
 * Faltaba, y sin esto un cliente creado por error era para siempre. Se lleva por
 * delante sus cuentas de cobro, pero NO si alguna vez se le cobro dinero: el
 * rastro de un pago no se destruye por limpiar la lista. En ese caso, lo que
 * corresponde es dejar de usarlo, no borrarlo.
 *
 * Las cuentas de sus docentes no se tocan: quedan sueltas, sin cliente, con todo
 * su contenido. Borrar personas es otra cosa y vive en el panel de usuarios.
 */
export async function deleteOrganization(organizationId: string): Promise<{ chargesDeleted: number }> {
  const { rows: org } = await query<{ id: string }>('SELECT id FROM organizations WHERE id = $1', [organizationId]);
  if (!org[0]) throw HttpError.notFound('Cliente no encontrado');

  const { rows: pagos } = await query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM payments p
     LEFT JOIN charges c ON c.id = p.charge_id
     WHERE c.organization_id = $1
        OR p.owner_id = (SELECT owner_id FROM organizations WHERE id = $1)`,
    [organizationId],
  );
  if (Number(pagos[0].total) > 0) {
    throw HttpError.badRequest(
      'Este cliente tiene pagos registrados y no se puede borrar. El rastro del dinero se conserva.',
    );
  }

  const { rows: cobros } = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM charges WHERE organization_id = $1',
    [organizationId],
  );

  // Los docentes se quedan sin cliente, pero con su cuenta y su contenido.
  await query('UPDATE users SET organization_id = NULL WHERE organization_id = $1', [organizationId]);
  await query('DELETE FROM organizations WHERE id = $1', [organizationId]);

  return { chargesDeleted: Number(cobros[0].total) };
}

export async function listCharges(organizationId: string): Promise<Charge[]> {
  const { rows } = await query<ChargeRow>(
    `SELECT ${CHARGE_COLUMNS} FROM charges c WHERE c.organization_id = $1 ORDER BY c.created_at DESC`,
    [organizationId],
  );
  return rows.map(toCharge);
}
