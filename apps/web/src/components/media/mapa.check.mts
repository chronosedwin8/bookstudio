/**
 * De donde se piden las teselas del mapa.
 *
 * Esta comprobacion existe por un fallo concreto: se puso CARTO como proveedor
 * principal y sus baldosas llegaban con codigo 200 pero con "API KEY REQUIRED"
 * estampado encima. Ninguna comprobacion de codigos HTTP lo nota, porque no es
 * un error: es una imagen valida que no sirve.
 *
 * Asi que aqui no se miran respuestas, se mira la lista: solo pueden figurar
 * proveedores que sirven mapa de verdad sin clave.
 */
import { readFileSync } from 'node:fs';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${!ok && detalle ? ` -> ${detalle}` : ''}`);
};

const fuente = readFileSync(new URL('./MapWidget.vue', import.meta.url), 'utf8');

/** Servicios que devuelven la baldosa marcada, o la niegan, si no hay clave. */
const EXIGEN_CLAVE = [
  'cartocdn.com',
  'api.mapbox.com',
  'maps.googleapis.com',
  'api.maptiler.com',
  'tiles.stadiamaps.com',
  'thunderforest.com',
  'api.here.com',
];

console.log('\n-- Proveedores de teselas --');

const urls = [...fuente.matchAll(/url:\s*'([^']+)'/g)].map((m) => m[1]);
check('hay al menos un proveedor', urls.length >= 1, urls.join(' | '));

for (const exige of EXIGEN_CLAVE) {
  check(`no se usa ${exige}, que necesita clave`, !fuente.includes(exige),
    'sus baldosas llegan con 200 pero marcadas o vacias');
}

check('todas las teselas se piden por https', urls.every((u) => u.startsWith('https://')), urls.join(' | '));
check('y llevan las tres coordenadas', urls.every((u) => u.includes('{z}') && u.includes('{x}') && u.includes('{y}')),
  urls.join(' | '));

console.log('\n-- Atribucion --');
check('se acredita a OpenStreetMap', /openstreetmap\.org\/copyright/.test(fuente));

console.log('\n-- Si no hay mapa, se dice --');
check('hay aviso cuando ningun proveedor responde', fuente.includes('No se pudo cargar el mapa'));

console.log(fallos === 0 ? '\nmapa: todo correcto' : `\nmapa: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
