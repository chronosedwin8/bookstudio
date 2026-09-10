/**
 * Comprobaciones del motor de ilustraciones.
 *
 * Lo importante que se vigila aqui:
 *
 * 1. Que las dos copias del catalogo (servidor y navegador) digan lo mismo. Si
 *    se separan, el servidor aceptaria escenas que el dibujo no sabe pintar.
 * 2. Que nada inventado llegue al dibujo, venga de donde venga.
 * 3. Que el dibujo sea deterministico y no produzca SVG peligroso.
 */
import {
  DISTRIBUCIONES,
  EMOCIONES,
  FONDOS,
  MAXIMO_PERSONAJES,
  OBJETOS,
  PAPELES,
  POSES,
  POSICIONES,
  TEMAS,
  VERSION_CATALOGO,
  VERSION_ESCENA,
} from './catalogo.js';
import { componer } from './composicion.js';
import { dibujarEscena } from './dibujo.js';
import { escenaDeReserva, normalizarEscena, resumirEscena, type Escena } from './escena.js';
import { ALTO_LIENZO, ANCHO_LIENZO, aplanar, primitivaASvg, svgCompleto } from './primitivas.js';

// La copia del servidor, importada de verdad: comparar contra una lista escrita
// aqui no probaria nada.
import * as servidor from '../../../../api/src/modules/illustrations/illustrations.schemas.js';
import { analizarLocalmente } from '../../../../api/src/modules/illustrations/lectura.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${!ok && detalle ? ` -> ${detalle}` : ''}`);
};

const iguales = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------- catalogo

console.log('\n-- Las dos copias del catalogo --');
check('papeles', iguales(PAPELES, servidor.PAPELES), `${PAPELES} vs ${servidor.PAPELES}`);
check('poses', iguales(POSES, servidor.POSES), `${POSES} vs ${servidor.POSES}`);
check('emociones', iguales(EMOCIONES, servidor.EMOCIONES));
check('posiciones', iguales(POSICIONES, servidor.POSICIONES));
check('objetos', iguales(OBJETOS, servidor.OBJETOS));
check('fondos', iguales(FONDOS, servidor.FONDOS));
check('distribuciones', iguales(DISTRIBUCIONES, servidor.DISTRIBUCIONES));
check('temas', iguales(TEMAS, servidor.TEMAS));
check('tope de personajes', MAXIMO_PERSONAJES === servidor.MAXIMO_PERSONAJES);
check('version de escena', VERSION_ESCENA === servidor.VERSION_ESCENA);
check('version de catalogo', VERSION_CATALOGO === servidor.VERSION_CATALOGO);

// ---------------------------------------------------------------- validacion

console.log('\n-- Nada inventado llega al dibujo --');

const inventada = normalizarEscena({
  fondo: 'marte',
  distribucion: 'pandilla',
  tema: 'neon',
  personajes: [
    { papel: 'alien', pose: 'volando', emocion: 'furioso', posicion: 'orbita' },
  ],
  objetos: [{ objeto: 'spaceship', posicion: 'luna' }],
});
check('un fondo que no existe cae en uno que si', FONDOS.includes(inventada.fondo), inventada.fondo);
check('una pose inventada cae en una real', POSES.includes(inventada.personajes[0].pose));
check('un papel inventado cae en uno real', PAPELES.includes(inventada.personajes[0].papel));
check('una nave espacial no pasa', inventada.objetos.every((o) => OBJETOS.includes(o.objeto)),
  JSON.stringify(inventada.objetos));
check('y aun asi se puede dibujar', dibujarEscena(inventada).length > 0);

check('sin personajes se pone uno', normalizarEscena({ personajes: [] }).personajes.length === 1);
check('null no revienta', normalizarEscena(null).personajes.length === 1);
check('una cadena tampoco', normalizarEscena('hola' as unknown).personajes.length === 1);

const demasiados = normalizarEscena({
  distribucion: 'single',
  personajes: Array.from({ length: 12 }, () => ({ papel: 'student', pose: 'standing' })),
});
check('doce personajes se recortan al tope', demasiados.personajes.length <= MAXIMO_PERSONAJES,
  String(demasiados.personajes.length));
check('y la distribucion se ajusta a cuantos quedan', demasiados.distribucion !== 'single',
  demasiados.distribucion);

const conManosOcupadas = normalizarEscena({
  personajes: [{ papel: 'student', pose: 'pointing', sostiene: 'tablet' }],
});
check('senalando no se puede sostener nada', conManosOcupadas.personajes[0].sostiene === undefined);

const leyendo = normalizarEscena({ personajes: [{ papel: 'student', pose: 'reading' }] });
check('leyendo se coge un libro sin pedirlo', leyendo.personajes[0].sostiene === 'book');

// El servidor rechaza lo que el navegador arregla: son dos defensas distintas
const rechazada = servidor.escenaSchema.safeParse({
  fondo: 'marte',
  personajes: [{ papel: 'alien' }],
});
check('el servidor rechaza lo inventado en vez de arreglarlo', rechazada.success === false);

const aceptada = servidor.escenaSchema.safeParse(inventada);
check('y acepta lo que el navegador ya normalizo', aceptada.success === true,
  aceptada.success ? '' : JSON.stringify(aceptada.error.issues.slice(0, 2)));

// ---------------------------------------------------------------- composicion

console.log('\n-- La composicion reparte sitio --');

for (const cuantos of [1, 2, 3, 4]) {
  const escena = normalizarEscena({
    distribucion: 'group',
    personajes: Array.from({ length: cuantos }, () => ({ papel: 'student', pose: 'standing', posicion: 'center' })),
  });
  const { personajes } = componer(escena);

  check(`con ${cuantos} nadie se sale del lienzo`,
    personajes.every((p) => p.x > 0 && p.x < ANCHO_LIENZO), JSON.stringify(personajes.map((p) => p.x)));

  const separaciones = personajes
    .map((p) => p.x)
    .sort((a, b) => a - b)
    .flatMap((x, i, lista) => (i === 0 ? [] : [lista[i] - lista[i - 1]]));
  check(`con ${cuantos} no se amontonan aunque pidan el mismo sitio`,
    separaciones.every((d) => d > 60), JSON.stringify(separaciones.map(Math.round)));
}

// ---------------------------------------------------------------- dibujo

console.log('\n-- El dibujo --');

const base = normalizarEscena({
  fondo: 'classroom',
  personajes: [{ papel: 'teacher', pose: 'pointing', emocion: 'engaged', posicion: 'left' }],
});

const uno = JSON.stringify(dibujarEscena(base));
const dos = JSON.stringify(dibujarEscena(normalizarEscena(JSON.parse(JSON.stringify(base)))));
check('la misma escena da siempre el mismo dibujo', uno === dos);

check('todas las poses se dibujan', POSES.every((pose) =>
  dibujarEscena(normalizarEscena({ personajes: [{ papel: 'student', pose }] })).length > 5));
check('todos los fondos se dibujan', FONDOS.every((fondo) =>
  dibujarEscena(normalizarEscena({ fondo, personajes: [{ papel: 'student' }] })).length > 5));
check('todos los objetos se dibujan', OBJETOS.every((objeto) =>
  dibujarEscena(normalizarEscena({ personajes: [{ papel: 'student' }], objetos: [{ objeto, posicion: 'foreground' }] })).length > 5));
check('todas las emociones se dibujan', EMOCIONES.every((emocion) =>
  dibujarEscena(normalizarEscena({ personajes: [{ papel: 'student', emocion }] })).length > 5));
check('todos los temas se dibujan', TEMAS.every((tema) =>
  dibujarEscena(normalizarEscena({ tema, personajes: [{ papel: 'student' }] })).length > 5));

const conGrupos = aplanar([
  { tipo: 'grupo', opacidad: 0.5, hijos: [{ tipo: 'circulo', cx: 1, cy: 1, r: 1, relleno: '#000000', opacidad: 0.5 }] },
]);
check('aplanar deja las formas sueltas', conGrupos.length === 1 && conGrupos[0].tipo === 'circulo');
check('y multiplica la opacidad heredada', Math.abs((conGrupos[0].opacidad ?? 1) - 0.25) < 1e-9,
  String(conGrupos[0].opacidad));

// ---------------------------------------------------------------- seguridad

console.log('\n-- Seguridad del SVG --');

const svg = svgCompleto(dibujarEscena(base), '<script>alert(1)</script>', 'Comillas " y < menor');
check('no hay ningun script en el SVG', !/<script/i.test(svg));
check('ni foreignObject', !/<foreignObject/i.test(svg));
check('ni recursos de fuera', !/https?:\/\/(?!www\.w3\.org)/i.test(svg), svg.slice(0, 120));
check('el titulo se escapa', svg.includes('&lt;script&gt;'));
check('las comillas tambien', svg.includes('&quot;'));

const rutaSucia = primitivaASvg({ tipo: 'ruta', d: 'M0 0" onload="alert(1)', relleno: '#000000' });
check('una ruta con marcado dentro no se emite', rutaSucia === '', rutaSucia);

const colorSucio = primitivaASvg({ tipo: 'circulo', cx: 0, cy: 0, r: 1, relleno: 'url(#x)' });
check('un color que no es color se sustituye', !colorSucio.includes('url('), colorSucio);

const escenaConTexto = normalizarEscena({ personajes: [{ papel: 'student' }] }, '<img src=x onerror=alert(1)>');
const svgTexto = svgCompleto(dibujarEscena(escenaConTexto), resumirEscena(escenaConTexto), resumirEscena(escenaConTexto));
check('la descripcion del usuario no se cuela como marcado', !svgTexto.includes('<img'),
  svgTexto.slice(svgTexto.indexOf('<desc'), svgTexto.indexOf('</desc>')));

// ---------------------------------------------------------------- lectura del texto

console.log('\n-- Del texto a la escena (modo local) --');

const casos: Array<{ texto: string; espera: (e: Escena) => boolean; que: string }> = [
  {
    texto: 'Un profesor explicando matematicas a dos estudiantes',
    que: 'sale un docente y dos estudiantes',
    espera: (e) => e.personajes.filter((p) => p.papel === 'teacher').length === 1
      && e.personajes.filter((p) => p.papel === 'student').length === 2,
  },
  {
    texto: 'Tres estudiantes colaborando en una actividad utilizando tablets',
    que: 'salen tres, con tablet y en colaboracion',
    espera: (e) => e.personajes.length === 3
      && e.personajes.every((p) => p.pose === 'using_tablet')
      && e.distribucion === 'collaboration',
  },
  {
    texto: 'Una estudiante leyendo un libro en la biblioteca',
    que: 'sale una leyendo, en la biblioteca',
    espera: (e) => e.personajes.length === 1 && e.personajes[0].pose === 'reading' && e.fondo === 'library',
  },
  {
    texto: 'Estudiantes trabajando con portatiles en la clase de tecnologia',
    que: 'el fondo y el tema son tecnologicos',
    espera: (e) => e.fondo === 'technology' && e.tema === 'technology',
  },
];

for (const caso of casos) {
  const escena = normalizarEscena(analizarLocalmente({ texto: caso.texto }));
  check(`"${caso.texto.slice(0, 46)}...": ${caso.que}`, caso.espera(escena),
    JSON.stringify({ n: escena.personajes.length, fondo: escena.fondo, tema: escena.tema,
      poses: escena.personajes.map((p) => `${p.papel}/${p.pose}`), dist: escena.distribucion }));
}

check('un texto sin nada reconocible sigue dando una escena',
  normalizarEscena(analizarLocalmente({ texto: 'xyz qwerty' })).personajes.length >= 1);

// ---------------------------------------------------------------- reserva

console.log('\n-- La escena de reserva --');
const reserva = escenaDeReserva('algo fallo');
check('la reserva es valida para el servidor', servidor.escenaSchema.safeParse(reserva).success);
check('y se dibuja', dibujarEscena(reserva).length > 5);
check('el lienzo mide lo que dice', ANCHO_LIENZO === 800 && ALTO_LIENZO === 500);

console.log(fallos === 0 ? '\nilustracion: todo correcto' : `\nilustracion: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
