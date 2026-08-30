/**
 * Genera el catalogo de iconos que usa el editor a partir de lucide-static (ISC).
 *
 *   node scripts/generar-iconos.mjs
 *
 * Cada icono se reduce a una lista de atributos `d`: las primitivas (circle, rect,
 * line, polyline...) se convierten a trazados. Asi el cliente los pinta con <path>
 * y nunca inyecta marcado, que seria un vector de XSS al venir de la base de datos.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const iconosDir = join(raiz, 'node_modules', 'lucide-static', 'icons');
const destino = join(raiz, 'apps', 'web', 'src', 'assets', 'icons.json');
const tagsPath = join(raiz, 'node_modules', 'lucide-static', 'tags.json');

const num = (value) => Number.parseFloat(value ?? '0') || 0;

/** Lee los atributos de una etiqueta SVG suelta. */
function atributos(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

function puntosATrazado(points, cerrar) {
  const pares = points.trim().split(/[\s,]+/);
  if (pares.length < 4) return null;
  const partes = [];
  for (let i = 0; i < pares.length - 1; i += 2) {
    partes.push(`${i === 0 ? 'M' : 'L'}${pares[i]} ${pares[i + 1]}`);
  }
  return partes.join(' ') + (cerrar ? ' Z' : '');
}

/** Convierte una primitiva SVG en el atributo `d` equivalente. */
function aTrazado(nombre, a) {
  switch (nombre) {
    case 'path':
      return a.d ?? null;
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)} L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
      return puntosATrazado(a.points ?? '', false);
    case 'polygon':
      return puntosATrazado(a.points ?? '', true);
    case 'circle': {
      const [cx, cy, r] = [num(a.cx), num(a.cy), num(a.r)];
      return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = [num(a.cx), num(a.cy), num(a.rx), num(a.ry)];
      return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
    }
    case 'rect': {
      const [x, y, w, h, rx] = [num(a.x), num(a.y), num(a.width), num(a.height), num(a.rx)];
      if (!rx) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
      return (
        `M${x + rx} ${y} H${x + w - rx} A${rx} ${rx} 0 0 1 ${x + w} ${y + rx} ` +
        `V${y + h - rx} A${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h} ` +
        `H${x + rx} A${rx} ${rx} 0 0 1 ${x} ${y + h - rx} ` +
        `V${y + rx} A${rx} ${rx} 0 0 1 ${x + rx} ${y} Z`
      );
    }
    default:
      return null;
  }
}

const tags = JSON.parse(await readFile(tagsPath, 'utf8'));
const archivos = (await readdir(iconosDir)).filter((f) => f.endsWith('.svg')).sort();

const iconos = [];
let omitidos = 0;

for (const archivo of archivos) {
  const nombre = archivo.replace(/\.svg$/, '');
  const svg = await readFile(join(iconosDir, archivo), 'utf8');

  const paths = [];
  for (const match of svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)\/?>/g)) {
    const d = aTrazado(match[1], atributos(match[2]));
    if (d) paths.push(d);
  }

  if (!paths.length) {
    omitidos += 1;
    continue;
  }

  // Los sinonimos alimentan el buscador del selector de iconos.
  const palabras = [...new Set([...nombre.split('-'), ...(tags[nombre] ?? [])])].join(' ');
  iconos.push({ n: nombre, p: paths, k: palabras });
}

const salida = { viewBox: '0 0 24 24', licencia: 'lucide-static (ISC)', iconos };
await writeFile(destino, JSON.stringify(salida), 'utf8');

const kb = (JSON.stringify(salida).length / 1024).toFixed(0);
console.log(`[iconos] ${iconos.length} iconos -> ${destino} (${kb} kB)`);
if (omitidos) console.log(`[iconos] omitidos ${omitidos} sin geometria reconocible`);
