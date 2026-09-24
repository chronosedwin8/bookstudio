/** Repartir un nombre en apellidos y nombres, y detectar letras dañadas. */
import assert from 'node:assert/strict';
import { partirNombre, tieneLetrasDanadas } from './nombres.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

console.log('\n== Nombres ==');

prueba('cuatro palabras: dos apellidos y dos nombres', () => {
  assert.deepEqual(partirNombre('ACOSTA URUETA MATIAS ALBERTO'), { apellidos: 'ACOSTA URUETA', nombres: 'MATIAS ALBERTO' });
});

prueba('las particulas van con su apellido: "DE LA CRUZ" no se parte', () => {
  const r = partirNombre('CAÑÓN DE LA CRUZ DANIEL ALEJANDRO');
  assert.equal(r.apellidos, 'CAÑÓN DE LA CRUZ');
  assert.equal(r.nombres, 'DANIEL ALEJANDRO');
});

prueba('espacios de sobra no cuentan como palabras', () => {
  assert.deepEqual(partirNombre('  PEREZ   GOMEZ  ANA  '), { apellidos: 'PEREZ GOMEZ', nombres: 'ANA' });
});

prueba('una sola palabra va a apellidos y no se pierde', () => {
  assert.deepEqual(partirNombre('Mattias'), { apellidos: 'Mattias', nombres: '' });
  assert.deepEqual(partirNombre(''), { apellidos: '', nombres: '' });
});

prueba('detecta el caracter de sustitucion de un nombre dañado', () => {
  assert.equal(tieneLetrasDanadas('HENR�QUEZ CAMPO'), true);
  assert.equal(tieneLetrasDanadas('HENRÍQUEZ CAMPO'), false);
  assert.equal(tieneLetrasDanadas(null), false);
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
