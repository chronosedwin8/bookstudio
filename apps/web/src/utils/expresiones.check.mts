/**
 * Comprobacion del interprete de expresiones. Se ejecuta con:
 *   npx tsx apps/web/src/utils/expresiones.check.mts
 *
 * Lo que mas se equivoca en un interprete casero es la precedencia y la
 * multiplicacion implicita: -x^2, 2^3^2, 2x, 3sin(x), (x+1)(x-1). Y lo que mas
 * importa es que nada fuera de la lista cerrada se pueda ejecutar.
 */
import { compilar, quitarIgualInicial, valorDe } from './expresiones.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};
const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const en = (expr: string, ambito: Record<string, number> = {}) => valorDe(expr, ambito);
const igual = (expr: string, esperado: number, ambito: Record<string, number> = {}) => {
  const v = en(expr, ambito);
  check(`${expr}${Object.keys(ambito).length ? ' con ' + JSON.stringify(ambito) : ''} = ${esperado}`, cerca(v, esperado), String(v));
};

// --- Aritmetica y precedencia ---
igual('1 + 2 * 3', 7);
igual('(1 + 2) * 3', 9);
igual('2^3^2', 512);
igual('-x^2', -9, { x: 3 });
igual('(-x)^2', 9, { x: 3 });
igual('2^-1', 0.5);
igual('10 / 4 / 5', 0.5);
igual('7 - 3 - 2', 2);
igual('1.5e2', 150);
igual('.5 + .5', 1);

// --- Multiplicacion implicita ---
igual('2x + 1', 7, { x: 3 });
igual('3sin(x)', 3, { x: Math.PI / 2 });
igual('(x+1)(x-1)', 8, { x: 3 });
igual('2(x+1)', 8, { x: 3 });
igual('x(x+1)', 12, { x: 3 });
igual('xy', 6, { x: 2, y: 3 });
igual('2pi', 2 * Math.PI);
igual('ax^2 + bx + c', 2 * 9 + 3 + 1, { a: 2, b: 1, c: 1, x: 3 });

// --- Funciones, en ingles y en espanol ---
igual('sen(x)', 1, { x: Math.PI / 2 });
igual('raiz(16)', 4);
igual('sqrt(2)^2', 2);
igual('ln(e)', 1);
igual('log(100)', 2);
igual('log(2, 8)', 3);
igual('abs(-3)', 3);
igual('|x - 5|', 2, { x: 3 });
igual('2|x|', 6, { x: -3 });
igual('e^(-x^2)', 1, { x: 0 });
igual('max(2, 5)', 5);
igual('mod(-1, 3)', 2);
igual('5!', 120);
igual('x²', 9, { x: 3 });
igual('x**2', 9, { x: 3 });
igual('2·3', 6);
igual('sin x', Math.sin(2), { x: 2 });

// --- Lo que escribe la gente delante ---
igual('y = 2x', 4, { x: 2 });
igual('f(x) = x^2', 4, { x: 2 });
igual('z = x + y', 3, { x: 1, y: 2 });
check('quitar "g(t)="', quitarIgualInicial('g(t)= t').resto.trim() === 't');

// --- Errores con mensaje ---
const malos: Array<[string, string]> = [
  ['2 +', 'incompleta'],
  ['(x + 1', 'paréntesis'],
  ['x + 1)', 'paréntesis'],
  ['sinx', 'sin(x)'],
  ['foo(x)', 'No conozco'],
  ['2 $ 3', 'símbolo'],
  ['', 'Escribe'],
];
for (const [expr, trozo] of malos) {
  const c = compilar(expr, ['x']);
  check(`"${expr}" da error claro`, !c.ok && c.error.includes(trozo), c.ok ? 'compilo' : c.error);
}

// --- Nada fuera de la lista cerrada ---
for (const peligro of ['constructor', 'alert(1)', 'window', 'this', 'process.exit(1)', '__proto__', 'x.constructor']) {
  const c = compilar(peligro, ['x']);
  check(`"${peligro}" no compila`, !c.ok);
}

// --- Variables que usa ---
const c = compilar('a sin(b x) + t', ['x', 't', 'a', 'b']);
check('detecta las variables', c.ok && [...c.variables].sort().join(',') === 'a,b,t,x');
check('un resultado infinito sale NaN', Number.isNaN(en('1/0')));
check('una variable sin valor sale NaN', Number.isNaN((compilar('x + a', ['x', 'a']) as { evaluar: (s: Record<string, number>) => number }).evaluar({ x: 1 })));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nInterprete correcto.');
if (fallos) process.exit(1);
