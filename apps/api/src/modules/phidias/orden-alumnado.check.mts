/**
 * El orden de las listas de clase que llegan de Phidias.
 *
 * Se ordena por apellidos. Los nombres de las pruebas son del tipo que manda de
 * verdad el colegio: mayusculas, tildes, dos apellidos y algun apellido de
 * varias palabras, que es donde fallan los atajos.
 */
import { porApellido } from './phidias.service.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${!ok && detalle ? ` -> ${detalle}` : ''}`);
};

interface Alumno {
  fullName: string;
  lastName: string;
}

const alumno = (nombres: string, apellidos: string): Alumno => ({
  fullName: `${nombres} ${apellidos}`,
  lastName: apellidos,
});

const ordenar = (lista: Alumno[]): string[] => [...lista].sort(porApellido).map((a) => a.lastName);

console.log('\n-- Por apellidos, no por nombre de pila --');

// Los de la captura del colegio: por nombre saldrian ABEL, ALANA, ANA...
const clase = [
  alumno('ABEL DAVID', 'LEÓN VAN HEYL'),
  alumno('ALANA', 'JAIMES AMAYA'),
  alumno('ANA LUCÍA', 'NAVARRO ACOSTA'),
  alumno('ANDRÉS FELIPE', 'PALACIO DEVIS'),
  alumno('ANTONELA', 'SANTIAGO CUELLO'),
  alumno('DAVID ANDRES', 'MENESES TORRES'),
];

const esperado = [
  'JAIMES AMAYA',
  'LEÓN VAN HEYL',
  'MENESES TORRES',
  'NAVARRO ACOSTA',
  'PALACIO DEVIS',
  'SANTIAGO CUELLO',
];

const salida = ordenar(clase);
check('la clase sale ordenada por apellido', JSON.stringify(salida) === JSON.stringify(esperado),
  salida.join(' | '));

check('y no por el nombre de pila', salida[0] !== 'LEÓN VAN HEYL',
  'el primero seria ABEL si se ordenara por nombre');

console.log('\n-- Casos que rompen los atajos --');

// Partir por el ultimo espacio daria "HEYL"; por los dos ultimos, "VAN HEYL"
const conApellidoLargo = ordenar([
  alumno('ABEL DAVID', 'LEÓN VAN HEYL'),
  alumno('MARIA', 'MARTINEZ GOMEZ'),
]);
check('un apellido de tres palabras va donde le toca (L antes que M)',
  conApellidoLargo[0] === 'LEÓN VAN HEYL', conApellidoLargo.join(' | '));

// Las tildes no pueden descolocar: en espanol se alfabetiza ignorandolas
const conTildes = ordenar([
  alumno('B', 'MUÑOZ'),
  alumno('A', 'MUNOZ'),
  alumno('C', 'MORALES'),
]);
check('las tildes no descolocan', conTildes[0] === 'MORALES', conTildes.join(' | '));
check('MUNOZ y MUÑOZ quedan juntos y por nombre',
  conTildes[1] === 'MUNOZ' && conTildes[2] === 'MUÑOZ', conTildes.join(' | '));

// Mismos apellidos: decide el nombre, que es lo que hace una lista de clase
const hermanos = [...[
  alumno('SOFIA', 'RIVERA LOPEZ'),
  alumno('ANDRES', 'RIVERA LOPEZ'),
  alumno('MARIA', 'RIVERA LOPEZ'),
]].sort(porApellido).map((a) => a.fullName);
check('a igualdad de apellidos manda el nombre',
  hermanos[0].startsWith('ANDRES') && hermanos[2].startsWith('SOFIA'), hermanos.join(' | '));

// Minusculas mezcladas: no pueden mandar a nadie al final de la lista
const mezcla = ordenar([
  alumno('Ana', 'zapata'),
  alumno('Luis', 'ACOSTA'),
  alumno('Eva', 'Bermudez'),
]);
check('mayusculas y minusculas no alteran el orden',
  JSON.stringify(mezcla) === JSON.stringify(['ACOSTA', 'Bermudez', 'zapata']), mezcla.join(' | '));

console.log('\n-- Sin apellido --');

// Phidias puede no traerlo; quien no lo tenga no puede tumbar la lista
const sinApellido = [...[
  alumno('ZULEMA', 'AGUIRRE'),
  { fullName: 'Alumno 4821', lastName: '' },
  alumno('BRUNO', 'BASTIDAS'),
]].sort(porApellido).map((a) => a.lastName || '(sin apellido)');
check('quien no trae apellido no rompe el orden', sinApellido.length === 3, sinApellido.join(' | '));
check('y queda al principio, no perdido en medio', sinApellido[0] === '(sin apellido)',
  sinApellido.join(' | '));

console.log('\n-- Es un orden de verdad --');

// Un comparador incoherente hace que el resultado dependa del orden de entrada
const base = [
  alumno('A', 'PEREZ'),
  alumno('B', 'GOMEZ'),
  alumno('C', 'ALVAREZ'),
  alumno('D', 'ZAMORA'),
  alumno('E', 'MARTIN'),
];
const unaVez = ordenar(base);
const alReves = ordenar([...base].reverse());
check('el resultado no depende de como llegue la lista',
  JSON.stringify(unaVez) === JSON.stringify(alReves), `${unaVez.join(',')} vs ${alReves.join(',')}`);
check('y es ascendente', JSON.stringify(unaVez) === JSON.stringify(['ALVAREZ', 'GOMEZ', 'MARTIN', 'PEREZ', 'ZAMORA']),
  unaVez.join(' | '));

console.log(fallos === 0 ? '\norden del alumnado: todo correcto' : `\norden del alumnado: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
