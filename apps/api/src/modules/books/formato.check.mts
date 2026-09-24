/**
 * Cambiar el formato de un libro no puede deformar ni sacar nada de la pagina.
 */
import assert from 'node:assert/strict';
import { reducirTexto, reduccionDeFormato, reencajar } from './formato.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

// Tamano real en el lienzo: el ancho mide siempre 1000.
const ALTO: Record<string, number> = { square: 1000, portrait: 1000 / (3 / 4), landscape: 1000 / (4 / 3) };
const real = (t: { width: number; height: number }, formato: string) => ({
  ancho: (t.width / 100) * 1000,
  alto: (t.height / 100) * ALTO[formato],
});

const FORMATOS = ['square', 'portrait', 'landscape'];
const CAJAS = [
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 10, y: 20, width: 30, height: 30 },
  { x: 60, y: 70, width: 40, height: 30, angle: 15 },
];

console.log('\n== Cambio de formato ==');

prueba('ninguna caja se deforma: la proporcion real se conserva', () => {
  for (const desde of FORMATOS) for (const hasta of FORMATOS) for (const c of CAJAS) {
    const antes = real(c, desde);
    const despues = real(reencajar(c, desde, hasta), hasta);
    const pa = antes.ancho / antes.alto;
    const pd = despues.ancho / despues.alto;
    assert.ok(Math.abs(pa - pd) < 0.01, `${desde}->${hasta}: ${pa} vs ${pd}`);
  }
});

prueba('nada se sale de la pagina nueva', () => {
  for (const desde of FORMATOS) for (const hasta of FORMATOS) {
    const pagina = reencajar({ x: 0, y: 0, width: 100, height: 100 }, desde, hasta);
    assert.ok(pagina.x >= -0.001 && pagina.y >= -0.001, `${desde}->${hasta}`);
    assert.ok(pagina.x + pagina.width <= 100.001 && pagina.y + pagina.height <= 100.001, `${desde}->${hasta}`);
  }
});

prueba('la pagina vieja queda centrada y ocupando todo lo que puede', () => {
  const a = reencajar({ x: 0, y: 0, width: 100, height: 100 }, 'landscape', 'portrait');
  assert.equal(a.x, 0);
  assert.equal(a.width, 100);
  assert.ok(Math.abs(a.y - (100 - a.height) / 2) < 0.01);

  const b = reencajar({ x: 0, y: 0, width: 100, height: 100 }, 'portrait', 'landscape');
  assert.equal(b.y, 0);
  assert.equal(b.height, 100);
  assert.ok(Math.abs(b.x - (100 - b.width) / 2) < 0.01);
});

prueba('al mismo formato no se mueve nada', () => {
  for (const f of FORMATOS) for (const c of CAJAS) {
    const r = reencajar(c, f, f);
    assert.deepEqual([r.x, r.y, r.width, r.height], [c.x, c.y, c.width, c.height]);
  }
});

prueba('el giro se conserva', () => {
  assert.equal(reencajar(CAJAS[2], 'square', 'landscape').angle, 15);
});

prueba('solo se reduce al ganar ancho respecto al alto', () => {
  assert.equal(reduccionDeFormato('landscape', 'portrait'), 1);
  assert.equal(reduccionDeFormato('square', 'portrait'), 1);
  assert.ok(reduccionDeFormato('portrait', 'landscape') < 1);
});

prueba('la letra se reduce con su caja, sin bajar del minimo', () => {
  assert.equal(reducirTexto(64, 0.5, 'text'), 32);
  assert.equal(reducirTexto(30, 0.5, 'text'), 24);
  assert.equal(reducirTexto(14, 0.5, 'table'), 8);
});

console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
