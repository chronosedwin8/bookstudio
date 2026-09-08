/**
 * Comprobacion de las plantillas. Se ejecuta con:
 *   npx tsx apps/web/src/utils/templates.check.mts
 *
 * Valida CADA elemento de CADA plantilla contra el esquema real del servidor,
 * importandolo del otro paquete en vez de copiar sus reglas aqui. Copiarlas
 * seria peor que no comprobar nada: al cambiar el servidor, la copia seguiria
 * dando el visto bueno a plantillas que ya no pasan.
 *
 * Existe por un fallo concreto. Varias plantillas nuevas llevaban textos de 16 a
 * 22 px y la plataforma exige 24 como minimo accesible, asi que el servidor
 * rechazaba la peticion entera: al elegir esa plantilla se creaba una pagina
 * vacia y no habia forma de saber por que. No lo vio ni el compilador ni la
 * pantalla, solo aparecio al aplicar una plantilla de verdad.
 */
import { createElementSchema } from '../../../api/src/modules/canvas/canvas.schemas.js';
import { TEMPLATES, TEMPLATE_GROUPS, TEMPLATES_BY_ID } from './templates.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

// --- Cada elemento tiene que pasar por donde pasara de verdad ---
let elementosRevisados = 0;
for (const plantilla of TEMPLATES) {
  const problemas: string[] = [];

  plantilla.elements.forEach((elemento, i) => {
    elementosRevisados += 1;
    const r = createElementSchema.safeParse({
      type: elemento.type,
      transformMatrix: elemento.transformMatrix,
      properties: elemento.properties,
    });
    if (!r.success) {
      const primero = r.error.issues[0];
      problemas.push(`elemento ${i} (${elemento.type}): ${primero.path.join('.')} ${primero.message}`);
    }
  });

  check(`la plantilla "${plantilla.label}" es valida`, problemas.length === 0, problemas.slice(0, 2).join(' / '));
}

console.log(`\n  (${TEMPLATES.length} plantillas, ${elementosRevisados} elementos)\n`);

// --- Coherencia del catalogo ---
check('no hay identificadores repetidos', new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length);

const enGrupos = TEMPLATE_GROUPS.flatMap((g) => g.ids);
const huerfanas = TEMPLATES.filter((t) => !enGrupos.includes(t.id)).map((t) => t.id);
check('todas las plantillas estan en algun grupo', huerfanas.length === 0, huerfanas.join(', '));

const fantasmas = enGrupos.filter((id) => !TEMPLATES_BY_ID.has(id));
check('ningun grupo apunta a una plantilla que no existe', fantasmas.length === 0, fantasmas.join(', '));

const repetidas = enGrupos.filter((id, i) => enGrupos.indexOf(id) !== i);
check('ninguna plantilla sale en dos grupos', repetidas.length === 0, repetidas.join(', '));

check('todas tienen descripcion', TEMPLATES.every((t) => t.description.trim().length > 5));

// El fondo se pinta tal cual: un color mal escrito deja la pagina en blanco.
check(
  'todos los fondos son colores validos',
  TEMPLATES.every((t) => /^#[0-9A-Fa-f]{6}$/.test(t.backgroundColor)),
  TEMPLATES.filter((t) => !/^#[0-9A-Fa-f]{6}$/.test(t.backgroundColor)).map((t) => t.id).join(', '),
);

// Fuera del lienzo no se ve nada, y es un despiste facil al colocar a mano.
const fuera = TEMPLATES.flatMap((t) =>
  t.elements
    .filter((e) => {
      const m = e.transformMatrix;
      return m.x < 0 || m.y < 0 || m.x + m.width > 100.5 || m.y + m.height > 100.5;
    })
    .map((e) => `${t.id}:${e.type}`),
);
check('ningun elemento se sale de la pagina', fuera.length === 0, fuera.slice(0, 4).join(', '));

/*
 * Windows no trae emojis de bandera: los pinta como las dos letras del pais. En
 * la portada de "Independencia de Colombia" salia un "CO" en mitad del diseno,
 * y no se vio hasta mirar una captura de verdad. Los indicadores regionales van
 * del U+1F1E6 al U+1F1FF.
 */
const banderas = TEMPLATES.flatMap((t) =>
  t.elements
    .filter((e) => /[\u{1F1E6}-\u{1F1FF}]/u.test(String(e.properties.char ?? '')))
    .map(() => t.id),
);
check('ninguna plantilla usa emojis de bandera', banderas.length === 0, banderas.join(', '));

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
