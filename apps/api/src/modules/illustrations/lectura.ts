import {
  DISTRIBUCIONES,
  escenaSchema,
  MAXIMO_PERSONAJES,
  VERSION_CATALOGO,
  VERSION_ESCENA,
  type AnalizarInput,
  type Escena,
  type PersonajeEscena,
} from './illustrations.schemas.js';

/**
 * Leer una descripcion y sacar de ella una escena, aqui mismo.
 *
 * Vive aparte del servicio a proposito: no toca la base de datos, ni la
 * configuracion, ni la red. Asi se puede probar sola, y asi el dia que la IA
 * falle este camino sigue disponible sin arrastrar medio servidor.
 */

// ---------------------------------------------------------------- palabras

const normalizar = (t: string): string =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const contiene = (t: string, palabras: string[]): boolean => palabras.some((p) => t.includes(p));

/** Numeros escritos, que es como se cuenta la gente en una frase normal. */
const NUMEROS: Array<[string[], number]> = [
  [['un ', 'una ', 'uno ', 'a single', 'one '], 1],
  [['dos ', 'two ', 'par de', 'pareja'], 2],
  [['tres ', 'three '], 3],
  [['cuatro ', 'four ', 'varios', 'varias', 'grupo', 'group', 'equipo'], 4],
];

const ALUMNADO = /(estudiantes?|alumn[oa]s?|nin[oa]s?|chic[oa]s?|companer[oa]s?|students?|personas?)/g;
const DOCENTE = /(profesor[ae]?s?|docentes?|maestr[oa]s?|teachers?)/;

/**
 * El numero que acompana a una palabra, mirando lo que hay justo antes.
 *
 * Buscar numeros sueltos por toda la frase no vale: en "un profesor explicando a
 * dos estudiantes" el primero que aparece es "un", y en "tres estudiantes en una
 * actividad" aparece "una". Lo que cuenta es el numero pegado al sustantivo.
 */
function numeroJuntoA(t: string, indice: number): number | null {
  const antes = t.slice(Math.max(0, indice - 26), indice);
  for (const [palabras, cuantos] of NUMEROS) {
    if (palabras.some((p) => antes.includes(p))) return cuantos;
  }
  const digito = /([1-9])[^0-9]*$/.exec(antes);
  return digito ? Math.min(Number(digito[1]), MAXIMO_PERSONAJES) : null;
}

/**
 * Cuanta gente sale.
 *
 * Se cuenta por separado a quien ensena y a quien aprende, porque casi siempre
 * llevan numeros distintos en la misma frase.
 */
function cuantaGente(t: string): { alumnado: number; docente: boolean } {
  const docente = DOCENTE.test(t);

  ALUMNADO.lastIndex = 0;
  let alumnado = 0;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = ALUMNADO.exec(t)) !== null) {
    const numero = numeroJuntoA(t, coincidencia.index);
    // Un plural sin numero es "unos cuantos"; tres se lee como grupo sin llenar
    const plural = coincidencia[0].endsWith('s');
    alumnado = Math.max(alumnado, numero ?? (plural ? 3 : 1));
  }

  if (alumnado === 0 && !docente) alumnado = 1;
  return { alumnado: Math.min(alumnado, MAXIMO_PERSONAJES), docente };
}

/** El objeto que trae consigo cada pose, cuando la pose lo implica. */
const OBJETO_DE_LA_POSE: Partial<Record<PersonajeEscena['pose'], Escena['objetos'][number]['objeto']>> = {
  using_tablet: 'tablet',
  reading: 'book',
};

const HAY_DOCENTE = ['profesor', 'profesora', 'docente', 'maestr', 'teacher', 'ensena', 'explica'];

const POSE_POR_PALABRA: Array<[string[], PersonajeEscena['pose']]> = [
  [['tablet', 'tableta', 'ipad'], 'using_tablet'],
  [['leyendo', 'lee ', 'lectura', 'leer', 'reading', 'libro'], 'reading'],
  [['senalando', 'senala', 'apunta', 'explicando', 'explica', 'pizarra', 'pointing', 'muestra'], 'pointing'],
  [['hablando', 'habla', 'conversa', 'presenta', 'expone', 'debate', 'pregunta', 'talking'], 'talking'],
  [['sentad', 'pupitre', 'escritorio', 'mesa', 'sitting', 'seated'], 'sitting'],
  // Escribir se hace sentado: es lo que se ve en cualquier aula
  [['escribiendo', 'escribe', 'apuntando en', 'tomando apuntes', 'writing'], 'sitting'],
];

const OBJETO_POR_PALABRA: Array<[string[], Escena['objetos'][number]['objeto']]> = [
  [['tablet', 'tableta', 'ipad'], 'tablet'],
  [['portatil', 'laptop', 'ordenador', 'computador', 'computadora'], 'laptop'],
  [['libro', 'book', 'cuento', 'novela'], 'book'],
  [['cuaderno', 'libreta', 'notebook', 'apuntes'], 'notebook'],
  [['documento', 'ficha', 'hoja', 'informe', 'document'], 'document'],
  [['lapiz', 'lapices', 'escribiendo', 'escribe', 'pencil', 'dibuja'], 'pencil'],
  [['chat', 'mensaje', 'conversacion', 'comentario', 'idea'], 'chat'],
];

const FONDO_POR_PALABRA: Array<[string[], Escena['fondo']]> = [
  [['biblioteca', 'library', 'estanteria'], 'library'],
  [['tecnolog', 'digital', 'pantalla', 'informatica', 'programacion', 'robotica', 'computacion'], 'technology'],
  [['aula', 'clase', 'salon', 'pizarra', 'classroom', 'colegio', 'escuela'], 'classroom'],
];

const TEMA_POR_PALABRA: Array<[string[], Escena['tema']]> = [
  [['tecnolog', 'digital', 'robotica', 'programacion', 'informatica'], 'technology'],
  [['naturaleza', 'ciencias naturales', 'biologia', 'planta', 'ecolog', 'medio ambiente', 'huerto'], 'nature'],
  [['arte', 'musica', 'amistad', 'fiesta', 'celebra', 'literatura'], 'warm'],
];

const primeraCoincidencia = <T,>(t: string, tabla: Array<[string[], T]>, siNo: T): T => {
  for (const [palabras, valor] of tabla) if (contiene(t, palabras)) return valor;
  return siNo;
};

/**
 * Lectura local del texto.
 *
 * No entiende la frase, reconoce palabras. Con eso acierta lo esencial (cuantos,
 * quien, donde y con que) en las descripciones que de verdad escribe el
 * profesorado, que suelen ser directas.
 */
export function analizarLocalmente(entrada: AnalizarInput): Escena {
  const t = normalizar(entrada.texto);

  const conteo = cuantaGente(t);
  const hayDocente = conteo.docente || contiene(t, HAY_DOCENTE);
  const cuantos = entrada.personajes
    ?? Math.min(conteo.alumnado + (hayDocente ? 1 : 0), MAXIMO_PERSONAJES);
  const poseGeneral = primeraCoincidencia(t, POSE_POR_PALABRA, 'standing');

  /*
   * Con alguien explicando delante, el alumnado no esta tambien explicando: si la
   * pose sale de un verbo de ensenar, la clase se dibuja sentada atendiendo.
   */
  const poseAlumnado = hayDocente && (poseGeneral === 'pointing' || poseGeneral === 'talking')
    ? 'sitting'
    : poseGeneral;

  const personajes: PersonajeEscena[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    // Si se nombra a un docente, es el primero; el resto es alumnado
    const esDocente = hayDocente && i === 0;
    const pose = esDocente
      ? (poseGeneral === 'pointing' ? 'pointing' : 'talking')
      : poseAlumnado;

    personajes.push({
      papel: esDocente ? 'teacher' : 'student',
      // Quien ensena habla o senala; el alumnado hace lo que diga la frase
      pose,
      emocion: esDocente ? 'engaged' : ['engaged', 'focused', 'happy', 'thinking'][i % 4] as PersonajeEscena['emocion'],
      posicion: (['left', 'center', 'right', 'left'] as const)[i % 4],
      // La escena dice lo que se lleva en la mano en vez de dejarlo a que lo
      // adivine quien dibuja: asi lo guardado se explica solo, y quien edite la
      // escena a mano ve por que aparece esa tablet.
      ...(OBJETO_DE_LA_POSE[pose] ? { sostiene: OBJETO_DE_LA_POSE[pose] } : {}),
    });
  }

  const objetos: Escena['objetos'] = [];
  for (const [palabras, objeto] of OBJETO_POR_PALABRA) {
    if (!contiene(t, palabras)) continue;
    // Lo que ya se lleva en la mano por la pose no se repite suelto
    if ((objeto === 'tablet' && poseGeneral === 'using_tablet') || (objeto === 'book' && poseGeneral === 'reading')) continue;

    /*
     * Si el texto nombra algo que se puede coger y nadie lo lleva todavia, se le
     * pone en las manos a quien tenga la pose libre. Dejarlo suelto en el suelo
     * es lo que hacia que "dos estudiantes escribiendo con lapiz" saliera como
     * dos personas de pie con un lapiz tirado delante.
     */
    const seCoge = objeto !== 'chat';
    const manosLibres = personajes.filter((p) => !p.sostiene && (p.pose === 'standing' || p.pose === 'sitting'));

    if (seCoge && manosLibres.length > 0) {
      for (const persona of manosLibres) persona.sostiene = objeto;
      continue;
    }

    objetos.push({ objeto, posicion: objeto === 'chat' ? 'upper-right' : 'foreground' });
    if (objetos.length >= 2) break;
  }

  const distribucion = DISTRIBUCIONES[Math.min(cuantos, 4) - 1] ?? 'single';

  const escena: Escena = {
    version: VERSION_ESCENA,
    versionCatalogo: VERSION_CATALOGO,
    fondo: entrada.fondo ?? primeraCoincidencia(t, FONDO_POR_PALABRA, 'classroom'),
    // Tres personas trabajando juntas se lee mejor como colaboracion que como grupo
    distribucion: cuantos === 3 && contiene(t, ['colabor', 'juntos', 'juntas', 'equipo', 'grupo']) ? 'collaboration' : distribucion,
    tema: entrada.tema ?? primeraCoincidencia(t, TEMA_POR_PALABRA, 'educational'),
    personajes,
    objetos,
    descripcion: entrada.texto.slice(0, 300),
  };

  return escenaSchema.parse(escena);
}
