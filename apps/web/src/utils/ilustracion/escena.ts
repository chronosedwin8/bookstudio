/**
 * La escena: QUE debe aparecer, sin decir donde ni como se dibuja.
 *
 * Es lo unico que se guarda de una ilustracion. El dibujo no se almacena: se
 * vuelve a componer cada vez a partir de esto, que es deterministico. Asi una
 * ilustracion guardada hace meses mejora sola cuando mejora el dibujo, ocupa
 * cuatro lineas en la base de datos en vez de un SVG entero, y no hay ningun
 * SVG venido de fuera que sanear.
 */
import {
  MAXIMO_OBJETOS,
  MAXIMO_PERSONAJES,
  OBJETO_DE_LA_POSE,
  PREDETERMINADOS,
  VERSION_CATALOGO,
  VERSION_ESCENA,
  es,
  type Distribucion,
  type Emocion,
  type Fondo,
  type Objeto,
  type Papel,
  type Pose,
  type Posicion,
  type Tema,
} from './catalogo';

export interface PersonajeEscena {
  papel: Papel;
  pose: Pose;
  emocion: Emocion;
  posicion: Posicion;
  /** Que lleva en las manos, si la pose lo permite. */
  sostiene?: Objeto;
}

export interface ObjetoEscena {
  objeto: Objeto;
  posicion: Posicion;
}

export interface Escena {
  version: number;
  versionCatalogo: number;
  fondo: Fondo;
  distribucion: Distribucion;
  tema: Tema;
  personajes: PersonajeEscena[];
  objetos: ObjetoEscena[];
  /** Lo que se pidio, tal cual lo escribio la persona. Va al texto alternativo. */
  descripcion: string;
}

/** Una escena minima que siempre se puede dibujar, para cuando todo lo demas falla. */
export function escenaDeReserva(descripcion = ''): Escena {
  return {
    version: VERSION_ESCENA,
    versionCatalogo: VERSION_CATALOGO,
    fondo: PREDETERMINADOS.fondo,
    distribucion: 'single',
    tema: PREDETERMINADOS.tema,
    personajes: [
      {
        papel: 'teacher',
        pose: 'talking',
        emocion: 'engaged',
        posicion: 'center',
      },
    ],
    objetos: [],
    descripcion,
  };
}

const texto = (v: unknown, limite: number): string =>
  typeof v === 'string' ? v.slice(0, limite) : '';

/**
 * Deja una escena en condiciones de dibujarse.
 *
 * Nunca falla y nunca devuelve nada que el dibujo no sepa pintar: lo que no
 * reconoce lo cambia por el valor por omision, y lo que sobra lo recorta. Es la
 * red que permite que la IA se equivoque sin romper la pagina de nadie.
 */
export function normalizarEscena(bruto: unknown, descripcionPorDefecto = ''): Escena {
  const dato = (bruto ?? {}) as Record<string, unknown>;

  const distribucion: Distribucion = es.distribucion(dato.distribucion)
    ? dato.distribucion
    : PREDETERMINADOS.distribucion;

  const personajesBrutos = Array.isArray(dato.personajes) ? dato.personajes : [];
  const personajes: PersonajeEscena[] = personajesBrutos
    .slice(0, MAXIMO_PERSONAJES)
    .map((p) => normalizarPersonaje(p));

  const objetosBrutos = Array.isArray(dato.objetos) ? dato.objetos : [];
  const objetos: ObjetoEscena[] = objetosBrutos
    .slice(0, MAXIMO_OBJETOS)
    .map((o) => {
      const d = (o ?? {}) as Record<string, unknown>;
      return {
        objeto: es.objeto(d.objeto) ? d.objeto : 'book',
        posicion: es.posicion(d.posicion) ? d.posicion : 'center',
      };
    })
    // Un objeto repetido en el mismo sitio se dibujaria encima de si mismo
    .filter((o, i, lista) => lista.findIndex((x) => x.objeto === o.objeto && x.posicion === o.posicion) === i);

  const escena: Escena = {
    version: VERSION_ESCENA,
    versionCatalogo: VERSION_CATALOGO,
    fondo: es.fondo(dato.fondo) ? dato.fondo : PREDETERMINADOS.fondo,
    distribucion,
    tema: es.tema(dato.tema) ? dato.tema : PREDETERMINADOS.tema,
    personajes,
    objetos,
    descripcion: texto(dato.descripcion, 300) || descripcionPorDefecto.slice(0, 300),
  };

  // Una escena sin nadie no es una ilustracion educativa, es un fondo vacio
  if (escena.personajes.length === 0) {
    escena.personajes = [{ papel: 'student', pose: 'standing', emocion: 'engaged', posicion: 'center' }];
  }

  return coherente(escena);
}

function normalizarPersonaje(bruto: unknown): PersonajeEscena {
  const d = (bruto ?? {}) as Record<string, unknown>;
  const pose: Pose = es.pose(d.pose) ? d.pose : PREDETERMINADOS.pose;

  const personaje: PersonajeEscena = {
    papel: es.papel(d.papel) ? d.papel : PREDETERMINADOS.papel,
    pose,
    emocion: es.emocion(d.emocion) ? d.emocion : PREDETERMINADOS.emocion,
    posicion: es.posicion(d.posicion) ? d.posicion : PREDETERMINADOS.posicion,
  };

  const sostiene = es.objeto(d.sostiene) ? d.sostiene : OBJETO_DE_LA_POSE[pose];
  if (sostiene) personaje.sostiene = sostiene;

  return personaje;
}

/**
 * Arregla las contradicciones que quedan cuando cada campo por separado es
 * valido pero juntos no se sostienen.
 */
function coherente(escena: Escena): Escena {
  // La distribucion manda sobre cuanta gente cabe: pedir "pareja" con cuatro
  // personas dejaria dos fuera del lienzo.
  const cupo: Record<Distribucion, number> = { single: 1, pair: 2, group: 4, collaboration: 3 };
  const maximo = cupo[escena.distribucion];

  if (escena.personajes.length > maximo) {
    // Antes de recortar gente se prueba a subir de distribucion, que casi siempre
    // es lo que se queria decir: "tres estudiantes" con distribucion 'pair'.
    const mejor = (Object.keys(cupo) as Distribucion[])
      .filter((d) => cupo[d] >= escena.personajes.length)
      .sort((a, b) => cupo[a] - cupo[b])[0];
    if (mejor) escena.distribucion = mejor;
    else escena.personajes = escena.personajes.slice(0, maximo);
  }

  // Una pose que no deja las manos libres no puede sostener nada
  for (const p of escena.personajes) {
    if (p.sostiene && (p.pose === 'talking' || p.pose === 'pointing')) delete p.sostiene;
  }

  // Si alguien ya lleva el objeto en la mano, no hace falta otro suelto igual
  const enMano = new Set(escena.personajes.map((p) => p.sostiene).filter(Boolean));
  escena.objetos = escena.objetos.filter((o) => o.objeto === 'chat' || !enMano.has(o.objeto));

  return escena;
}

/** Resumen corto de la escena, para el texto alternativo y el panel. */
export function resumirEscena(escena: Escena): string {
  if (escena.descripcion.trim()) return escena.descripcion.trim();

  const cuenta = escena.personajes.length;
  const quien = cuenta === 1 ? 'una persona' : `${cuenta} personas`;
  return `Ilustracion educativa con ${quien}.`;
}
