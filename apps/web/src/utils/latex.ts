/**
 * Ayudas para escribir LaTeX y para pasar de una formula a una grafica.
 */

/* ------------------------------------------------- de formula a funcion -- */

/** Entre parentesis solo si hace falta: "2" y "x" no los necesitan, "x+1" si. */
const envolver = (t: string) => (/^[\w.]+$/.test(t) ? t : `(${t})`);

/** Lee un grupo {...} empezando en `i` (que apunta a la llave). */
function grupo(texto: string, i: number): { dentro: string; fin: number } | null {
  if (texto[i] !== '{') return null;
  let nivel = 0;
  for (let k = i; k < texto.length; k++) {
    if (texto[k] === '{') nivel++;
    else if (texto[k] === '}') {
      nivel--;
      if (nivel === 0) return { dentro: texto.slice(i + 1, k), fin: k + 1 };
    }
  }
  return null;
}

/** Un argumento de \frac o ^: un grupo entre llaves o un solo caracter. */
function argumento(texto: string, i: number): { dentro: string; fin: number } | null {
  while (texto[i] === ' ') i++;
  if (i >= texto.length) return null;
  if (texto[i] === '{') return grupo(texto, i);
  if (texto[i] === '\\') {
    const m = /^\\[a-zA-Z]+/.exec(texto.slice(i));
    if (m) return { dentro: m[0], fin: i + m[0].length };
  }
  return { dentro: texto[i], fin: i + 1 };
}

const COMANDOS: Record<string, string> = {
  '\\cdot': '*',
  '\\times': '*',
  '\\div': '/',
  '\\pi': 'pi',
  '\\sin': 'sin',
  '\\cos': 'cos',
  '\\tan': 'tan',
  '\\cot': 'cot',
  '\\sec': 'sec',
  '\\csc': 'csc',
  '\\arcsin': 'asin',
  '\\arccos': 'acos',
  '\\arctan': 'atan',
  '\\sinh': 'sinh',
  '\\cosh': 'cosh',
  '\\tanh': 'tanh',
  '\\ln': 'ln',
  '\\log': 'log',
  '\\exp': 'exp',
  '\\left': '',
  '\\right': '',
  '\\,': '',
  '\\;': '',
  '\\!': '',
  '\\ ': '',
};

/**
 * Convierte una formula en LaTeX a una expresion que entiende el interprete de
 * graficas. Cubre lo que se escribe para una funcion de una variable: fracciones,
 * raices, potencias, funciones trigonometricas, logaritmos, valor absoluto y pi.
 * Devuelve null si encuentra algo que no sabe traducir: mejor no graficar que
 * graficar otra cosa.
 */
export function latexAExpresion(latex: string): string | null {
  // y = ..., f(x) = ...: se queda la parte derecha. Cualquier otro "=" (una
  // ecuacion, el i=1 de una sumatoria) no es una funcion que se pueda dibujar.
  const s = latex.trim().replace(/^[a-zA-Z](?:\s*\(\s*x\s*\))?\s*=/, '');
  if (!s.trim() || s.includes('=')) return null;

  const traducir = (t: string): string | null => {
    let salida = '';
    let i = 0;
    while (i < t.length) {
      const c = t[i];
      if (c === '\\') {
        const m = /^\\([a-zA-Z]+|[,;! |{}])/.exec(t.slice(i));
        if (!m) return null;
        const cmd = m[0];
        i += cmd.length;
        if (cmd === '\\frac' || cmd === '\\dfrac' || cmd === '\\tfrac') {
          const a = argumento(t, i);
          if (!a) return null;
          const b = argumento(t, a.fin);
          if (!b) return null;
          const na = traducir(a.dentro);
          const nb = traducir(b.dentro);
          if (na === null || nb === null) return null;
          salida += `(${envolver(na)}/${envolver(nb)})`;
          i = b.fin;
        } else if (cmd === '\\sqrt') {
          let indice: string | null = null;
          if (t[i] === '[') {
            const cierre = t.indexOf(']', i);
            if (cierre < 0) return null;
            indice = traducir(t.slice(i + 1, cierre));
            if (indice === null) return null;
            i = cierre + 1;
          }
          const a = argumento(t, i);
          if (!a) return null;
          const na = traducir(a.dentro);
          if (na === null) return null;
          salida += indice ? `(${envolver(na)}^(1/${envolver(indice)}))` : `sqrt(${na})`;
          i = a.fin;
        } else if (cmd === '\\left|' || cmd === '\\right|' || cmd === '\\vert' || cmd === '\\lvert' || cmd === '\\rvert') {
          salida += '|';
        } else if (cmd === '\\{' || cmd === '\\}') {
          salida += cmd === '\\{' ? '(' : ')';
        } else if (cmd in COMANDOS) {
          salida += COMANDOS[cmd];
          // \sin^2 x no se traduce bien sin parentesis: mejor no inventar.
          if (/^\\(sin|cos|tan|ln|log)$/.test(cmd) && t[i] === '^') return null;
        } else {
          return null;
        }
        continue;
      }
      if (c === '^') {
        const a = argumento(t, i + 1);
        if (!a) return null;
        const na = traducir(a.dentro);
        if (na === null) return null;
        salida += `^${envolver(na)}`;
        i = a.fin;
        continue;
      }
      if (c === '{') {
        const g = grupo(t, i);
        if (!g) return null;
        const n = traducir(g.dentro);
        if (n === null) return null;
        salida += `(${n})`;
        i = g.fin;
        continue;
      }
      if (c === '_' ) return null;
      salida += c === '[' ? '(' : c === ']' ? ')' : c;
      i++;
    }
    return salida;
  };

  const resultado = traducir(s);
  return resultado === null ? null : resultado.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------- paleta de LaTeX -- */

/**
 * Lo que inserta cada boton. `▢` marca donde queda el cursor; si habia texto
 * seleccionado, ocupa ese hueco (seleccionar "x+1" y pulsar raiz da \sqrt{x+1}).
 */
export interface SimboloLatex {
  /** Lo que se ve en el boton, compuesto con KaTeX. */
  vista: string;
  inserta: string;
  titulo: string;
}

const s = (vista: string, inserta: string, titulo: string): SimboloLatex => ({ vista, inserta, titulo });

export const PALETA_LATEX: Array<{ label: string; simbolos: SimboloLatex[] }> = [
  {
    label: 'Básico',
    simbolos: [
      s(String.raw`\frac{a}{b}`, String.raw`\frac{▢}{}`, 'Fracción'),
      s(String.raw`x^{n}`, String.raw`^{▢}`, 'Potencia'),
      s(String.raw`x_{n}`, String.raw`_{▢}`, 'Subíndice'),
      s(String.raw`\sqrt{x}`, String.raw`\sqrt{▢}`, 'Raíz cuadrada'),
      s(String.raw`\sqrt[n]{x}`, String.raw`\sqrt[n]{▢}`, 'Raíz n-ésima'),
      s(String.raw`\left( x \right)`, String.raw`\left( ▢ \right)`, 'Paréntesis que crecen'),
      s(String.raw`\left| x \right|`, String.raw`\left| ▢ \right|`, 'Valor absoluto'),
      s(String.raw`\cdot`, String.raw`\cdot `, 'Por'),
      s(String.raw`\times`, String.raw`\times `, 'Por (aspa)'),
      s(String.raw`\div`, String.raw`\div `, 'Entre'),
      s(String.raw`\pm`, String.raw`\pm `, 'Más o menos'),
      s(String.raw`\overline{x}`, String.raw`\overline{▢}`, 'Barra encima'),
      s(String.raw`\vec{v}`, String.raw`\vec{▢}`, 'Vector'),
      s(String.raw`x^{\circ}`, String.raw`^{\circ}`, 'Grados'),
    ],
  },
  {
    label: 'Relaciones',
    simbolos: [
      s('=', '=', 'Igual'),
      s(String.raw`\neq`, String.raw`\neq `, 'Distinto'),
      s(String.raw`\approx`, String.raw`\approx `, 'Aproximadamente'),
      s('<', '<', 'Menor'),
      s('>', '>', 'Mayor'),
      s(String.raw`\leq`, String.raw`\leq `, 'Menor o igual'),
      s(String.raw`\geq`, String.raw`\geq `, 'Mayor o igual'),
      s(String.raw`\equiv`, String.raw`\equiv `, 'Equivalente'),
      s(String.raw`\propto`, String.raw`\propto `, 'Proporcional'),
      s(String.raw`\parallel`, String.raw`\parallel `, 'Paralela'),
      s(String.raw`\perp`, String.raw`\perp `, 'Perpendicular'),
      s(String.raw`\sim`, String.raw`\sim `, 'Semejante'),
      s(String.raw`\cong`, String.raw`\cong `, 'Congruente'),
    ],
  },
  {
    label: 'Griego',
    simbolos: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'omega', 'Delta', 'Sigma', 'Omega'].map(
      (l) => s(`\\${l}`, `\\${l} `, l),
    ),
  },
  {
    label: 'Cálculo',
    simbolos: [
      s(String.raw`\lim_{x \to a}`, String.raw`\lim_{x \to ▢}`, 'Límite'),
      s(String.raw`\frac{d}{dx}`, String.raw`\frac{d}{dx}`, 'Derivada'),
      s(String.raw`f'(x)`, String.raw`f'(x)`, 'Derivada (prima)'),
      s(String.raw`\int`, String.raw`\int ▢ \, dx`, 'Integral'),
      s(String.raw`\int_{a}^{b}`, String.raw`\int_{▢}^{} \, dx`, 'Integral definida'),
      s(String.raw`\sum_{i=1}^{n}`, String.raw`\sum_{i=1}^{▢}`, 'Sumatoria'),
      s(String.raw`\prod`, String.raw`\prod_{i=1}^{▢}`, 'Productorio'),
      s(String.raw`\infty`, String.raw`\infty`, 'Infinito'),
      s(String.raw`\partial`, String.raw`\partial `, 'Derivada parcial'),
      s(String.raw`\nabla`, String.raw`\nabla `, 'Nabla'),
      s(String.raw`\log_{b}`, String.raw`\log_{▢}`, 'Logaritmo en base b'),
      s(String.raw`\ln`, String.raw`\ln `, 'Logaritmo natural'),
      s(String.raw`\sin`, String.raw`\sin `, 'Seno'),
      s(String.raw`\cos`, String.raw`\cos `, 'Coseno'),
      s(String.raw`\tan`, String.raw`\tan `, 'Tangente'),
    ],
  },
  {
    label: 'Conjuntos y lógica',
    simbolos: [
      s(String.raw`\in`, String.raw`\in `, 'Pertenece'),
      s(String.raw`\notin`, String.raw`\notin `, 'No pertenece'),
      s(String.raw`\subset`, String.raw`\subset `, 'Subconjunto'),
      s(String.raw`\cup`, String.raw`\cup `, 'Unión'),
      s(String.raw`\cap`, String.raw`\cap `, 'Intersección'),
      s(String.raw`\emptyset`, String.raw`\emptyset `, 'Vacío'),
      s(String.raw`\mathbb{N}`, String.raw`\mathbb{N}`, 'Naturales'),
      s(String.raw`\mathbb{Z}`, String.raw`\mathbb{Z}`, 'Enteros'),
      s(String.raw`\mathbb{Q}`, String.raw`\mathbb{Q}`, 'Racionales'),
      s(String.raw`\mathbb{R}`, String.raw`\mathbb{R}`, 'Reales'),
      s(String.raw`\forall`, String.raw`\forall `, 'Para todo'),
      s(String.raw`\exists`, String.raw`\exists `, 'Existe'),
      s(String.raw`\Rightarrow`, String.raw`\Rightarrow `, 'Implica'),
      s(String.raw`\Leftrightarrow`, String.raw`\Leftrightarrow `, 'Si y solo si'),
      s(String.raw`\to`, String.raw`\to `, 'Tiende a'),
    ],
  },
  {
    label: 'Estructuras',
    simbolos: [
      s(String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`, String.raw`\begin{pmatrix} ▢ & \\  & \end{pmatrix}`, 'Matriz 2×2'),
      s(
        String.raw`\begin{pmatrix} a & b & c \\ d & e & f \\ g & h & i \end{pmatrix}`,
        String.raw`\begin{pmatrix} ▢ & & \\ & & \\ & & \end{pmatrix}`,
        'Matriz 3×3',
      ),
      s(String.raw`\begin{vmatrix} a & b \\ c & d \end{vmatrix}`, String.raw`\begin{vmatrix} ▢ & \\  & \end{vmatrix}`, 'Determinante'),
      s(String.raw`\begin{cases} x \\ y \end{cases}`, String.raw`\begin{cases} ▢ \\  \end{cases}`, 'Sistema / a trozos'),
      s(String.raw`\binom{n}{k}`, String.raw`\binom{▢}{}`, 'Número combinatorio'),
      s(String.raw`\overset{\frown}{AB}`, String.raw`\overset{\frown}{▢}`, 'Arco'),
      s(String.raw`\angle`, String.raw`\angle `, 'Ángulo'),
      s(String.raw`\triangle`, String.raw`\triangle `, 'Triángulo'),
      s(String.raw`\text{abc}`, String.raw`\text{▢}`, 'Texto normal dentro de la fórmula'),
    ],
  },
];

/**
 * Inserta un simbolo en el texto, en la seleccion. Devuelve el texto nuevo y
 * donde poner el cursor: en el hueco ▢ (o detras de lo seleccionado, si lo
 * ocupo), o al final de lo insertado.
 */
export function insertarSimbolo(
  texto: string,
  inicio: number,
  fin: number,
  inserta: string,
): { texto: string; cursor: number } {
  const seleccion = texto.slice(inicio, fin);
  const hueco = inserta.indexOf('▢');
  const pieza = hueco >= 0 ? inserta.replace('▢', seleccion) : inserta;
  const nuevo = texto.slice(0, inicio) + pieza + texto.slice(fin);
  const cursor = hueco >= 0 ? inicio + hueco + seleccion.length : inicio + pieza.length;
  return { texto: nuevo, cursor };
}
