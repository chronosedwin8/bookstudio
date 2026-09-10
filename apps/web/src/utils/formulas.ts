/**
 * Formulas listas para insertar, agrupadas por materia.
 *
 * Van con `String.raw` y no entre comillas normales, y esto no es un capricho:
 * en una cadena de TypeScript la barra invertida no es una barra invertida. Asi
 * escrito, `'\frac{a}{b}'` no contiene ningun `\frac`, contiene el caracter de
 * avance de pagina seguido de "rac{a}{b}", que es exactamente lo que se veia en
 * la pagina. Lo mismo le pasaba a `\sqrt`, `\sum`, `\int` y `\begin`, mientras
 * que las que no llevan barra (una potencia, Pitagoras) funcionaban: de ahi que
 * fallaran "algunas" y no todas.
 *
 * `formulas.check.mts` compila todas con KaTeX en cada `npm run test:unit`, que
 * es la unica forma de que esto no vuelva a colarse.
 */

export interface Formula {
  label: string;
  latex: string;
}

export interface GrupoFormulas {
  label: string;
  formulas: Formula[];
}

export const GRUPOS_FORMULAS: GrupoFormulas[] = [
  {
    label: 'Numeros y algebra',
    formulas: [
      { label: 'Fraccion', latex: String.raw`\frac{a}{b}` },
      { label: 'Numero mixto', latex: String.raw`2\frac{1}{3}` },
      { label: 'Potencia', latex: String.raw`x^{2}` },
      { label: 'Raiz cuadrada', latex: String.raw`\sqrt{x}` },
      { label: 'Raiz n-esima', latex: String.raw`\sqrt[n]{x}` },
      { label: 'Porcentaje', latex: String.raw`\frac{p}{100}\cdot t` },
      { label: 'Proporcion', latex: String.raw`\frac{a}{b}=\frac{c}{d}` },
      { label: 'Ecuacion', latex: String.raw`ax^{2}+bx+c=0` },
      { label: 'Formula general', latex: String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}` },
      { label: 'Binomio', latex: String.raw`(a+b)^{2}=a^{2}+2ab+b^{2}` },
      { label: 'Logaritmo', latex: String.raw`\log_{b}(x)=y` },
      { label: 'Valor absoluto', latex: String.raw`\left| x \right|` },
      { label: 'Desigualdad', latex: String.raw`x \geq 0` },
    ],
  },
  {
    label: 'Geometria',
    formulas: [
      { label: 'Pitagoras', latex: String.raw`a^{2}+b^{2}=c^{2}` },
      { label: 'Area del circulo', latex: String.raw`A=\pi r^{2}` },
      { label: 'Longitud de circunferencia', latex: String.raw`L=2\pi r` },
      { label: 'Area del triangulo', latex: String.raw`A=\frac{b \cdot h}{2}` },
      { label: 'Area del trapecio', latex: String.raw`A=\frac{(B+b) \cdot h}{2}` },
      { label: 'Volumen del prisma', latex: String.raw`V=a \cdot b \cdot c` },
      { label: 'Volumen de la esfera', latex: String.raw`V=\frac{4}{3}\pi r^{3}` },
      { label: 'Volumen del cilindro', latex: String.raw`V=\pi r^{2} h` },
      { label: 'Tales', latex: String.raw`\frac{AB}{A'B'}=\frac{AC}{A'C'}` },
      { label: 'Angulo', latex: String.raw`\alpha + \beta + \gamma = 180^{\circ}` },
    ],
  },
  {
    label: 'Trigonometria',
    formulas: [
      { label: 'Seno', latex: String.raw`\sin \alpha = \frac{\text{cateto opuesto}}{\text{hipotenusa}}` },
      { label: 'Coseno', latex: String.raw`\cos \alpha = \frac{\text{cateto adyacente}}{\text{hipotenusa}}` },
      { label: 'Tangente', latex: String.raw`\tan \alpha = \frac{\sin \alpha}{\cos \alpha}` },
      { label: 'Identidad fundamental', latex: String.raw`\sin^{2}\theta + \cos^{2}\theta = 1` },
    ],
  },
  {
    label: 'Analisis',
    formulas: [
      { label: 'Sumatorio', latex: String.raw`\sum_{i=1}^{n} i` },
      { label: 'Productorio', latex: String.raw`\prod_{i=1}^{n} i` },
      { label: 'Integral', latex: String.raw`\int_{a}^{b} f(x)\,dx` },
      { label: 'Limite', latex: String.raw`\lim_{x \to \infty} f(x)` },
      { label: 'Derivada', latex: String.raw`\frac{dy}{dx}` },
      { label: 'Derivada parcial', latex: String.raw`\frac{\partial f}{\partial x}` },
      { label: 'Funcion', latex: String.raw`f(x)=mx+n` },
    ],
  },
  {
    label: 'Matrices y sistemas',
    formulas: [
      { label: 'Matriz', latex: String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}` },
      { label: 'Determinante', latex: String.raw`\begin{vmatrix} a & b \\ c & d \end{vmatrix}` },
      {
        label: 'Sistema de ecuaciones',
        latex: String.raw`\begin{cases} x + y = 3 \\ x - y = 1 \end{cases}`,
      },
      { label: 'Vector', latex: String.raw`\vec{v} = (x, y, z)` },
    ],
  },
  {
    label: 'Conjuntos y logica',
    formulas: [
      { label: 'Pertenece', latex: String.raw`x \in A` },
      { label: 'Union', latex: String.raw`A \cup B` },
      { label: 'Interseccion', latex: String.raw`A \cap B` },
      { label: 'Subconjunto', latex: String.raw`A \subset B` },
      { label: 'Distinto', latex: String.raw`a \neq b` },
      { label: 'Aproximado', latex: String.raw`\pi \approx 3{,}1416` },
    ],
  },
  {
    label: 'Ciencias',
    formulas: [
      { label: 'Velocidad', latex: String.raw`v=\frac{d}{t}` },
      { label: 'Fuerza', latex: String.raw`F = m \cdot a` },
      { label: 'Densidad', latex: String.raw`\rho = \frac{m}{V}` },
      { label: 'Energia', latex: String.raw`E = mc^{2}` },
      { label: 'Reaccion quimica', latex: String.raw`2H_{2} + O_{2} \rightarrow 2H_{2}O` },
      { label: 'Ley de Ohm', latex: String.raw`V = I \cdot R` },
    ],
  },
  {
    label: 'Estadistica',
    formulas: [
      { label: 'Media', latex: String.raw`\bar{x}=\frac{1}{n}\sum_{i=1}^{n} x_{i}` },
      { label: 'Probabilidad', latex: String.raw`P(A)=\frac{\text{casos favorables}}{\text{casos posibles}}` },
      { label: 'Desviacion tipica', latex: String.raw`\sigma=\sqrt{\frac{\sum (x_{i}-\bar{x})^{2}}{n}}` },
    ],
  },
];

/** Todas en una lista, para comprobarlas de una pasada. */
export const FORMULAS: Formula[] = GRUPOS_FORMULAS.flatMap((g) => g.formulas);
