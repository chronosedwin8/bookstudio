/**
 * Lo que se escribe al corregir un correo, antes de mandarlo al servidor.
 *
 * El servidor valida de verdad; esto evita el viaje por una errata y decide que
 * cancelar, o dejarlo igual, no cuente como error.
 */
import assert from 'node:assert/strict';
import { correoVisible, interpretarCorreo } from './correo.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

console.log('\n== Correo ==');

prueba('cancelar el cuadro no es un error', () => {
  assert.deepEqual(interpretarCorreo(null, 'a@b.co'), { tipo: 'cancelado' });
  assert.deepEqual(interpretarCorreo('   ', 'a@b.co'), { tipo: 'cancelado' });
});

prueba('se normaliza: sin espacios y en minusculas', () => {
  assert.deepEqual(interpretarCorreo('  Ana.Perez@Colegioaleman.EDU.co ', 'viejo@gmail.com'), {
    tipo: 'nuevo',
    email: 'ana.perez@colegioaleman.edu.co',
  });
});

prueba('dejarlo igual no manda nada, aunque cambien mayusculas', () => {
  assert.deepEqual(interpretarCorreo('ANA@colegio.co', 'ana@colegio.co'), { tipo: 'igual' });
});

prueba('una errata se frena con un motivo legible', () => {
  for (const malo of ['ana', 'ana@', 'ana@colegio', 'ana perez@colegio.co', '@colegio.co']) {
    const r = interpretarCorreo(malo, 'x@y.co');
    assert.equal(r.tipo, 'invalido', malo);
  }
});

prueba('los dominios que usa la propia aplicacion no se aceptan', () => {
  assert.equal(interpretarCorreo('ana@qr.local', 'x@y.co').tipo, 'invalido');
  assert.equal(interpretarCorreo('ana@trial.local', 'x@y.co').tipo, 'invalido');
});

prueba('una cuenta de QR no ensena su correo inventado', () => {
  assert.equal(correoVisible('alumno-abc@qr.local'), '');
  assert.equal(correoVisible('ana@colegio.co'), 'ana@colegio.co');
  assert.equal(correoVisible(null), '');
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
