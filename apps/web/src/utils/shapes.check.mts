/**
 * El catalogo de formas y lo que acepta el servidor tienen que decir lo mismo.
 *
 * Son dos listas escritas a mano en dos workspaces distintos, y hasta ahora solo
 * las unia un comentario. Con 94 formas eso ya no se sostiene: una que este en
 * el selector y no en el servidor deja al alumno con un error al insertarla, y
 * una que este en el servidor y no aqui se guarda y luego se dibuja como un
 * rectangulo sin que nadie sepa por que.
 */
import { SHAPES, SHAPE_GROUPS, SHAPE_NAMES, ratioOf } from './shapes.js';
import { shapeName } from '../../../api/src/modules/canvas/canvas.schemas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${!ok && detalle ? ` -> ${detalle}` : ''}`);
};

const delServidor: string[] = [...shapeName.options];

console.log('\n-- Las dos listas coinciden --');

const soloAqui = SHAPE_NAMES.filter((n) => !delServidor.includes(n));
const soloAlla = delServidor.filter((n) => !SHAPE_NAMES.includes(n as never));

check('ninguna forma falta en el servidor', soloAqui.length === 0, soloAqui.join(', '));
check('ni sobra en el servidor', soloAlla.length === 0, soloAlla.join(', '));
check('y hay las mismas', SHAPE_NAMES.length === delServidor.length,
  `${SHAPE_NAMES.length} aqui / ${delServidor.length} alla`);

console.log('\n-- Todas se pueden elegir --');

const enGrupos = new Set(SHAPE_GROUPS.flatMap((g) => g.shapes));
const huerfanas = SHAPE_NAMES.filter((n) => !enGrupos.has(n));
check('ninguna se queda fuera del selector', huerfanas.length === 0, huerfanas.join(', '));
check('ningun grupo esta vacio', SHAPE_GROUPS.every((g) => g.shapes.length > 0));

const nombresGrupo = SHAPE_GROUPS.map((g) => g.label);
check('los grupos no se repiten', new Set(nombresGrupo).size === nombresGrupo.length, nombresGrupo.join(', '));

console.log('\n-- Cada forma esta bien definida --');

for (const nombre of SHAPE_NAMES) {
  const def = SHAPES[nombre];
  if (!def.label) check(`${nombre} tiene nombre visible`, false);
  if (!def.primitives.length) check(`${nombre} dibuja algo`, false);
}
check('todas tienen nombre visible', SHAPE_NAMES.every((n) => SHAPES[n].label.length > 0));
check('todas dibujan algo', SHAPE_NAMES.every((n) => SHAPES[n].primitives.length > 0));
check('la proporcion es razonable', SHAPE_NAMES.every((n) => ratioOf(n) > 0.1 && ratioOf(n) < 10),
  SHAPE_NAMES.filter((n) => ratioOf(n) <= 0.1 || ratioOf(n) >= 10).join(', '));

/*
 * La geometria vive en una caja de 0 a 100. Algo muy fuera de ese margen se sale
 * del recuadro al dibujarse, que es como se colaron en su dia formas cortadas.
 */
const FUERA = /(-?\d+(?:\.\d+)?)/g;
const desbordadas: string[] = [];
for (const nombre of SHAPE_NAMES) {
  for (const p of SHAPES[nombre].primitives) {
    const texto = 'd' in p ? p.d : 'points' in p ? p.points : '';
    if (!texto) continue;
    for (const n of texto.match(FUERA) ?? []) {
      const v = Number(n);
      // Los radios de arco y los flags de las curvas no son coordenadas: se deja
      // margen amplio y solo se buscan disparates.
      if (v < -20 || v > 130) { desbordadas.push(`${nombre}: ${v}`); break; }
    }
  }
}
check('ninguna se sale mucho de la caja 0-100', desbordadas.length === 0, desbordadas.slice(0, 6).join(', '));

console.log(`\nformas: ${SHAPE_NAMES.length} en ${SHAPE_GROUPS.length} grupos`);
console.log(fallos === 0 ? 'formas: todo correcto' : `formas: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
