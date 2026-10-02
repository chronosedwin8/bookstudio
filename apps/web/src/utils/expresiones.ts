/**
 * Interprete de expresiones matematicas para las graficas de funciones.
 *
 * Se escribe aqui en vez de usar `eval` o `new Function` porque la expresion la
 * teclea cualquiera con permiso de edicion, incluido el alumnado, y se ejecuta en
 * el navegador de quien lee el libro. Este interprete solo conoce numeros,
 * operadores, las variables que se le permiten y una lista cerrada de funciones:
 * no hay forma de que una expresion llegue a otra cosa.
 *
 * Escribe como en clase y como en GeoGebra:
 *   2x + 1        3sin(x)       (x+1)(x-1)     x^2 - 4      |x|
 *   sen(x)        raiz(x)       ln(x)          e^(-x^2)     2pi
 * La multiplicacion puede ir implicita, `sen`/`raiz` valen igual que `sin`/`sqrt`
 * y se acepta "y =", "f(x) =" o "z =" delante, que es como lo escribe todo el mundo.
 */

export type Evaluador = (ambito: Record<string, number>) => number;

export interface Compilada {
  ok: true;
  evaluar: Evaluador;
  /** Variables libres que usa, para saber si depende de x, de t o de un deslizador. */
  variables: Set<string>;
}

export interface ErrorExpresion {
  ok: false;
  error: string;
  /** Caracter donde se detecto, para senalarlo. */
  posicion: number;
}

const FUNCIONES: Record<string, { args: number[]; f: (...a: number[]) => number }> = {
  sin: { args: [1], f: Math.sin },
  sen: { args: [1], f: Math.sin },
  cos: { args: [1], f: Math.cos },
  tan: { args: [1], f: Math.tan },
  tg: { args: [1], f: Math.tan },
  cot: { args: [1], f: (x) => 1 / Math.tan(x) },
  sec: { args: [1], f: (x) => 1 / Math.cos(x) },
  csc: { args: [1], f: (x) => 1 / Math.sin(x) },
  asin: { args: [1], f: Math.asin },
  arcsin: { args: [1], f: Math.asin },
  arcsen: { args: [1], f: Math.asin },
  acos: { args: [1], f: Math.acos },
  arccos: { args: [1], f: Math.acos },
  atan: { args: [1], f: Math.atan },
  arctan: { args: [1], f: Math.atan },
  arctg: { args: [1], f: Math.atan },
  sinh: { args: [1], f: Math.sinh },
  senh: { args: [1], f: Math.sinh },
  cosh: { args: [1], f: Math.cosh },
  tanh: { args: [1], f: Math.tanh },
  sqrt: { args: [1], f: Math.sqrt },
  raiz: { args: [1], f: Math.sqrt },
  cbrt: { args: [1], f: Math.cbrt },
  abs: { args: [1], f: Math.abs },
  ln: { args: [1], f: Math.log },
  /** log(x) es decimal; log(b, x) en base b. */
  log: { args: [1, 2], f: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)) },
  exp: { args: [1], f: Math.exp },
  floor: { args: [1], f: Math.floor },
  ceil: { args: [1], f: Math.ceil },
  round: { args: [1], f: Math.round },
  sign: { args: [1], f: Math.sign },
  signo: { args: [1], f: Math.sign },
  min: { args: [2], f: Math.min },
  max: { args: [2], f: Math.max },
  mod: { args: [2], f: (a, b) => ((a % b) + b) % b },
};

const CONSTANTES: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E };

/** Nombres que no se pueden usar para un deslizador: chocarian con lo de arriba. */
export const NOMBRES_RESERVADOS = new Set([...Object.keys(FUNCIONES), ...Object.keys(CONSTANTES)]);

type Token =
  | { t: 'num'; v: number; p: number }
  | { t: 'id'; v: string; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'fin'; p: number };

class ErrorDeSintaxis extends Error {
  constructor(
    message: string,
    public posicion: number,
  ) {
    super(message);
  }
}

function tokenizar(texto: string, permitidas: Set<string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(texto.slice(i));
      if (!m) throw new ErrorDeSintaxis(`Número mal escrito`, i);
      tokens.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Zπ_áéíóúñ]/.test(c)) {
      const m = /^[a-zA-Zπ_áéíóúñ][a-zA-Z0-9_áéíóúñ]*/.exec(texto.slice(i))!;
      const nombre = m[0].toLowerCase();
      // "ax", "xy", "2pix": letras pegadas que son variables. Se separan aqui y no
      // al analizar para que la potencia caiga en la ultima: ax^2 es a·x², no (ax)².
      const conocido = nombre in FUNCIONES || nombre in CONSTANTES || permitidas.has(nombre);
      const trozos = conocido ? null : partirEnLetras(nombre, permitidas);
      if (trozos) {
        let desde = i;
        for (const trozo of trozos) {
          tokens.push({ t: 'id', v: trozo, p: desde });
          desde += trozo.length;
        }
      } else {
        tokens.push({ t: 'id', v: nombre, p: i });
      }
      i += m[0].length;
      continue;
    }
    if (c === '*' && texto[i + 1] === '*') {
      tokens.push({ t: 'op', v: '^', p: i });
      i += 2;
      continue;
    }
    const op = ({ '·': '*', '×': '*', '÷': '/', '−': '-', '²': '²', '³': '³' } as Record<string, string>)[c] ?? c;
    if ('+-*/^(),|!²³'.includes(op)) {
      tokens.push({ t: 'op', v: op, p: i });
      i++;
      continue;
    }
    throw new ErrorDeSintaxis(`No entiendo el símbolo «${c}»`, i);
  }
  tokens.push({ t: 'fin', p: texto.length });
  return tokens;
}

type Nodo = (a: Record<string, number>) => number;

/**
 * Analizador descendente. Precedencia, de menos a mas:
 *   suma/resta < producto/cociente (tambien implicito) < signo < potencia < factorial
 * La potencia asocia a la derecha (2^3^2 = 2^9) y va por encima del signo, asi que
 * -x^2 es -(x^2), como en la pizarra.
 */
class Analizador {
  i = 0;
  variables = new Set<string>();
  /** Barras de valor absoluto abiertas: dentro de ellas una barra cierra. */
  barras = 0;

  constructor(
    private tokens: Token[],
    private permitidas: Set<string>,
  ) {}

  get actual(): Token {
    return this.tokens[this.i];
  }

  esOp(v: string): boolean {
    const t = this.actual;
    return t.t === 'op' && t.v === v;
  }

  esperar(v: string, mensaje: string): void {
    if (!this.esOp(v)) throw new ErrorDeSintaxis(mensaje, this.actual.p);
    this.i++;
  }

  expresion(): Nodo {
    let izq = this.termino();
    while (this.esOp('+') || this.esOp('-')) {
      const op = (this.actual as { v: string }).v;
      this.i++;
      const der = this.termino();
      const a = izq;
      izq = op === '+' ? (s) => a(s) + der(s) : (s) => a(s) - der(s);
    }
    return izq;
  }

  /** ¿Empieza aqui algo que se multiplica sin signo? 2x, 3(x+1), x sin(x). */
  empiezaFactor(): boolean {
    const t = this.actual;
    if (t.t === 'num' || t.t === 'id') return true;
    if (t.t === 'op' && t.v === '(') return true;
    // Una barra abre un valor absoluto solo si no hay uno abierto esperando cierre.
    return t.t === 'op' && t.v === '|' && this.barras === 0;
  }

  termino(): Nodo {
    let izq = this.signo();
    for (;;) {
      if (this.esOp('*') || this.esOp('/')) {
        const op = (this.actual as { v: string }).v;
        this.i++;
        const der = this.signo();
        const a = izq;
        izq = op === '*' ? (s) => a(s) * der(s) : (s) => a(s) / der(s);
      } else if (this.empiezaFactor()) {
        const der = this.potencia();
        const a = izq;
        izq = (s) => a(s) * der(s);
      } else {
        return izq;
      }
    }
  }

  signo(): Nodo {
    if (this.esOp('-')) {
      this.i++;
      const v = this.signo();
      return (s) => -v(s);
    }
    if (this.esOp('+')) {
      this.i++;
      return this.signo();
    }
    return this.potencia();
  }

  potencia(): Nodo {
    const base = this.postfijo();
    if (this.esOp('^')) {
      this.i++;
      const exp = this.signo();
      return (s) => Math.pow(base(s), exp(s));
    }
    return base;
  }

  postfijo(): Nodo {
    let v = this.primario();
    for (;;) {
      if (this.esOp('!')) {
        this.i++;
        const a = v;
        v = (s) => factorial(a(s));
      } else if (this.esOp('²') || this.esOp('³')) {
        const n = this.esOp('²') ? 2 : 3;
        this.i++;
        const a = v;
        v = (s) => Math.pow(a(s), n);
      } else {
        return v;
      }
    }
  }

  primario(): Nodo {
    const t = this.actual;
    if (t.t === 'num') {
      this.i++;
      const n = t.v;
      return () => n;
    }
    if (t.t === 'op' && t.v === '(') {
      this.i++;
      const dentro = this.expresion();
      this.esperar(')', 'Falta cerrar un paréntesis');
      return dentro;
    }
    if (t.t === 'op' && t.v === '|') {
      this.i++;
      this.barras++;
      const dentro = this.expresion();
      this.barras--;
      this.esperar('|', 'Falta cerrar el valor absoluto con |');
      return (s) => Math.abs(dentro(s));
    }
    if (t.t === 'id') return this.identificador(t);
    if (t.t === 'fin') throw new ErrorDeSintaxis('La expresión está incompleta', t.p);
    throw new ErrorDeSintaxis(`Sobra «${t.v}»`, t.p);
  }

  identificador(t: { v: string; p: number }): Nodo {
    this.i++;
    const nombre = t.v;

    const fn = FUNCIONES[nombre];
    if (fn) {
      if (!this.esOp('(')) {
        // sin x, sen 2x: sin parentesis se aplica al factor siguiente, como en la pizarra.
        const arg = this.potencia();
        if (!fn.args.includes(1)) throw new ErrorDeSintaxis(`${nombre} necesita paréntesis`, t.p);
        return (s) => fn.f(arg(s));
      }
      this.i++;
      const args: Nodo[] = [this.expresion()];
      while (this.esOp(',')) {
        this.i++;
        args.push(this.expresion());
      }
      this.esperar(')', `Falta cerrar el paréntesis de ${nombre}`);
      if (!fn.args.includes(args.length)) {
        throw new ErrorDeSintaxis(`${nombre} lleva ${fn.args.join(' o ')} dato(s)`, t.p);
      }
      if (args.length === 1) {
        const [a] = args;
        return (s) => fn.f(a(s));
      }
      const [a, b] = args;
      return (s) => fn.f(a(s), b(s));
    }

    if (nombre in CONSTANTES && !this.permitidas.has(nombre)) {
      const c = CONSTANTES[nombre];
      return () => c;
    }
    if (this.permitidas.has(nombre)) {
      this.variables.add(nombre);
      return (s) => s[nombre] ?? NaN;
    }

    // "sinx", "senx": una funcion pegada a su variable.
    const pegada = Object.keys(FUNCIONES).find((f) => nombre.startsWith(f) && partirEnLetras(nombre.slice(f.length), this.permitidas));
    if (pegada) {
      throw new ErrorDeSintaxis(`¿Querías decir ${pegada}(${nombre.slice(pegada.length)})?`, t.p);
    }
    const disponibles = [...this.permitidas].sort().join(', ');
    throw new ErrorDeSintaxis(
      `No conozco «${nombre}»${disponibles ? `. Puedes usar ${disponibles}` : ''}`,
      t.p,
    );
  }
}

/** "xy" -> ["x","y"] si cada letra es una variable permitida o una constante. */
function partirEnLetras(nombre: string, permitidas: Set<string>): string[] | null {
  if (!nombre) return null;
  const trozos: string[] = [];
  let resto = nombre;
  while (resto) {
    if (resto.startsWith('pi')) {
      trozos.push('pi');
      resto = resto.slice(2);
      continue;
    }
    const letra = resto[0];
    if (!permitidas.has(letra) && !(letra in CONSTANTES)) return null;
    trozos.push(letra);
    resto = resto.slice(1);
  }
  return trozos;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/** Quita "y =", "f(x) =", "z =", "g(t)=" del principio: se escribe asi y no estorba. */
export function quitarIgualInicial(texto: string): { resto: string; desplazamiento: number } {
  const m = /^\s*(?:[a-zA-Z](?:\s*\(\s*[a-zA-Z](?:\s*,\s*[a-zA-Z])?\s*\))?)\s*=(?!=)/.exec(texto);
  if (!m) return { resto: texto, desplazamiento: 0 };
  return { resto: texto.slice(m[0].length), desplazamiento: m[0].length };
}

/**
 * Compila una expresion con las variables permitidas (x, t, los deslizadores...).
 * Nunca lanza: devuelve el error con un mensaje para quien la escribio.
 */
export function compilar(texto: string, permitidas: Iterable<string>): Compilada | ErrorExpresion {
  const { resto, desplazamiento } = quitarIgualInicial(texto);
  if (!resto.trim()) return { ok: false, error: 'Escribe una expresión', posicion: 0 };
  if (resto.length > 500) return { ok: false, error: 'La expresión es demasiado larga', posicion: 500 };
  try {
    const conjunto = new Set(permitidas);
    const a = new Analizador(tokenizar(resto, conjunto), conjunto);
    const nodo = a.expresion();
    if (a.actual.t !== 'fin') {
      const t = a.actual;
      throw new ErrorDeSintaxis(t.t === 'op' && t.v === ')' ? 'Sobra un paréntesis de cierre' : 'Sobra algo al final', t.p);
    }
    const evaluar: Evaluador = (ambito) => {
      const v = nodo(ambito);
      return Number.isFinite(v) ? v : NaN;
    };
    return { ok: true, evaluar, variables: a.variables };
  } catch (err) {
    if (err instanceof ErrorDeSintaxis) {
      return { ok: false, error: err.message, posicion: err.posicion + desplazamiento };
    }
    return { ok: false, error: 'No se pudo leer la expresión', posicion: 0 };
  }
}

/** Atajo: un numero o NaN, sin importar si la expresion era valida. */
export function valorDe(texto: string, ambito: Record<string, number> = {}): number {
  const c = compilar(texto, Object.keys(ambito));
  return c.ok ? c.evaluar(ambito) : NaN;
}
