/**
 * Las tablas: modelo, edicion y lo que el servidor acepta.
 *
 * Lo que se vigila sobre todo es que la rejilla nunca quede descuadrada. Una
 * fila con menos celdas que las demas no da error en ningun sitio: simplemente
 * pinta una tabla rota, y eso es lo dificil de ver.
 */
import {
  ALINEACIONES,
  anadirColumna,
  anadirFila,
  columnasDe,
  conCelda,
  crearTabla,
  DISENOS,
  filasDe,
  MAX_CELDA,
  MAX_COLUMNAS,
  MAX_FILAS,
  NOMBRES_DISENO,
  normalizarTabla,
  quitarColumna,
  quitarFila,
  celdasDe,
  conEstilo,
  estiloDe,
} from './tablas.js';
import { tablePropertiesSchema } from '../../../api/src/modules/canvas/canvas.schemas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${!ok && detalle ? ` -> ${detalle}` : ''}`);
};

const rectangular = (t: { celdas: string[][] }): boolean =>
  new Set(t.celdas.map((f) => f.length)).size === 1;

console.log('\n-- Crear --');
const nueva = crearTabla(3, 4);
check('sale con el tamano pedido', filasDe(nueva) === 3 && columnasDe(nueva) === 4);
check('con la cabecera rellena', nueva.celdas[0].every((c) => c.length > 0), nueva.celdas[0].join('|'));
check('y el resto vacio', nueva.celdas[1].every((c) => c === ''));
check('la rejilla es rectangular', rectangular(nueva));

check('no se pueden pedir cero filas', filasDe(crearTabla(0, 3)) === 1);
check('ni mas de las que caben', filasDe(crearTabla(999, 3)) === MAX_FILAS);
check('ni mas columnas de las que caben', columnasDe(crearTabla(3, 999)) === MAX_COLUMNAS);

console.log('\n-- Editar --');
const conTexto = conCelda(nueva, 1, 2, 'hola');
check('se escribe en una celda', conTexto.celdas[1][2] === 'hola');
check('sin tocar la original', nueva.celdas[1][2] === '');
check('una celda fuera de rango no rompe nada', conCelda(nueva, 99, 99, 'x') === nueva);
check('el texto de una celda se recorta', conCelda(nueva, 1, 1, 'a'.repeat(500)).celdas[1][1].length === MAX_CELDA);

const masFila = anadirFila(nueva);
check('anadir fila suma una', filasDe(masFila) === 4);
check('y la rejilla sigue rectangular', rectangular(masFila));

const masCol = anadirColumna(nueva);
check('anadir columna suma una', columnasDe(masCol) === 5);
check('y la rejilla sigue rectangular', rectangular(masCol));
check('la nueva columna trae titulo en la cabecera', masCol.celdas[0][4].length > 0, masCol.celdas[0].join('|'));

check('quitar fila resta una', filasDe(quitarFila(nueva, 0)) === 2);
check('quitar columna resta una', columnasDe(quitarColumna(nueva, 0)) === 3);
check('y siguen rectangulares', rectangular(quitarColumna(nueva, 0)));

const unaSola = crearTabla(1, 1);
check('no se puede quedar sin filas', filasDe(quitarFila(unaSola, 0)) === 1);
check('ni sin columnas', columnasDe(quitarColumna(unaSola, 0)) === 1);

const llena = crearTabla(MAX_FILAS, MAX_COLUMNAS);
check('no se pasa del tope de filas', filasDe(anadirFila(llena)) === MAX_FILAS);
check('ni del de columnas', columnasDe(anadirColumna(llena)) === MAX_COLUMNAS);

console.log('\n-- Normalizar lo que llegue --');
check('null da una tabla utilizable', filasDe(normalizarTabla(null)) >= 1);
check('una cadena tambien', filasDe(normalizarTabla('hola' as unknown)) >= 1);
check('sin celdas se pone una tabla por defecto', filasDe(normalizarTabla({ celdas: [] })) >= 1);

// El caso importante: filas de distinta longitud
const descuadrada = normalizarTabla({ celdas: [['a', 'b', 'c'], ['d'], []] });
check('las filas cortas se completan', rectangular(descuadrada),
  JSON.stringify(descuadrada.celdas.map((f) => f.length)));
check('con el ancho de la mas larga', columnasDe(descuadrada) === 3, String(columnasDe(descuadrada)));

const inventada = normalizarTabla({
  celdas: [['a']],
  diseno: 'neon',
  alineacion: 'diagonal',
  colorAcento: 'rojo',
  fontSize: 900,
});
check('un diseno inventado cae en uno real', DISENOS.includes(inventada.diseno), inventada.diseno);
check('una alineacion inventada tambien', ALINEACIONES.includes(inventada.alineacion), inventada.alineacion);
check('un color que no es color se sustituye', /^#[0-9a-fA-F]{6}$/.test(inventada.colorAcento), inventada.colorAcento);
check('un tamano imposible se corrige', inventada.fontSize >= 8 && inventada.fontSize <= 48, String(inventada.fontSize));

const enorme = normalizarTabla({
  celdas: Array.from({ length: 60 }, () => Array.from({ length: 40 }, () => 'x')),
});
check('una tabla gigante se recorta', filasDe(enorme) <= MAX_FILAS && columnasDe(enorme) <= MAX_COLUMNAS,
  `${filasDe(enorme)}x${columnasDe(enorme)}`);

console.log('\n-- El servidor acepta lo mismo --');
check('una tabla normalizada la acepta el servidor',
  tablePropertiesSchema.safeParse(normalizarTabla({ celdas: [['a', 'b']] })).success);
check('y una recien creada tambien', tablePropertiesSchema.safeParse(crearTabla(4, 3)).success);

const rechazada = tablePropertiesSchema.safeParse({ celdas: [['a']], diseno: 'neon' });
check('un diseno inventado lo rechaza en vez de arreglarlo', rechazada.success === false);

const demasiadas = tablePropertiesSchema.safeParse({
  celdas: Array.from({ length: 40 }, () => ['a']),
});
check('y una tabla de 40 filas tampoco entra', demasiadas.success === false);

check('los disenos del servidor son los mismos',
  DISENOS.every((d) => tablePropertiesSchema.safeParse({ celdas: [['a']], diseno: d }).success),
  DISENOS.join(', '));

console.log('\n-- Formato del texto --');
const antigua = normalizarTabla({ celdas: [['a', 'b'], ['c', 'd']], fontSize: 14 });
check('una tabla de antes sale con el formato de siempre',
  antigua.fuente === 'Lato' && !antigua.negrita && antigua.alineacionVertical === 'middle' &&
  antigua.estilos.every((f) => f.every((e) => e === null)));

const base = crearTabla(3, 3);
const negritaFila = conEstilo(base, celdasDe(base, { fila: 1, columna: 0 }, 'fila'), { negrita: true, color: '#FF0000' });
check('el formato de una fila llega a todas sus celdas',
  negritaFila.estilos[1].every((e) => e?.negrita === true && e.color === '#FF0000'));
check('y no toca las demas', negritaFila.estilos[0].every((e) => e === null) && negritaFila.estilos[2].every((e) => e === null));
const columna = conEstilo(base, celdasDe(base, { fila: 0, columna: 2 }, 'columna'), { escala: 1.5 });
check('el de una columna, a toda la columna', columna.estilos.every((f) => f[2]?.escala === 1.5 && f[0] === null));
const sinNegrita = conEstilo(negritaFila, [{ fila: 1, columna: 1 }], { negrita: undefined });
check('quitar un formato deja el resto', !estiloDe(sinNegrita, { fila: 1, columna: 1 }).negrita &&
  estiloDe(sinNegrita, { fila: 1, columna: 1 }).color === '#FF0000');
check('quitarlo todo deja la celda limpia', conEstilo(negritaFila, [{ fila: 1, columna: 1 }], null).estilos[1][1] === null);
check('una escala imposible se acota', normalizarTabla({ ...base, estilos: [[{ escala: 99 }]] }).estilos[0][0]?.escala === 3);
check('un color que no es color se descarta', normalizarTabla({ ...base, estilos: [[{ color: 'rojo' }]] }).estilos[0][0] === null);

const conFila = anadirFila(negritaFila, 1);
check('al anadir una fila el formato se queda con su celda',
  conFila.estilos[2].every((e) => e?.negrita === true) && conFila.estilos[1].every((e) => e === null));
const conCol = anadirColumna(columna, 0);
check('al anadir una columna tambien', conCol.estilos.every((f) => f[3]?.escala === 1.5 && f[0] === null));
check('quitar fila y columna mantiene la forma',
  quitarFila(conFila, 0).estilos.length === filasDe(quitarFila(conFila, 0)) &&
  quitarColumna(conCol, 0).estilos.every((f) => f.length === columnasDe(quitarColumna(conCol, 0))));

check('el servidor acepta el formato',
  tablePropertiesSchema.safeParse({ ...negritaFila, fuente: 'Poppins', negrita: true, alineacionVertical: 'top' }).success);
check('y rechaza una tipografia inventada',
  tablePropertiesSchema.safeParse({ ...base, fuente: 'Comic Sans' }).success === false);

console.log('\n-- La interfaz tiene nombre para todo --');
check('cada diseno tiene nombre', DISENOS.every((d) => (NOMBRES_DISENO[d] ?? '').length > 0));

console.log(fallos === 0 ? '\ntablas: todo correcto' : `\ntablas: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
