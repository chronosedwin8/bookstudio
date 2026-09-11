import type { BillingPlan } from '@/types/api';

/**
 * Como se escribe el dinero.
 *
 * Estaba repetido en cada vista y con formatos distintos: la portada ponia
 * "$150.000 COP" a mano y la contratacion usaba `Intl`. Con un solo sitio el
 * precio se ve igual en toda la aplicacion, y sobre todo se escribe una sola vez.
 *
 * Sin decimales porque el peso colombiano no los usa.
 */
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function pesos(valor: number): string {
  // `Intl` deja un espacio duro tras el simbolo ("$ 10.000"); en Colombia se
  // escribe pegado, y ademas ese espacio hacia que el precio partiera en dos
  // lineas dentro de la tarjeta.
  return COP.format(valor).replace(/^(\D+)\s+/u, '$1');
}

/** "$150.000 COP": lo mismo, pero diciendo la moneda, que es lo que pide la portada. */
export function pesosConMoneda(valor: number): string {
  return `${pesos(valor)} COP`;
}

/**
 * El precio grande de la tarjeta.
 *
 * Si el plan anuncia un importe mensual se muestra ese, porque asi es como se
 * comparan los planes; lo que se cobra de verdad es `amountCop` y por eso la nota
 * de abajo lo dice sin rodeos.
 */
export function precioDestacado(plan: BillingPlan): number {
  return plan.monthlyCop ?? plan.amountCop;
}

export function periodoTexto(plan: BillingPlan): string {
  if (plan.monthlyCop !== null && plan.periodMonths > 1) return 'al mes, con pago anual';
  if (plan.periodMonths === 1) return 'al mes';
  if (plan.periodMonths === 12) return 'al año';
  return `cada ${plan.periodMonths} meses`;
}

/** Cuanto dura la licencia, para decirlo en el resumen del cobro. */
export function duracionTexto(plan: BillingPlan): string {
  if (plan.periodMonths === 1) return 'un mes';
  if (plan.periodMonths === 12) return 'un año';
  return `${plan.periodMonths} meses`;
}

/**
 * La letra pequeña que se deriva del precio.
 *
 * Solo hace falta cuando el precio que se anuncia no es el que se cobra: si se
 * enseña un importe mensual pero el cargo es anual, hay que decirlo ahi mismo.
 */
export function notaDelPrecio(plan: BillingPlan): string | null {
  if (plan.monthlyCop === null || plan.periodMonths <= 1) return null;
  const total = pesosConMoneda(plan.amountCop);
  return plan.periodMonths === 12
    ? `Facturación anual: ${total} al año.`
    : `Se cobra ${total} cada ${plan.periodMonths} meses.`;
}
