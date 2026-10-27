/**
 * La configuracion de la barra de herramientas que guarda la administracion.
 *
 * Puede ser anterior a una herramienta nueva o nombrar una que ya no existe: el
 * editor tiene que salir siempre con cada herramienta una vez y en algun sitio.
 */
import assert from 'node:assert/strict';
import { HERRAMIENTAS, barraPorDefecto, categoriaDe, idCategoriaNueva, normalizarBarra } from './barraHerramientas.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

console.log('\n== Barra de herramientas ==');

const todas = Object.keys(HERRAMIENTAS).sort();
const enLaBarra = (c: ReturnType<typeof normalizarBarra>) => c.categories.flatMap((x) => x.tools).sort();

prueba('la de fabrica lleva cada herramienta una vez', () => {
  assert.deepEqual(enLaBarra(barraPorDefecto()), todas);
  assert.ok(barraPorDefecto().categories.every((c) => c.tools.length > 0));
});

prueba('sin configuracion, o vacia, vale la de fabrica', () => {
  assert.deepEqual(normalizarBarra(null), barraPorDefecto());
  assert.deepEqual(normalizarBarra({ categories: [] }), barraPorDefecto());
});

prueba('se respeta el orden y el sitio que eligio la administracion', () => {
  const c = normalizarBarra({
    categories: [
      { id: 'favoritas', label: 'Favoritas', icon: '⭐', tools: ['mapa', 'texto'] },
      { id: 'texto', label: 'Escribir', icon: 'T', tools: ['formula'] },
    ],
    openByDefault: 'favoritas',
  });
  assert.deepEqual(c.categories[0].tools.slice(0, 2), ['mapa', 'texto']);
  assert.equal(c.categories[1].label, 'Escribir');
  assert.equal(c.openByDefault, 'favoritas');
});

prueba('las que faltan vuelven a su categoria; si no existe, a la ultima', () => {
  const c = normalizarBarra({
    categories: [
      { id: 'texto', label: 'Texto', icon: '', tools: ['texto'] },
      { id: 'otra', label: 'Otra', icon: '', tools: [] },
    ],
    openByDefault: null,
  });
  assert.deepEqual(enLaBarra(c), todas);
  assert.equal(categoriaDe(c, 'tabla'), 'texto');
  assert.equal(categoriaDe(c, 'mapa'), 'otra');
});

prueba('se descartan las desconocidas, las repetidas y la abierta que no existe', () => {
  const c = normalizarBarra({
    categories: [
      { id: 'a', label: '  ', icon: '', tools: ['texto', 'no-existe' as never, 'texto'] },
      { id: 'a', label: 'Duplicada', icon: '', tools: ['mapa'] },
    ],
    openByDefault: 'fantasma',
  });
  assert.equal(c.categories.length, 1);
  assert.equal(c.categories[0].label, 'Sin nombre');
  assert.deepEqual(enLaBarra(c), todas);
  assert.equal(c.openByDefault, null);
});

prueba('id de categoria nueva sin choques', () => {
  assert.equal(idCategoriaNueva(['a', 'b']), 'categoria-3');
  assert.equal(idCategoriaNueva(['categoria-2']), 'categoria-3');
});

console.log(`  ${hechas} pruebas`);
