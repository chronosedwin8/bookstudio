/**
 * Catalogo de la ilustracion educativa: todo lo que se puede dibujar.
 *
 * Esta lista es el limite del sistema. Quien describe una escena (una persona o
 * la IA) solo puede elegir de aqui: si pide una nave espacial, no hay nave
 * espacial, y se cae a algo del catalogo en vez de inventarse nada. Por eso las
 * listas son cerradas y estan en un solo sitio.
 *
 * El mismo catalogo esta escrito en el servidor, en
 * `apps/api/src/modules/illustrations/illustrations.schemas.ts`, porque los dos
 * workspaces no comparten paquete. Que no se separen lo vigila
 * `ilustracion.check.mts`, que compara las dos copias.
 */

/** Sube cuando cambia el catalogo: una escena guardada sabe con que se dibujo. */
export const VERSION_CATALOGO = 1;
/** Sube cuando cambia la forma del JSON de escena. */
export const VERSION_ESCENA = 1;
/** Sube cuando cambia el dibujo, aunque la escena sea la misma. */
export const VERSION_DIBUJO = 1;

/** Quien aparece. */
export const PAPELES = ['student', 'teacher'] as const;
export type Papel = (typeof PAPELES)[number];

/** Que esta haciendo. Cada pose decide los brazos, las piernas y donde caen las manos. */
export const POSES = ['standing', 'sitting', 'talking', 'pointing', 'reading', 'using_tablet'] as const;
export type Pose = (typeof POSES)[number];

/** Que cara pone. */
export const EMOCIONES = ['engaged', 'focused', 'happy', 'thinking'] as const;
export type Emocion = (typeof EMOCIONES)[number];

/** Donde se coloca dentro de la escena; el motor de composicion lo traduce a coordenadas. */
export const POSICIONES = ['left', 'center', 'right', 'foreground', 'upper-left', 'upper-right'] as const;
export type Posicion = (typeof POSICIONES)[number];

/** Cosas que se pueden dibujar, en la mano o sueltas. */
export const OBJETOS = ['tablet', 'laptop', 'book', 'notebook', 'document', 'pencil', 'chat'] as const;
export type Objeto = (typeof OBJETOS)[number];

/** Donde ocurre. */
export const FONDOS = ['classroom', 'library', 'technology', 'abstract'] as const;
export type Fondo = (typeof FONDOS)[number];

/** Como se reparten los personajes. */
export const DISTRIBUCIONES = ['single', 'pair', 'group', 'collaboration'] as const;
export type Distribucion = (typeof DISTRIBUCIONES)[number];

/** Paleta. */
export const TEMAS = ['educational', 'technology', 'nature', 'warm'] as const;
export type Tema = (typeof TEMAS)[number];

/**
 * Que objetos se pueden llevar en la mano.
 *
 * El resto se dibuja apoyado o flotando en su sitio de la escena. Se declara
 * aqui y no en el dibujo para que la validacion pueda decidir si una escena
 * tiene sentido antes de intentar pintarla.
 */
export const OBJETOS_EN_MANO: readonly Objeto[] = ['tablet', 'laptop', 'book', 'notebook', 'document', 'pencil'];

/** Poses que dejan las manos por delante, listas para sostener algo. */
export const POSES_CON_MANOS_LIBRES: readonly Pose[] = ['using_tablet', 'reading', 'standing', 'sitting'];

/** El objeto que le pega a cada pose cuando nadie dice otra cosa. */
export const OBJETO_DE_LA_POSE: Partial<Record<Pose, Objeto>> = {
  using_tablet: 'tablet',
  reading: 'book',
};

export const PREDETERMINADOS = {
  papel: 'student' as Papel,
  pose: 'standing' as Pose,
  emocion: 'engaged' as Emocion,
  posicion: 'center' as Posicion,
  fondo: 'classroom' as Fondo,
  distribucion: 'single' as Distribucion,
  tema: 'educational' as Tema,
} as const;

/** Cuantos personajes caben; mas de esto se amontonan y no se entiende la escena. */
export const MAXIMO_PERSONAJES = 4;
/** Cuantos objetos sueltos caben. */
export const MAXIMO_OBJETOS = 5;

/** Nombres para la interfaz, que el catalogo esta en ingles por ser claves. */
export const NOMBRES = {
  papel: { student: 'Estudiante', teacher: 'Docente' } as Record<Papel, string>,
  pose: {
    standing: 'De pie',
    sitting: 'Sentado',
    talking: 'Hablando',
    pointing: 'Senalando',
    reading: 'Leyendo',
    using_tablet: 'Con una tablet',
  } as Record<Pose, string>,
  emocion: {
    engaged: 'Participativo',
    focused: 'Concentrado',
    happy: 'Contento',
    thinking: 'Pensativo',
  } as Record<Emocion, string>,
  objeto: {
    tablet: 'Tablet',
    laptop: 'Portatil',
    book: 'Libro',
    notebook: 'Cuaderno',
    document: 'Documento',
    pencil: 'Lapiz',
    chat: 'Globo de conversacion',
  } as Record<Objeto, string>,
  fondo: {
    classroom: 'Aula',
    library: 'Biblioteca',
    technology: 'Tecnologia',
    abstract: 'Fondo abstracto',
  } as Record<Fondo, string>,
  distribucion: {
    single: 'Una persona',
    pair: 'Pareja',
    group: 'Grupo',
    collaboration: 'Trabajo en equipo',
  } as Record<Distribucion, string>,
  tema: {
    educational: 'Educativo',
    technology: 'Tecnologico',
    nature: 'Natural',
    warm: 'Calido',
  } as Record<Tema, string>,
} as const;

export const es = {
  papel: (v: unknown): v is Papel => PAPELES.includes(v as Papel),
  pose: (v: unknown): v is Pose => POSES.includes(v as Pose),
  emocion: (v: unknown): v is Emocion => EMOCIONES.includes(v as Emocion),
  posicion: (v: unknown): v is Posicion => POSICIONES.includes(v as Posicion),
  objeto: (v: unknown): v is Objeto => OBJETOS.includes(v as Objeto),
  fondo: (v: unknown): v is Fondo => FONDOS.includes(v as Fondo),
  distribucion: (v: unknown): v is Distribucion => DISTRIBUCIONES.includes(v as Distribucion),
  tema: (v: unknown): v is Tema => TEMAS.includes(v as Tema),
};
