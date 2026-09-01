/**
 * Contenido de la web comercial.
 *
 * Vive aparte de la maquetacion para que cambiar un precio, una pregunta frecuente
 * o el texto de una ventaja no obligue a tocar el HTML.
 *
 * Los importes están en pesos colombianos (COP) y se facturan de forma anual.
 */

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export interface UseCase {
  icon: string;
  audience: string;
  title: string;
  bullets: string[];
}

export interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  summary: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  note?: string;
}

export interface Faq {
  question: string;
  answer: string;
}

/** Lo que el producto hace de verdad hoy; nada aquí esta por construir. */
export const FEATURES: Feature[] = [
  {
    icon: '🎨',
    title: 'Lienzo libre, no plantillas rigidas',
    description:
      'Coloca texto, imagenes, formas, iconos y dibujos donde quieras. 26 formas, 2.048 iconos, ' +
      'emojis y 17 tipografías pensadas para leerse bien, incluida OpenDyslexic.',
  },
  {
    icon: '🎙️',
    title: 'Voz, foto y video sin salir de la página',
    description:
      'Se graba desde el navegador con la camara y el microfono del equipo. Los audios se ' +
      'insertan como puntos de escucha con el color que elijas.',
  },
  {
    icon: '❓',
    title: 'Preguntas que se corrigen solas',
    description:
      'Respuesta única, varias respuestas u ordenar. Con texto e imagenes, y una animación de ' +
      'celebracion al acertar. La solucion se comprueba en el servidor: no se puede espiar.',
  },
  {
    icon: '📊',
    title: 'Gráficas y formulas',
    description:
      'Seis tipos de gráfica con datos editables y formulas matemáticas en LaTeX. Todo se dibuja ' +
      'en el propio documento, sin capturas de pantalla.',
  },
  {
    icon: '🗺️',
    title: 'Mapas, medios libres e incrustaciones',
    description:
      'Mapas de OpenStreetMap, un buscador de imagenes y sonidos con licencia Creative Commons y ' +
      'atribución automática, y contenido de YouTube, Google, Canva o Genially.',
  },
  {
    icon: '🎯',
    title: 'Valoraciones con nota y comentario',
    description:
      'Pon nota a cada libro las veces que haga falta, con título y el porqué. Una cuadrícula ' +
      'reúne a toda la clase con el promedio de cada alumno, y ellos ven sus notas y tus ' +
      'comentarios en su propio libro.',
  },
  {
    icon: '📬',
    title: 'Entrega material a toda la clase',
    description:
      'Manda una página o un libro entero y cada alumno recibe su copia editable. Eliges si va ' +
      'en un libro aparte o dentro de los que ya tiene, y si cae al principio o al final.',
  },
  {
    icon: '🧭',
    title: 'Bitácora de trabajo',
    description:
      'Cuántas veces ha entrado cada alumno a un libro, cuándo y cuánto tiempo. Las sesiones se ' +
      'cierran solas tras unos minutos, así que mide trabajo real y no pestañas olvidadas.',
  },
  {
    icon: '🧩',
    title: 'Grupos con alumnos de varios cursos',
    description:
      'Arma una biblioteca con cinco de 10A, seis de 10B y nueve de 10C: eliges el curso, ves su ' +
      'lista y marcas. Se conecta con el sistema académico del centro para traer los grupos.',
  },
  {
    icon: '🔗',
    title: 'Se comparte con un enlace',
    description:
      'Público para cualquiera, o restringido a tu grupo. Siempre en solo lectura, con enlace ' +
      'revocable en un clic. Puedes decidir si el alumnado ve las creaciones de sus compañeros.',
  },
  {
    icon: '👥',
    title: 'Trabajo en grupo',
    description:
      'Marca un libro como colaborativo y toda la clase aporta contenido al mismo documento, ' +
      'cada quien desde su equipo.',
  },
  {
    icon: '📤',
    title: 'Tu contenido sale contigo',
    description:
      'Exporta a PDF o a una página web autonoma de un solo archivo, que se abre con doble clic ' +
      'sin necesitar la plataforma. Sin secuestro de datos.',
  },
  {
    icon: '🔒',
    title: 'Datos tratados con cuidado',
    description:
      'Sin seguimiento publicitario ni cesion de datos a terceros. Los videos de YouTube se ' +
      'sirven por el dominio sin cookies y solo se cargan si alguien los pulsa.',
  },
];

export const USE_CASES: UseCase[] = [
  {
    icon: '🎓',
    audience: 'Educacion',
    title: 'Del cuaderno al libro que se puede escuchar',
    bullets: [
      'Cuentos, diarios de lectura y portafolios donde el alumnado graba su propia voz.',
      'Organizadores gráficos listos: Venn, KWL, mapa del cuento, espina de pescado, Cornell.',
      'Autoevaluacion con preguntas que se corrigen solas y dan animo al acertar.',
      'Valoraciones con nota y comentario, y una cuadrícula con el promedio de la clase.',
      'Reparte la misma ficha a todo el grupo y cada alumno trabaja sobre su copia.',
      'Bibliotecas con alumnado de varios cursos, traido del sistema académico del centro.',
      'Accesibilidad de serie: tipografías para dislexia, tamaño mínimo legible y audio.',
    ],
  },
  {
    icon: '💼',
    audience: 'Profesional',
    title: 'Documentos vivos que nadie deja sin leer',
    bullets: [
      'Manuales de acogida y procedimientos con video, audio y pasos ilustrados.',
      'Propuestas y memorias de proyecto con gráficas y mapas dentro del propio documento.',
      'Formacion interna con comprobaciones de comprension al final de cada capitulo.',
      'Catalogos y presentaciones que se comparten con un enlace y se exportan a PDF.',
      'Sin seguimiento publicitario ni cesion de datos a terceros.',
    ],
  },
];

export const STEPS = [
  { number: 1, title: 'Crea el libro', text: 'Elige formato y arranca de cero o con una de las 24 plantillas.' },
  { number: 2, title: 'Llena las páginas', text: 'Arrastra texto, imagenes, audio, gráficas o preguntas al lienzo.' },
  {
    number: 3,
    title: 'Invita a tu grupo',
    text: 'Con un enlace, un código QR o eligiendo alumnos curso por curso.',
  },
  {
    number: 4,
    title: 'Corrige y publica',
    text: 'Pon nota con tu comentario, comparte el enlace o llevatelo en PDF.',
  },
];

export const PLANS: Plan[] = [
  {
    id: 'individual',
    name: 'Individual',
    price: '$150.000 COP',
    period: 'al mes, con pago anual',
    summary: 'Para un docente o un profesional que trabaja por su cuenta.',
    features: [
      'Todas las funciones del editor',
      'Libros y páginas ilimitados',
      'Enlaces para compartir y modo lectura',
      'Exportación a PDF y a página web',
      'Soporte por correo',
    ],
    cta: 'Contratar',
    note: 'Facturación anual: $1.800.000 COP al año.',
  },
  {
    id: 'escuela',
    name: 'Escuela',
    price: '$5.000.000 COP',
    period: 'al año',
    summary: 'Para colegios que trabajan por proyectos con varios cursos.',
    features: [
      'Hasta 5 profesores y 500 estudiantes',
      'Alojamiento, copias de seguridad y actualizaciones',
      'Importación de grupos desde tu sistema académico',
      'Edición colaborativa por curso',
      'Formacion inicial para el profesorado',
      'Soporte por correo en 48 horas',
    ],
    cta: 'Contratar',
    highlight: true,
    note: 'Pago anual. Si superas los cupos, pasas al plan institucional.',
  },
  {
    id: 'institucional',
    name: 'Institucional y empresas',
    price: '$20.000.000 COP',
    period: 'al año',
    summary: 'Para instituciones grandes y equipos corporativos.',
    features: [
      'Usuarios ilimitados',
      'Dominio e imagen propios',
      'Integración con vuestro directorio de usuarios',
      'Acuerdo de nivel de servicio y soporte prioritario',
      'Formacion y acompañamiento continuo',
    ],
    cta: 'Contratar',
    note: 'Pago anual.',
  },
];

export const FAQS: Faq[] = [
  {
    question: 'Como se contrata y como se factura?',
    answer:
      'Se paga con tarjeta en la propia web y la cuenta se crea en el mismo paso: al terminar ya ' +
      'estas dentro del editor. Todos los planes son anuales; el Individual se anuncia por mes ' +
      'solo para comparar, pero se cobra el año completo. En el extracto aparece como BookStudio.',
  },
  {
    question: 'Que pasa si mi colegio supera los cupos del plan Escuela?',
    answer:
      'El plan Escuela cubre hasta 5 profesores y 500 estudiantes. Si necesitas más, se pasa al ' +
      'plan Institucional, que no tiene limite de usuarios. Te avisamos antes de que ocurra, sin ' +
      'cobros sorpresa a mitad de año.',
  },
  {
    question: 'Puedo probarlo antes de pagar?',
    answer:
      'Si, y sin dar ningun dato. Pulsa "Probar sin registrarse" y entras al editor completo al ' +
      'instante, con un limite de un libro y dos páginas. Si te convence, contratas en dos minutos.',
  },
  {
    question: 'Que necesito para empezar?',
    answer:
      'Un navegador y una conexion a internet. No hay que instalar nada ni pedirle nada al área de ' +
      'sistemas del centro: se paga, se crea la cuenta en el mismo paso y ya se puede trabajar.',
  },
  {
    question: 'Donde se guardan los datos del alumnado?',
    answer:
      'En nuestros servidores, cifrados en transito y con copia de seguridad diaria. No hay ' +
      'seguimiento publicitario ni cesion de datos a terceros. Los videos de YouTube se sirven por ' +
      'el dominio sin cookies y solo se cargan si alguien los pulsa.',
  },
  {
    question: 'Que necesita el alumnado para entrar?',
    answer:
      'Un navegador. Los más pequeños entran con un código QR, sin correo ni contraseña. El resto ' +
      'con su correo institucional. Al darlos de alta te decimos qué clave repartir, y cada uno ' +
      'puede cambiarla por la suya en cualquier momento.',
  },
  {
    question: 'Puedo poner notas y llevar el seguimiento?',
    answer:
      'Si. Valoras cada libro las veces que quieras, con titulo, nota y el porqué, y las corriges ' +
      'cuando haga falta. Una cuadricula reúne a toda la clase con el promedio de cada alumno, y ' +
      'una bitácora muestra cuántas veces ha entrado cada uno a trabajar y cuánto tiempo estuvo.',
  },
  {
    question: 'Puedo hacer un grupo con alumnos de cursos distintos?',
    answer:
      'Si. Eliges un curso, ves su lista completa y marcas a quien quieras; cambias de curso y ' +
      'sigues marcando. Asi se arma un taller o un club con cinco de un grupo, seis de otro y los ' +
      'que hagan falta, sin mover a nadie de su clase.',
  },
  {
    question: 'Y si un alumno se va del centro?',
    answer:
      'Se borra su cuenta con todo lo suyo: libros, páginas, valoraciones y los archivos que haya ' +
      'subido. Es definitivo y hay que confirmarlo escribiendo su nombre, para que no ocurra por ' +
      'un clic despistado.',
  },
  {
    question: 'Se pueden sacar los libros de la plataforma?',
    answer:
      'Si, y sin trampas. Cada libro se exporta a PDF o a una página web de un solo archivo, con ' +
      'sus imagenes, su navegacion y su diseño. Se abre con doble clic aunque dejes de usar el ' +
      'servicio.',
  },
  {
    question: 'Sirve fuera del aula?',
    answer:
      'Si. Equipos de formacion, comunicacion interna y consultoria lo usan para manuales, ' +
      'propuestas y documentación viva. Las preguntas autocorregibles funcionan igual de bien para ' +
      'comprobar que se ha entendido un procedimiento.',
  },
  {
    question: 'Varias personas pueden editar el mismo libro?',
    answer:
      'Si: marca el libro como colaborativo y todo el grupo aporta contenido. Los cambios de otras ' +
      'personas aparecen al recargar; la edición simultanea con cursores en vivo esta en desarrollo.',
  },
  {
    question: 'Que pasa si no renuevo?',
    answer:
      'Tus libros son tuyos. Antes de que termine el periodo contratado los exportas todos a PDF o ' +
      'a página web, y te los llevas completos.',
  },
];

/** Enlaces del pie de página. */
export const FOOTER_LINKS = [
  {
    title: 'Producto',
    links: [
      { label: 'Funciones', href: '#funciones' },
      { label: 'Casos de uso', href: '#casos' },
      { label: 'Precios', href: '#precios' },
      { label: 'Preguntas frecuentes', href: '#faq' },
    ],
  },
];

export const SITE = {
  name: 'BookStudio',
  tagline: 'Libros interactivos que el alumnado crea, escucha y comparte',
  description:
    'Crea libros interactivos con voz, video, mapas, gráficas y preguntas autocorregibles. ' +
    'Con valoraciones, seguimiento del trabajo y grupos formados con alumnado de varios cursos. ' +
    'Para centros educativos y equipos profesionales, desde un docente hasta toda la institucion.',
  email: 'hola@bookstudio.uk',
  url: 'https://bookstudio.uk',
};
