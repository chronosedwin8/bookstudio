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
    icon: '🔗',
    title: 'Se comparte con un enlace',
    description:
      'Público para cualquiera, o restringido a tu grupo. Siempre en solo lectura, con enlace ' +
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
      'Grupos creados en segundos desde el sistema académico del centro.',
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
      'Todo dentro de tu infraestructura, sin subir información sensible a terceros.',
    ],
  },
];

export const STEPS = [
  { number: 1, title: 'Crea el libro', text: 'Elige formato y arranca de cero o con una de las 24 plantillas.' },
  { number: 2, title: 'Llena las páginas', text: 'Arrastra texto, imagenes, audio, gráficas o preguntas al lienzo.' },
  { number: 3, title: 'Invita a tu grupo', text: 'Con un enlace o un código QR. Pueden leer o escribir contigo.' },
  { number: 4, title: 'Publica o exporta', text: 'Comparte el enlace, o llevatelo en PDF o como página web.' },
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
      'con su correo institucional. También se pueden importar los grupos completos desde el ' +
      'sistema académico del centro.',
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
    'Plataforma para centros educativos y equipos profesionales, con planes desde un docente ' +
    'hasta toda la institucion.',
  email: 'hola@bookstudio.uk',
  url: 'https://bookstudio.uk',
};
