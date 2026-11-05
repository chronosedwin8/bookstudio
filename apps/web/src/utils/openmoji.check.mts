/**
 * OpenMoji: el catalogo en castellano, el buscador y que cada dibujo exista.
 *
 * Lo que mas importa vigilar es que el catalogo y los dibujos del paquete casen:
 * un codigo sin su SVG se veria en el libro como una imagen rota.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarOpenmoji, conTono, esCodigoOpenmoji, urlOpenmoji, type CatalogoOpenmoji } from './openmoji.ts';

let hechas = 0;
function prueba(nombre: string, fn: () => void): void {
  fn();
  hechas++;
  console.log('  ok', nombre);
}

console.log('\n== OpenMoji ==');

const aqui = dirname(fileURLToPath(import.meta.url));
const catalogo = JSON.parse(readFileSync(join(aqui, '..', 'assets', 'openmoji.json'), 'utf8')) as CatalogoOpenmoji;
const require = createRequire(join(aqui, '..', '..', 'package.json'));
const paquete = dirname(require.resolve('openmoji/package.json'));

prueba('el catalogo es de la version instalada', () => {
  const instalada = JSON.parse(readFileSync(join(paquete, 'package.json'), 'utf8')).version;
  assert.equal(catalogo.version, instalada, 'regenera el catalogo: npm run openmoji --workspace @bookstudio/web');
});

prueba('cada emoji y cada tono tiene su dibujo', () => {
  const faltan = catalogo.emojis
    .flatMap((e) => [e.h, ...(e.t ?? [])])
    .filter((h) => !existsSync(join(paquete, 'color', 'svg', `${h}.svg`)));
  assert.deepEqual(faltan, []);
});

prueba('todos los codigos son validos y no se repiten', () => {
  const codigos = catalogo.emojis.map((e) => e.h);
  assert.ok(codigos.every(esCodigoOpenmoji));
  assert.equal(new Set(codigos).size, codigos.length);
});

prueba('sin marcas registradas', () => {
  assert.ok(!buscarOpenmoji(catalogo, 'google').length && !buscarOpenmoji(catalogo, 'youtube').length);
});

prueba('se busca en castellano, sin tildes y por el principio', () => {
  assert.ok(buscarOpenmoji(catalogo, 'perro').some((e) => e.h === '1F415'));
  assert.ok(buscarOpenmoji(catalogo, 'arbol').some((e) => e.n.includes('árbol')));
  assert.ok(buscarOpenmoji(catalogo, 'manzan').some((e) => e.h === '1F34E'));
});

prueba('y tambien en ingles', () => {
  assert.ok(buscarOpenmoji(catalogo, 'dog').some((e) => e.h === '1F415'));
});

prueba('varias palabras: tienen que estar todas', () => {
  const r = buscarOpenmoji(catalogo, 'cara sonriendo');
  assert.ok(r.length > 0 && r.every((e) => e.k.includes('cara')));
});

prueba('los extras de OpenMoji se encuentran por su tema en castellano', () => {
  const extras = catalogo.grupos.findIndex((g) => g.id === 'extras-openmoji');
  assert.ok(buscarOpenmoji(catalogo, 'medio ambiente', extras).length > 0);
});

prueba('filtrar por grupo', () => {
  const banderas = catalogo.grupos.findIndex((g) => g.id === 'flags');
  const r = buscarOpenmoji(catalogo, '', banderas);
  assert.ok(r.length > 100 && r.every((e) => e.g === banderas));
});

prueba('tono de piel: el elegido si lo tiene, si no el de siempre', () => {
  const mano = catalogo.emojis.find((e) => e.h === '1F44B')!;
  assert.equal(conTono(mano, 0), '1F44B');
  assert.equal(conTono(mano, 3), '1F44B-1F3FD');
  const perro = catalogo.emojis.find((e) => e.h === '1F415')!;
  assert.equal(conTono(perro, 3), '1F415');
});

prueba('la direccion solo sale para codigos validos', () => {
  assert.equal(urlOpenmoji('1F415'), '/openmoji/1F415.svg');
  assert.equal(urlOpenmoji('1F415', 'https://bookstudio.uk'), 'https://bookstudio.uk/openmoji/1F415.svg');
  assert.equal(urlOpenmoji('../../etc/passwd'), '');
  assert.equal(urlOpenmoji('1f415"><script>'), '');
});

console.log(`  ${hechas} pruebas`);
