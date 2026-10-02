/**
 * Comprobacion de las graficas de funciones. Se ejecuta con:
 *   npx tsx apps/web/src/utils/graficas.check.mts
 *
 * Lo numerico (raices, integral, pendiente) tiene que dar lo que da en la
 * pizarra, o el libro enseña mal. Y el SVG nunca debe llevar dentro el texto del
 * autor sin escapar.
 */
import {
  derivada,
  dibujar2D,
  dibujar3D,
  EJEMPLOS_GRAFICA,
  GRAFICA_POR_DEFECTO,
  funcionNueva,
  integral,
  nombreDeslizadorValido,
  normalizarGrafica,
  pasoRejilla,
  raices,
  trazos,
} from './graficas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};
const cerca = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

// --- Calculo ---
const r = raices((x) => x * x - 2, -5, 5);
check('raices de x^2 - 2', r.length === 2 && cerca(r[0], -Math.SQRT2) && cerca(r[1], Math.SQRT2), r.join(', '));
check('1/x no tiene raiz en la asintota', raices((x) => 1 / x, -3, 3).length === 0);
const rs = raices(Math.sin, -7, 7);
check('sin(x) tiene 5 raices en [-7, 7]', rs.length === 5, rs.map((v) => v.toFixed(3)).join(', '));
check('integral de x^2 en [0, 3] = 9', cerca(integral((x) => x * x, 0, 3), 9));
check('integral de sin en [0, pi] = 2', cerca(integral(Math.sin, 0, Math.PI), 2));
check('integral al reves cambia de signo', cerca(integral((x) => x, 2, 0), -2));
check('derivada de x^3 en 2 = 12', cerca(derivada((x) => x ** 3, 2), 12, 1e-4));

// --- Trazado ---
const vista = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
check('una recta es un solo trazo', trazos((x) => x, vista, 500, 500).length === 1);
check('1/x se corta en la asintota', trazos((x) => 1 / x, vista, 500, 500).length === 2);
check('tan(x) se corta en cada asintota', trazos(Math.tan, vista, 500, 500).length >= 3);
check('sqrt solo existe a la derecha', trazos(Math.sqrt, vista, 500, 500).length === 1);
check('el paso de rejilla es redondo', [pasoRejilla(10), pasoRejilla(3), pasoRejilla(250)].join() === '1,0.2,20');

// --- SVG en 2D ---
const base = normalizarGrafica({});
const r2 = dibujar2D(base, { w: 600, h: 400 });
check('la grafica por defecto se dibuja sin errores', r2.svg.startsWith('<svg') && !r2.errores.length);

const conCortes = normalizarGrafica({
  functions: [funcionNueva('y', 'x^2 - 3', '#2563EB'), funcionNueva('y', '2x', '#DC2626')],
  markIntersections: true,
  markRoots: true,
  xMin: -5, xMax: 6, yMin: -5, yMax: 12,
});
const n = dibujar2D(conCortes, { w: 600, h: 400 }).notables;
const cortes = n.filter((p) => p.y !== 0);
check('x^2 - 3 = 2x se cortan en -1 y 3', cortes.length === 2 && cerca(cortes[0].x, -1, 1e-6) && cerca(cortes[1].x, 3, 1e-6), JSON.stringify(cortes.map((c) => c.texto)));
check('y marca las raices de cada una', n.filter((p) => p.y === 0).length === 3);

const conArea = normalizarGrafica({ functions: [funcionNueva('y', 'x^2', '#2563EB')], area: { enabled: true, fn: 0, a: '0', b: '3', color: '#2563EB' } });
check('el area da la integral', cerca(dibujar2D(conArea, { w: 600, h: 400 }).integral ?? NaN, 9, 1e-6));

const conTangente = normalizarGrafica({
  functions: [funcionNueva('y', 'x^3', '#2563EB')],
  params: [{ name: 'p', value: 2, min: -3, max: 3, step: 0.1 }],
  tangent: { enabled: true, fn: 0, x0: 'p', color: '#DC2626' },
});
check('la tangente en el deslizador', cerca(dibujar2D(conTangente, { w: 600, h: 400 }).pendiente ?? NaN, 12, 1e-3));
check('mover el deslizador cambia la pendiente', cerca(dibujar2D(conTangente, { w: 600, h: 400, valores: { p: 1 } }).pendiente ?? NaN, 3, 1e-3));

const mala = normalizarGrafica({ functions: [funcionNueva('y', 'x +', '#2563EB')] });
check('una expresion mala se informa y no rompe', dibujar2D(mala, { w: 300, h: 200 }).errores.length === 1);

const travieso = normalizarGrafica({
  title: '<script>alert(1)</script>',
  xLabel: '<img src=x onerror=alert(1)>',
  functions: [{ ...funcionNueva('y', 'x', '#2563EB'), label: '"><b>x</b>' }],
  points: [{ x: '1', y: '1', label: '<i>p</i>', color: 'red;background:url(x)' }],
});
const svgTravieso = dibujar2D(travieso, { w: 300, h: 200 }).svg;
check('el texto del autor va escapado', !/<script|<img|<b>|<i>/.test(svgTravieso));
check('un color raro no entra al SVG', !svgTravieso.includes('url(x)'));

// --- 3D ---
const sup = normalizarGrafica({ mode: '3d', functions: [funcionNueva('z', 'x^2 + y^2', '#2563EB')], xMin: -2, xMax: 2, yMin: -2, yMax: 2 });
const r3 = dibujar3D(sup, { w: 500, h: 400, malla: 20 });
check('la superficie se dibuja', r3.svg.startsWith('<svg') && (r3.svg.match(/<path d="M/g) ?? []).length >= 400 && !r3.errores.length);
check('girar cambia el dibujo', dibujar3D(sup, { w: 500, h: 400, malla: 20, rotZ: 90 }).svg !== r3.svg);

// --- Deslizadores y ejemplos ---
check('nombres validos de deslizador', ['a', 'b', 'k'].every(nombreDeslizadorValido));
check('x, y, t, e, pi no valen', !['x', 'y', 't', 'e', 'pi', 'A', 'ab'].some(nombreDeslizadorValido));
for (const ejemplo of EJEMPLOS_GRAFICA) {
  const p = normalizarGrafica({ ...GRAFICA_POR_DEFECTO, ...ejemplo.props });
  const errores = p.mode === '3d' ? dibujar3D(p, { w: 400, h: 300, malla: 12 }).errores : dibujar2D(p, { w: 400, h: 300 }).errores;
  check(`el ejemplo "${ejemplo.label}" funciona`, !errores.length, JSON.stringify(errores));
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nGraficas correctas.');
if (fallos) process.exit(1);
