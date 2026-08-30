/**
 * Contenido de la web comercial.
 *
 * Vive aparte de la maquetacion para que cambiar un precio, una pregunta frecuente
 * o el texto de una ventaja no obligue a tocar el HTML.
 *
 * Los importes estan en pesos colombianos (COP) y se facturan de forma anual.
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

/** Lo que el producto hace de verdad hoy; nada aqui esta por construir. */
export const FEATURES: Feature[] = [
  {
    icon: '🎨',
    title: 'Lienzo libre, no plantillas rigidas',
    description:
      'Coloca texto, imagenes, formas, iconos y dibujos donde quieras. 26 formas, 2.048 iconos, ' +
      'emojis y 17 tipografias pensadas para leerse bien, incluida OpenDyslexic.',
  },
  {
    icon: '🎙️',
    title: 'Voz, foto y video sin salir de la pagina',
    description:
      'Se graba desde el navegador con la camara y el microfono del equipo. Los audios se ' +
      'insertan como puntos de escucha con el color que elijas.',
  },
  {
    icon: '❓',
    title: 'Preguntas que se corrigen solas',
    description:
      'Respuesta unica, varias respuestas u ordenar. Con texto e imagenes, y una animacion de ' +
      'celebracion al acertar. La solucion se comprueba en el servidor: no se puede espiar.',
  },
  {
    icon: '📊',
    title: 'Graficas y formulas',
    description:
      'Seis tipos de grafica con datos editables y formulas matematicas en LaTeX. Todo se dibuja ' +
      'en el propio documento, sin capturas de pantalla.',
  },
  {
    icon: '🗺️',
    title: 'Mapas, medios libres e incrustaciones',
    description:
      'Mapas de OpenStreetMap, un buscador de imagenes y sonidos con licencia Creative Commons y ' +
      'atribucion automatica, y contenido de YouTube, Google, Canva o Genially.',
  },
  {
    icon: '🔗',
    title: 'Se comparte con un enlace',
    description:
      'Publico para cualquiera, o restringido a tu grupo. Siempre en solo lectura, con enlace ' +
      'revocable en un clic.',
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
      'Exporta a PDF o a una pagina web autonoma de un solo archivo, que se abre con doble clic ' +
      'sin necesitar la plataforma. Sin secuestro de datos.',
  },
  {
    icon: '🔒',
    title: 'Tus datos donde tu decidas',
    description:
      'Puede funcionar en la red local del centro, incluso sin internet. Sin seguimiento ' +
      'publicitario ni cesion de datos a terceros.',
  },
];

export const USE_CASES: UseCase[] = [
  {
    icon: '🎓',
    audience: 'Educacion',
    title: 'Del cuaderno al libro que se puede escuchar',
    bullets: [
      'Cuentos, diarios de lectura y portafolios donde el alumnado graba su propia voz.',
      'Organizadores graficos listos: Venn, KWL, mapa del cuento, espina de pescado, Cornell.',
      'Autoevaluacion con preguntas que se corrigen solas y dan animo al acertar.',
      'Grupos creados en segundos desde el sistema academico del centro.',
      'Accesibilidad de serie: tipografias para dislexia, tamano minimo legible y audio.',
    ],
  },
  {
    icon: '💼',
    audience: 'Profesional',
    title: 'Documentos vivos que nadie deja sin leer',
    bullets: [
      'Manuales de acogida y procedimientos con video, audio y pasos ilustrados.',
      'Propuestas y memorias de proyecto con graficas y mapas dentro del propio documento.',
      'Formacion interna con comprobaciones de comprension al final de cada capitulo.',
      'Catalogos y presentaciones que se comparten con un enlace y se exportan a PDF.',
      'Todo dentro de tu infraestructura, sin subir informacion sensible a terceros.',
    ],
  },
];

export const STEPS = [
  { number: 1, title: 'Crea el libro', text: 'Elige formato y arranca de cero o con una de las 24 plantillas.' },
  { number: 2, title: 'Llena las paginas', text: 'Arrastra texto, imagenes, audio, graficas o preguntas al lienzo.' },
  { number: 3, title: 'Invita a tu grupo', text: 'Con un enlace o un codigo QR. Pueden leer o escribir contigo.' },
  { number: 4, title: 'Publica o exporta', text: 'Comparte el enlace, o llevatelo en PDF o como pagina web.' },
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
      'Libros y paginas ilimitados',
      'Enlaces para compartir y modo lectura',
      'Exportacion a PDF y a pagina web',
      'Soporte por correo',
    ],
    cta: 'Contratar',
    note: 'Facturacion anual: $1.800.000 COP al ano.',
  },
  {
    id: 'escuela',
    name: 'Escuela',
    price: '$5.000.000 COP',
    period: 'al ano',
    summary: 'Para colegios que trabajan por proyectos con varios cursos.',
    features: [
      'Hasta 5 profesores y 500 estudiantes',
      'Alojamiento, copias de seguridad y actualizaciones',
      'Importacion de grupos desde tu sistema academico',
      'Edicion colaborativa por curso',
      'Formacion inicial para el profesorado',
      'Soporte por correo en 48 horas',
    ],
    cta: 'Pedir presupuesto',
    highlight: true,
    note: 'Pago anual. Si superas los cupos, pasas al plan institucional.',
  },
  {
    id: 'institucional',
    name: 'Institucional y empresas',
    price: '$20.000.000 COP',
    period: 'al ano',
    summary: 'Para instituciones grandes y equipos corporativos.',
    features: [
      'Usuarios ilimitados',
      'Dominio e imagen propios',
      'Integracion con vuestro directorio de usuarios',
      'Instalacion en vuestros servidores si la necesitais',
      'Acuerdo de nivel de servicio y soporte prioritario',
      'Formacion y acompanamiento continuo',
    ],
    cta: 'Hablemos',
    note: 'Pago anual. Desarrollos especificos bajo acuerdo.',
  },
];

export const FAQS: Faq[] = [
  {
    question: 'Como se factura?',
    answer:
      'Todos los planes se pagan de forma anual. El plan Individual se anuncia por mes para que ' +
      'sea facil de comparar, pero se cobra el ano completo. Emitimos factura a nombre del centro ' +
      'o de la empresa.',
  },
  {
    question: 'Que pasa si mi colegio supera los cupos del plan Escuela?',
    answer:
      'El plan Escuela cubre hasta 5 profesores y 500 estudiantes. Si necesitas mas, se pasa al ' +
      'plan Institucional, que no tiene limite de usuarios. Te avisamos antes de que ocurra, sin ' +
      'cobros sorpresa a mitad de ano.',
  },
  {
    question: 'Puedo probarlo antes de contratar?',
    answer:
      'Si. Pide una demostracion desde el portal de clientes y montamos un entorno de prueba con ' +
      'tus grupos reales, para que el profesorado lo use con contenido propio antes de decidir.',
  },
  {
    question: 'Funciona sin internet?',
    answer:
      'Instalado en la red del centro, si. El editor, las tipografias, los iconos, las plantillas ' +
      'y las graficas viven en el propio servidor. Solo necesitan conexion la busqueda de imagenes ' +
      'y sonidos, los mapas y el contenido incrustado de terceros.',
  },
  {
    question: 'Donde se guardan los datos del alumnado?',
    answer:
      'En el servidor que acordemos: el nuestro o el vuestro. No hay seguimiento publicitario ni ' +
      'cesion de datos a terceros. Los videos de YouTube se sirven por el dominio sin cookies y ' +
      'solo se cargan si alguien los pulsa.',
  },
  {
    question: 'Que necesita el alumnado para entrar?',
    answer:
      'Un navegador. Los mas pequenos entran con un codigo QR, sin correo ni contrasena. El resto ' +
      'con su correo institucional. Tambien se pueden importar los grupos completos desde el ' +
      'sistema academico del centro.',
  },
  {
    question: 'Se pueden sacar los libros de la plataforma?',
    answer:
      'Si, y sin trampas. Cada libro se exporta a PDF o a una pagina web de un solo archivo, con ' +
      'sus imagenes, su navegacion y su diseno. Se abre con doble clic aunque dejes de usar el ' +
      'servicio.',
  },
  {
    question: 'Sirve fuera del aula?',
    answer:
      'Si. Equipos de formacion, comunicacion interna y consultoria lo usan para manuales, ' +
      'propuestas y documentacion viva. Las preguntas autocorregibles funcionan igual de bien para ' +
      'comprobar que se ha entendido un procedimiento.',
  },
  {
    question: 'Varias personas pueden editar el mismo libro?',
    answer:
      'Si: marca el libro como colaborativo y todo el grupo aporta contenido. Los cambios de otras ' +
      'personas aparecen al recargar; la edicion simultanea con cursores en vivo esta en desarrollo.',
  },
  {
    question: 'Que pasa si no renuevo?',
    answer:
      'Tus libros son tuyos. Antes de que termine el periodo contratado los exportas todos a PDF o ' +
      'a pagina web, y te los llevas completos.',
  },
];

/** Enlaces del pie de pagina. */
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
    'Crea libros interactivos con voz, video, mapas, graficas y preguntas autocorregibles. ' +
    'Plataforma para centros educativos y equipos profesionales, con planes desde un docente ' +
    'hasta toda la institucion.',
  email: 'hola@bookstudio.uk',
  url: 'https://bookstudio.uk',
};
