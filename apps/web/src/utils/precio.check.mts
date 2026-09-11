/**
 * Como se escribe el dinero y como se cuenta el periodo.
 *
 * Son cuatro funciones cortas, pero deciden lo que lee alguien antes de sacar la
 * tarjeta: un "al año" donde toca "al mes" es una promesa que no se cumple.
 */
import assert from 'node:assert/strict';
import type { BillingPlan } from '../types/api.ts';
import { duracionTexto, notaDelPrecio, periodoTexto, pesos, pesosConMoneda, precioDestacado } from './precio.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

const plan = (extra: Partial<BillingPlan>): BillingPlan => ({
  id: 'x',
  name: 'X',
  amountCop: 1000,
  monthlyCop: null,
  periodMonths: 12,
  summary: '',
  maxTeachers: null,
  maxStudents: null,
  ...extra,
});

console.log('\n== Precios ==');

prueba('El peso colombiano se escribe sin decimales y sin espacio tras el simbolo', () => {
  assert.equal(pesos(10000), '$10.000');
  assert.equal(pesos(1800000), '$1.800.000');
  assert.equal(pesos(0), '$0');
});

prueba('Y no se cuela ningun espacio raro', () => {
  // El espacio duro de `Intl` partia el precio en dos lineas dentro de la tarjeta.
  for (const valor of [1000, 10000, 150000, 20000000]) {
    assert.ok(!/[\s  ]/u.test(pesos(valor)), `"${pesos(valor)}" lleva un espacio`);
  }
});

prueba('Con moneda va detras, separada', () => {
  assert.equal(pesosConMoneda(150000), '$150.000 COP');
});

prueba('El precio grande es el mensual cuando se anuncia, y si no el total', () => {
  assert.equal(precioDestacado(plan({ amountCop: 1800000, monthlyCop: 150000 })), 150000);
  assert.equal(precioDestacado(plan({ amountCop: 5000000, monthlyCop: null })), 5000000);
});

prueba('El periodo se dice como corresponde a cada plan', () => {
  assert.equal(periodoTexto(plan({ periodMonths: 1, monthlyCop: 10000 })), 'al mes');
  assert.equal(periodoTexto(plan({ periodMonths: 12, monthlyCop: 150000 })), 'al mes, con pago anual');
  assert.equal(periodoTexto(plan({ periodMonths: 12, monthlyCop: null })), 'al año');
  assert.equal(periodoTexto(plan({ periodMonths: 6, monthlyCop: null })), 'cada 6 meses');
});

prueba('La duracion es lo que dura la licencia, no como se anuncia', () => {
  assert.equal(duracionTexto(plan({ periodMonths: 1 })), 'un mes');
  assert.equal(duracionTexto(plan({ periodMonths: 12 })), 'un año');
  assert.equal(duracionTexto(plan({ periodMonths: 24 })), '24 meses');
});

prueba('Si se anuncia por mes pero se cobra de una vez, hay que decirlo', () => {
  assert.equal(
    notaDelPrecio(plan({ amountCop: 1800000, monthlyCop: 150000, periodMonths: 12 })),
    'Facturación anual: $1.800.000 COP al año.',
  );
  assert.equal(
    notaDelPrecio(plan({ amountCop: 60000, monthlyCop: 10000, periodMonths: 6 })),
    'Se cobra $60.000 COP cada 6 meses.',
  );
});

prueba('Y cuando el precio anunciado ES el que se cobra, no sobra ninguna nota', () => {
  assert.equal(notaDelPrecio(plan({ amountCop: 10000, monthlyCop: 10000, periodMonths: 1 })), null);
  assert.equal(notaDelPrecio(plan({ amountCop: 5000000, monthlyCop: null, periodMonths: 12 })), null);
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
