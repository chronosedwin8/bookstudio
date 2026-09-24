/** Saber si una descripcion es algo que el motor de ilustraciones sabe dibujar. */
import assert from 'node:assert/strict';
import { reconoceAlgo } from './lectura.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

console.log('\n== Alcance de las ilustraciones ==');

prueba('reconoce escenas de clase', () => {
  for (const t of [
    'Tres estudiantes colaborando con tablets',
    'Una profesora explicando matemáticas',
    'Niños leyendo en la biblioteca',
    'Alumnos escribiendo en sus cuadernos',
    'una clase de informática',
  ]) assert.equal(reconoceAlgo(t), true, t);
});

prueba('avisa de lo que no sabe dibujar', () => {
  for (const t of ['Un volcán en erupción', 'El sistema solar con sus planetas', 'Un perro jugando en el parque', 'La torre Eiffel de noche']) {
    assert.equal(reconoceAlgo(t), false, t);
  }
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
