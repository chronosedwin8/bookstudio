/**
 * Las ilustraciones no pueden salir siempre con la misma gente, pero las que ya
 * estan en los libros no deben cambiar de aspecto.
 */
import assert from 'node:assert/strict';
import { PIELES, rasgosDe, semillaNueva } from './paleta.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}
const nadieEnsena = () => false;

console.log('\n== Variedad de las ilustraciones ==');

prueba('semilla 0 = el reparto de siempre (las ya guardadas no cambian)', () => {
  const r = rasgosDe(0, 3, (i) => i === 0);
  assert.deepEqual(r[0], { piel: 3, pelo: 1, ropa: 0, peinado: 0 });
  assert.deepEqual(r[1], { piel: 1, pelo: 1, ropa: 1, peinado: 1 });
  assert.deepEqual(r[2], { piel: 2, pelo: 2, ropa: 2, peinado: 2 });
});

prueba('la misma semilla da siempre la misma gente', () => {
  assert.deepEqual(rasgosDe(4242, 4, nadieEnsena), rasgosDe(4242, 4, nadieEnsena));
});

prueba('semillas distintas dan gente distinta', () => {
  const vistas = new Set<string>();
  for (let s = 1; s <= 60; s += 1) vistas.add(JSON.stringify(rasgosDe(s, 2, nadieEnsena)));
  // Con 60 semillas tiene que haber mucha variedad, no un par de combinaciones.
  assert.ok(vistas.size >= 40, `solo ${vistas.size} combinaciones distintas`);
});

prueba('en una misma escena nadie comparte tono de piel', () => {
  for (let s = 1; s <= 200; s += 1) {
    const pieles = rasgosDe(s, 4, nadieEnsena).map((r) => r.piel);
    assert.equal(new Set(pieles).size, 4, `semilla ${s}`);
    for (const p of pieles) assert.ok(p >= 0 && p < PIELES.length);
  }
});

prueba('una semilla nueva nunca es 0', () => {
  for (let i = 0; i < 500; i += 1) assert.ok(semillaNueva() > 0);
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
