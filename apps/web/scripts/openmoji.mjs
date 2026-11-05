/**
 * OpenMoji: catalogo en castellano y copia de los dibujos.
 *
 *   node scripts/openmoji.mjs
 *
 * Hace dos cosas con los paquetes `openmoji` (los SVG y sus datos, en ingles) y
 * `emojibase-data` (nombres y palabras clave en castellano del CLDR):
 *
 *  1. Escribe `src/assets/openmoji.json`, el catalogo que usa el buscador: un
 *     emoji por entrada con su nombre en castellano, sus palabras clave (en
 *     castellano y en ingles, para que funcione buscar de las dos formas) y sus
 *     variantes de tono de piel. Va en git: es pequeno, se revisa en los cambios
 *     y no depende de nada al compilar.
 *  2. Copia los SVG en color a `public/openmoji/`, que Vite sirve tal cual. No
 *     va en git (son miles de ficheros): sale del paquete en cada compilacion.
 *
 * Se dejan fuera los logotipos de marcas (no son material de clase y son marcas
 * registradas) y las combinaciones de dos tonos de piel (cientos de variantes de
 * parejas que el selector de tono no podria ofrecer bien).
 *
 * Los dibujos son de OpenMoji (https://openmoji.org), con licencia CC BY-SA 4.0:
 * hay que citarlos donde se usan (lo hacen el selector, el pie de la portada y
 * los libros exportados).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(raiz, 'package.json'));

const paqueteOm = dirname(require.resolve('openmoji/package.json'));
const version = JSON.parse(readFileSync(join(paqueteOm, 'package.json'), 'utf8')).version;
const datos = JSON.parse(readFileSync(join(paqueteOm, 'data', 'openmoji.json'), 'utf8'));
const espanol = JSON.parse(readFileSync(require.resolve('emojibase-data/es/data.json'), 'utf8'));

/** Las categorias de OpenMoji, en el orden y con el nombre que vera el alumnado. */
const GRUPOS = [
  ['smileys-emotion', 'Caras y emociones'],
  ['people-body', 'Personas'],
  ['animals-nature', 'Animales y naturaleza'],
  ['food-drink', 'Comida y bebida'],
  ['travel-places', 'Viajes y lugares'],
  ['activities', 'Actividades'],
  ['objects', 'Objetos'],
  ['symbols', 'Símbolos'],
  ['flags', 'Banderas'],
  ['extras-openmoji', 'Extras de OpenMoji'],
  ['extras-unicode', 'Más símbolos'],
];
const indiceGrupo = new Map(GRUPOS.map(([id], i) => [id, i]));

/** Los extras solo vienen en ingles: su subcategoria da al menos palabras en castellano. */
const SUBGRUPOS_EXTRA = {
  'animals-nature': 'animales naturaleza',
  'climate-environment': 'clima medio ambiente ecologia',
  emergency: 'emergencia seguridad aviso',
  flags: 'bandera',
  'food-drink': 'comida bebida',
  gardening: 'jardineria jardin plantas',
  healthcare: 'salud medicina hospital',
  interaction: 'interaccion gesto',
  objects: 'objeto',
  people: 'persona gente',
  'queer-symbols': 'lgbt diversidad orgullo',
  'smileys-emotion': 'cara emocion',
  'symbol-other': 'simbolo',
  symbols: 'simbolo',
  technology: 'tecnologia ordenador',
  'travel-places': 'viaje lugar',
  'ui-element': 'interfaz boton pantalla',
  'regional-indicator': 'letra indicador regional',
  'subdivision-flag': 'bandera region',
};

const sinFe0f = (h) => h.toUpperCase().split('-').filter((x) => x !== 'FE0F').join('-');

/** Nombre y palabras en castellano por codigo (sin el selector de variante FE0F). */
const castellano = new Map();
for (const e of espanol) {
  castellano.set(sinFe0f(e.hexcode), e);
  for (const s of e.skins ?? []) castellano.set(sinFe0f(s.hexcode), s);
}

const normalizar = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ');

function palabras(...textos) {
  return [...new Set(textos.filter(Boolean).flatMap((t) => normalizar(String(t)).split(/\s+/)).filter((w) => w.length > 1))].join(' ');
}

// Variantes de un solo tono de piel, agrupadas bajo su emoji base.
const tonos = new Map();
for (const e of datos) {
  if (!e.skintone || e.skintone_combination !== 'single') continue;
  const lista = tonos.get(e.skintone_base_hexcode) ?? [];
  lista.push(e);
  tonos.set(e.skintone_base_hexcode, lista);
}

const emojis = [];
const copiar = new Set();
for (const e of datos) {
  if (e.skintone) continue;
  if (!indiceGrupo.has(e.group)) continue;
  if (e.group === 'extras-openmoji' && e.subgroups === 'brand') continue;

  const es = castellano.get(sinFe0f(e.hexcode));
  const nombre = es?.label ?? e.annotation;
  const entrada = {
    h: e.hexcode,
    g: indiceGrupo.get(e.group),
    n: nombre,
    k: palabras(nombre, (es?.tags ?? []).join(' '), e.annotation, e.tags, e.openmoji_tags, SUBGRUPOS_EXTRA[e.subgroups]),
  };
  const variantes = (tonos.get(e.hexcode) ?? []).sort((a, b) => Number(a.skintone) - Number(b.skintone));
  // Solo si estan los cinco tonos: el selector los ofrece en orden fijo.
  if (variantes.length === 5) entrada.t = variantes.map((v) => v.hexcode);

  emojis.push(entrada);
  copiar.add(e.hexcode);
  for (const v of entrada.t ?? []) copiar.add(v);
}
emojis.sort((a, b) => a.g - b.g);

const catalogo = { version, grupos: GRUPOS.map(([id, label]) => ({ id, label })), emojis };
const rutaCatalogo = join(raiz, 'src', 'assets', 'openmoji.json');
const nuevo = JSON.stringify(catalogo);
if (!existsSync(rutaCatalogo) || readFileSync(rutaCatalogo, 'utf8') !== nuevo) writeFileSync(rutaCatalogo, nuevo);

// Los SVG: solo se vuelven a copiar si cambia la version o falta alguno.
const destino = join(raiz, 'public', 'openmoji');
const marca = join(destino, '.version');
const alDia =
  existsSync(marca) && readFileSync(marca, 'utf8') === version && readdirSync(destino).length - 1 === copiar.size;
if (!alDia) {
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const origen = join(paqueteOm, 'color', 'svg');
  for (const h of copiar) copyFileSync(join(origen, `${h}.svg`), join(destino, `${h}.svg`));
  writeFileSync(marca, version);
}

console.log(`openmoji ${version}: ${emojis.length} emojis en el catalogo, ${copiar.size} dibujos ${alDia ? 'ya al dia' : 'copiados'}`);
