/**
 * Textos legales: términos del servicio, aviso de privacidad y política de
 * reembolsos.
 *
 * Viven aqui, como contenido, y no dentro de la vista: asi se revisan y se
 * cambian en un solo sitio, y la portada, el pie y la pagina de contratar
 * enlazan a lo mismo.
 *
 * Lo que se afirma sobre el tratamiento de datos tiene que ser cierto en el
 * codigo: si se añade un proveedor que reciba datos, va en ENCARGADOS.
 */

export const TITULAR = {
  nombre: 'Grupo Logic SAS Latinoamérica',
  correo: 'gestion@grupologiclatam.com',
  servicio: 'BookStudio',
  web: 'https://bookstudio.uk',
};

/** Fecha desde la que rigen los textos de abajo. */
export const VIGENCIA = '4 de octubre de 2026';

/** Plazo de devolucion, en dias naturales. */
export const DIAS_REEMBOLSO = 14;

export interface Seccion {
  titulo: string;
  parrafos?: string[];
  lista?: string[];
}

export interface DocumentoLegal {
  slug: 'terminos' | 'privacidad' | 'reembolsos';
  /** Nombre de la ruta en el router. */
  ruta: string;
  titulo: string;
  resumen: string;
  secciones: Seccion[];
}

const { nombre, correo, servicio, web } = TITULAR;

/** Proveedores que tratan datos por cuenta nuestra, y para que. */
const ENCARGADOS = [
  'Amazon Web Services (AWS): alojamiento de la plataforma y almacenamiento de los archivos que se suben a los libros.',
  'Microsoft (Entra ID): solo si el centro activa el acceso con la cuenta institucional; recibimos el nombre y el correo de quien entra.',
  'Phidias: solo si el centro conecta su sistema académico; de ahí importamos nombres, correos y cursos del alumnado y del profesorado.',
  'Magnific y Anthropic: solo al usar las funciones de creación de imágenes e ilustraciones con inteligencia artificial; reciben la descripción que se escribe, no los datos de la cuenta.',
  'Mercado Pago: procesa los pagos. Los datos de la tarjeta o de la cuenta bancaria los recibe directamente; nosotros no los vemos ni los guardamos.',
  'OpenStreetMap y Openverse: sirven los mapas y el buscador de imágenes libres; reciben la búsqueda y la dirección IP de quien la hace.',
];

export const TERMINOS: DocumentoLegal = {
  slug: 'terminos',
  ruta: 'legal-terminos',
  titulo: 'Términos del servicio',
  resumen: `Condiciones de uso de ${servicio}, la plataforma de libros interactivos operada por ${nombre}.`,
  secciones: [
    {
      titulo: '1. Quién presta el servicio',
      parrafos: [
        `${servicio} (${web}) es un servicio operado por ${nombre} («nosotros»). Para cualquier asunto relacionado con estos términos puedes escribirnos a ${correo}.`,
        `Al crear una cuenta, contratar una licencia o usar la plataforma aceptas estos términos. Si contratas en nombre de un centro educativo o de una empresa, declaras que tienes facultades para obligarla.`,
      ],
    },
    {
      titulo: '2. Qué es el servicio',
      parrafos: [
        `${servicio} es una plataforma en línea para crear, leer y compartir libros interactivos con texto, imágenes, audio, video, mapas, gráficas, fórmulas y preguntas. Incluye bibliotecas por clase, entrega de material al alumnado, valoraciones y exportación de los libros a PDF y a página web.`,
        'El servicio se presta tal y como está disponible en cada momento. Podemos mejorarlo, añadir funciones o retirar las que dejen de tener sentido; si un cambio reduce de forma importante lo contratado, te lo avisaremos con antelación.',
      ],
    },
    {
      titulo: '3. Cuentas',
      lista: [
        'Cada cuenta es personal. Eres responsable de guardar tu contraseña y de lo que se haga con tu cuenta.',
        'El profesorado y los centros pueden crear cuentas para su alumnado. En ese caso, el centro es quien decide sobre esas cuentas y debe contar con las autorizaciones necesarias de las familias o tutores cuando la ley lo exija.',
        'Podemos suspender una cuenta que incumpla estos términos, después de avisar siempre que sea posible.',
      ],
    },
    {
      titulo: '4. Planes, precios y pago',
      parrafos: [
        'Los planes, sus cupos y sus precios son los que se publican en la portada y en la página de contratar en el momento de la compra. Las licencias se contratan por periodos (normalmente un año) y dan acceso al servicio durante ese periodo.',
        `Las licencias y las cuentas de cobro institucionales se pagan mediante enlaces de pago de Mercado Pago. El pago lo procesa Mercado Pago y el vendedor es ${nombre}.`,
        'Los impuestos aplicables se indican en el momento del pago. Si una licencia se renueva, el precio de la renovación será el vigente en ese momento, y lo verás antes de pagar.',
      ],
    },
    {
      titulo: '5. Reembolsos',
      parrafos: [
        `Puedes pedir la devolución íntegra dentro de los ${DIAS_REEMBOLSO} días siguientes a la compra. Las condiciones completas están en nuestra política de reembolsos.`,
      ],
    },
    {
      titulo: '6. Tu contenido',
      lista: [
        'Los libros, textos, imágenes, grabaciones y demás material que subes o creas siguen siendo tuyos (o de quien tenga sus derechos).',
        'Nos concedes únicamente el permiso necesario para guardarlo, mostrarlo a las personas con las que lo compartes y prestarte el servicio. No lo usamos para publicidad ni lo vendemos.',
        'Debes tener derecho a usar lo que subes. Las imágenes con licencia Creative Commons que insertas desde el buscador se publican con su atribución; respétala si las reutilizas fuera de la plataforma.',
        'Puedes exportar tus libros en cualquier momento a PDF o a una página web de un solo archivo.',
      ],
    },
    {
      titulo: '7. Uso aceptable',
      parrafos: ['No está permitido usar el servicio para:'],
      lista: [
        'publicar contenido ilegal, violento, discriminatorio, sexual o que acose a otras personas, en especial a menores;',
        'infringir derechos de autor, marcas o la intimidad de terceros;',
        'intentar acceder a cuentas o datos ajenos, sobrecargar la plataforma o saltarse sus límites técnicos;',
        'revender o redistribuir el servicio sin un acuerdo escrito con nosotros.',
      ],
    },
    {
      titulo: '8. Funciones con inteligencia artificial',
      parrafos: [
        'Algunas funciones generan imágenes o ilustraciones a partir de una descripción. El resultado puede no ser exacto; revísalo antes de usarlo en clase. Eres responsable de la descripción que escribes y del uso que hagas del resultado.',
      ],
    },
    {
      titulo: '9. Disponibilidad y responsabilidad',
      parrafos: [
        'Trabajamos para que el servicio esté disponible y hacemos copias de seguridad diarias, pero no podemos garantizar que funcione sin interrupciones ni errores. Avisaremos de las paradas programadas siempre que podamos.',
        'En la medida en que la ley lo permita, nuestra responsabilidad total frente a ti por cualquier reclamación relacionada con el servicio se limita al importe que hayas pagado por él en los doce meses anteriores. Nada de lo anterior limita los derechos que la ley de protección al consumidor te reconozca.',
      ],
    },
    {
      titulo: '10. Baja y cancelación',
      parrafos: [
        `Puedes dejar de usar el servicio cuando quieras y pedirnos la baja en ${correo}. Al terminar una licencia sin renovarla dejan de estar disponibles las funciones del plan, pero no borramos tus libros por ello: puedes exportarlos o renovar. Si pides el borrado, eliminamos la cuenta con sus libros y archivos de forma definitiva.`,
      ],
    },
    {
      titulo: '11. Cambios en estos términos',
      parrafos: [
        'Podemos actualizar estos términos. Si el cambio es importante, lo avisaremos en la plataforma o por correo antes de que entre en vigor. La fecha de la última versión figura al final de esta página.',
      ],
    },
    {
      titulo: '12. Ley aplicable',
      parrafos: [
        `Estos términos se rigen por las leyes de la República de Colombia. Antes de acudir a un tribunal, escríbenos a ${correo}: la mayoría de los problemas se resuelven así.`,
      ],
    },
  ],
};

export const PRIVACIDAD: DocumentoLegal = {
  slug: 'privacidad',
  ruta: 'legal-privacidad',
  titulo: 'Aviso de privacidad',
  resumen: `Qué datos personales trata ${servicio}, para qué, con quién y cómo ejercer tus derechos.`,
  secciones: [
    {
      titulo: '1. Responsable',
      parrafos: [
        `El responsable del tratamiento de los datos de ${servicio} es ${nombre}. Puedes contactarnos para cualquier asunto de privacidad en ${correo}.`,
        'Cuando un centro educativo o una empresa contrata el servicio y da de alta a su alumnado o a su equipo, ese centro es el responsable de esos datos y nosotros los tratamos por su cuenta, siguiendo sus instrucciones.',
      ],
    },
    {
      titulo: '2. Qué datos tratamos',
      lista: [
        'Datos de cuenta: nombre, correo electrónico, rol (docente, alumno o administración), contraseña cifrada y, si entras con tu cuenta institucional, el identificador que nos da tu centro.',
        'Datos académicos que aporta el centro: curso o grupo y bibliotecas a las que perteneces.',
        'Contenido: los libros, páginas, textos, imágenes, grabaciones de voz, de cámara o de pantalla y respuestas a preguntas que creas o subes.',
        'Seguimiento del trabajo: valoraciones y notas que pone el profesorado, y el registro de cuándo y cuánto tiempo se trabaja en cada libro.',
        'Datos de facturación: nombre o razón social, NIT o documento, dirección y correo de facturación, y el historial de pagos. Los datos de la tarjeta no los recibimos: los trata directamente Mercado Pago.',
        'Datos técnicos: dirección IP y registros del servidor necesarios para la seguridad y para resolver errores.',
      ],
    },
    {
      titulo: '3. Para qué los usamos',
      lista: [
        'Prestar el servicio: crear tu cuenta, guardar y mostrar tus libros, y que el profesorado pueda entregar material, valorar y hacer seguimiento.',
        'Cobrar las licencias y emitir las cuentas de cobro y facturas.',
        'Atender tus consultas y avisarte de cambios importantes del servicio.',
        'Mantener la plataforma segura y corregir errores.',
      ],
      parrafos: [
        'No usamos tus datos para publicidad, no hacemos perfiles comerciales y no vendemos ni cedemos datos a terceros con fines comerciales.',
      ],
    },
    {
      titulo: '4. Base legal',
      parrafos: [
        'Tratamos los datos porque son necesarios para cumplir el contrato del servicio, porque nos lo exige la ley (por ejemplo, en materia fiscal) o, cuando corresponde, con tu autorización o la del centro. Tratamos los datos conforme a la Ley 1581 de 2012 de protección de datos personales de Colombia y sus normas complementarias.',
      ],
    },
    {
      titulo: '5. Alumnado menor de edad',
      parrafos: [
        'Las cuentas del alumnado las crea su centro. El centro es responsable de contar con la autorización de madres, padres o tutores cuando se requiera. Al alumnado le pedimos solo lo necesario para trabajar: su nombre y, si el centro lo usa, su correo institucional; los más pequeños pueden entrar con un código QR, sin correo ni contraseña.',
      ],
    },
    {
      titulo: '6. Con quién los compartimos',
      parrafos: [
        'Solo con los proveedores que necesitamos para prestar el servicio, que tratan los datos por nuestra cuenta y con las debidas garantías:',
      ],
      lista: ENCARGADOS,
    },
    {
      titulo: '7. Contenido de otros sitios',
      parrafos: [
        'Si un libro incluye un video o contenido de otro sitio (YouTube, Vimeo, Google, GeoGebra, Canva y similares), ese sitio solo se carga cuando alguien lo abre, y a partir de ese momento se aplica su propia política de privacidad. Los videos de YouTube se cargan por su dominio sin cookies.',
      ],
    },
    {
      titulo: '8. Cookies y almacenamiento',
      parrafos: [
        'No usamos cookies de publicidad ni de analítica. La sesión se guarda en el almacenamiento local de tu navegador para que no tengas que entrar cada vez; al cerrar sesión se borra.',
      ],
    },
    {
      titulo: '9. Dónde y cuánto tiempo',
      parrafos: [
        'Los datos se guardan en servidores de Amazon Web Services, cifrados en tránsito y con copia de seguridad diaria. Algunos de nuestros proveedores pueden estar fuera de Colombia; en ese caso exigimos garantías adecuadas para la transferencia.',
        'Conservamos los datos mientras la cuenta esté activa. Cuando se borra una cuenta, se eliminan con ella sus libros, notas y archivos; de las copias de seguridad desaparecen cuando estas se renuevan. Los datos de facturación se guardan el tiempo que exige la ley.',
      ],
    },
    {
      titulo: '10. Tus derechos',
      parrafos: [
        `Puedes pedirnos en cualquier momento conocer, actualizar, rectificar o suprimir tus datos, revocar una autorización o presentar una queja, escribiendo a ${correo}. Responderemos dentro de los plazos que fija la ley. Si tu cuenta la creó tu centro, puedes dirigirte también a él. Además, puedes acudir a la Superintendencia de Industria y Comercio.`,
      ],
    },
    {
      titulo: '11. Cambios en este aviso',
      parrafos: [
        'Si cambiamos este aviso de forma importante, lo comunicaremos en la plataforma o por correo. La fecha de la última versión figura al final de esta página.',
      ],
    },
  ],
};

export const REEMBOLSOS: DocumentoLegal = {
  slug: 'reembolsos',
  ruta: 'legal-reembolsos',
  titulo: 'Política de reembolsos',
  resumen: `Cuándo y cómo devolvemos el dinero de una licencia de ${servicio}.`,
  secciones: [
    {
      titulo: `1. ${DIAS_REEMBOLSO} días para pedir la devolución`,
      parrafos: [
        `Si ${servicio} no es lo que esperabas, puedes pedir la devolución íntegra de lo pagado dentro de los ${DIAS_REEMBOLSO} días naturales siguientes a la compra de una licencia o de su renovación. No hace falta dar explicaciones, aunque nos ayuda saber qué no funcionó.`,
      ],
    },
    {
      titulo: '2. Cómo pedirla',
      lista: [
        `Escríbenos a ${correo} desde el correo de la cuenta o el de facturación, indicando el plan y la fecha de compra (o el número de la cuenta de cobro).`,
        'Confirmaremos la solicitud en un plazo de tres días hábiles.',
      ],
    },
    {
      titulo: '3. Cómo se devuelve',
      parrafos: [
        'Devolvemos el dinero por el mismo medio con el que se pagó, a través de Mercado Pago. Una vez aprobada, el abono suele verse en tu cuenta o tarjeta en un plazo de 5 a 10 días hábiles, según tu banco.',
        'Al reembolsar una licencia, esta se cancela y dejan de estar disponibles las funciones del plan. Tus libros no se borran: puedes exportarlos o volver a contratar más adelante.',
      ],
    },
    {
      titulo: `4. Después de los ${DIAS_REEMBOLSO} días`,
      parrafos: [
        `Pasado ese plazo no devolvemos la parte no usada del periodo contratado, pero puedes cancelar la renovación en cualquier momento escribiendo a ${correo} y seguirás teniendo acceso hasta el final del periodo pagado.`,
        'Si el servicio deja de funcionar por causa nuestra durante un tiempo prolongado, o te cobramos por error o dos veces, te devolvemos lo que corresponda aunque hayan pasado los catorce días.',
      ],
    },
    {
      titulo: '5. Tus derechos como consumidor',
      parrafos: [
        'Esta política no limita los derechos que te reconozca la ley de protección al consumidor de tu país, incluido el derecho de retracto cuando proceda.',
      ],
    },
  ],
};

export const DOCUMENTOS_LEGALES: DocumentoLegal[] = [TERMINOS, PRIVACIDAD, REEMBOLSOS];
