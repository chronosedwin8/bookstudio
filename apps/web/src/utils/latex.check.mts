/**
 * Comprobacion de las ayudas de LaTeX. Se ejecuta con:
 *   npx tsx apps/web/src/utils/latex.check.mts
 *
 * La traduccion de formula a funcion se comprueba evaluando: lo que importa no es
 * el texto que sale, sino que la grafica dibuje la misma funcion que la formula.
 */
import katex from 'katex';
import { valorDe } from './expresiones.js';
import { PALETA_LATEX, insertarSimbolo, latexAExpresion } from './latex.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const casos: Array<[string, (x: number) => number]> = [
  [String.raw`y = x^{2} - 4`, (x) => x * x - 4],
  [String.raw`f(x)=\frac{1}{2}x^2`, (x) => 0.5 * x * x],
  [String.raw`\sqrt{x+1}`, (x) => Math.sqrt(x + 1)],
  [String.raw`\sqrt[3]{x}`, (x) => Math.cbrt(x)],
  [String.raw`2\sin(x) + \cos x`, (x) => 2 * Math.sin(x) + Math.cos(x)],
  [String.raw`e^{-x^{2}}`, (x) => Math.exp(-x * x)],
  [String.raw`\left| x - 1 \right|`, (x) => Math.abs(x - 1)],
  [String.raw`\frac{x^2-1}{x+2}`, (x) => (x * x - 1) / (x + 2)],
  [String.raw`3x \cdot \pi`, (x) => 3 * x * Math.PI],
  [String.raw`\ln(x) + \log(x)`, (x) => Math.log(x) + Math.log10(x)],
];
for (const [latex, f] of casos) {
  const expr = latexAExpresion(latex);
  const ok = expr !== null && [0.5, 1.3, 2.7].every((x) => Math.abs(valorDe(expr, { x }) - f(x)) < 1e-9);
  check(`${latex} se grafica bien`, ok, String(expr));
}
for (const raro of [String.raw`\sum_{i=1}^{n} i`, String.raw`x_{1} + 2`, String.raw`\int_0^1 x\,dx`, String.raw`\sin^2 x`]) {
  check(`${raro} no se traduce (mejor que mal)`, latexAExpresion(raro) === null, String(latexAExpresion(raro)));
}

// Cada boton de la paleta compone con KaTeX, en el boton y una vez insertado.
let malos = 0;
for (const grupo of PALETA_LATEX) {
  for (const simbolo of grupo.simbolos) {
    for (const fuente of [simbolo.vista, simbolo.inserta.replace('▢', 'x')]) {
      try {
        katex.renderToString(fuente, { throwOnError: true, strict: 'ignore' });
      } catch (err) {
        malos++;
        console.log(`    ${grupo.label} / ${simbolo.titulo}: ${(err as Error).message}`);
      }
    }
  }
}
check('toda la paleta compone con KaTeX', malos === 0, `${malos} mal`);

const i1 = insertarSimbolo('a + b', 4, 5, String.raw`\sqrt{▢}`);
check('la seleccion entra en el hueco', i1.texto === String.raw`a + \sqrt{b}` && i1.cursor === 11, JSON.stringify(i1));
const i2 = insertarSimbolo('x', 1, 1, String.raw`\frac{▢}{}`);
check('sin seleccion el cursor queda en el hueco', i2.texto === String.raw`x\frac{}{}` && i2.cursor === 7, JSON.stringify(i2));
const i3 = insertarSimbolo('x', 1, 1, String.raw`\pi `);
check('un simbolo sin hueco deja el cursor detras', i3.cursor === 5);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nLaTeX correcto.');
if (fallos) process.exit(1);
