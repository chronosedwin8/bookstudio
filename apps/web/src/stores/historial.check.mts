/**
 * Comprobacion del historial de deshacer. Se ejecuta con:
 *   npx tsx apps/web/src/stores/historial.check.mts
 *
 * La logica delicada no es deshacer un paso, sino no perder el hilo: que rehacer
 * funcione, que una accion nueva invalide la rama abandonada, y sobre todo que
 * deshacer no se registre a si mismo, porque entonces nunca se sale del bucle.
 */
import { crearHistorial, describirElemento } from './historial.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const h = crearHistorial();
const traza: string[] = [];

const paso = (nombre: string) => ({
  descripcion: nombre,
  deshacer: async () => void traza.push(`-${nombre}`),
  rehacer: async () => void traza.push(`+${nombre}`),
});

check('empieza sin nada que deshacer', !h.puedeDeshacer.value && !h.puedeRehacer.value);

h.registrar(paso('mover imagen'));
h.registrar(paso('borrar texto'));
check('se puede deshacer tras registrar', h.puedeDeshacer.value);
check('anuncia lo ultimo hecho', h.siguienteDeshacer.value === 'borrar texto', String(h.siguienteDeshacer.value));

check('deshace el ultimo', (await h.deshacer()) === 'borrar texto', traza.join(','));
check('lo ejecuta de verdad', traza.at(-1) === '-borrar texto');
check('ahora se puede rehacer', h.puedeRehacer.value);
check('y lo siguiente a deshacer es el anterior', h.siguienteDeshacer.value === 'mover imagen');

check('rehace', (await h.rehacer()) === 'borrar texto');
check('lo ejecuta de verdad', traza.at(-1) === '+borrar texto');
check('y vuelve a estar en lo alto de la pila', h.siguienteDeshacer.value === 'borrar texto');

// Una accion nueva descarta la rama que quedaba por delante.
await h.deshacer();
check('hay algo por rehacer', h.puedeRehacer.value);
h.registrar(paso('anadir forma'));
check('un cambio nuevo descarta lo que habia por delante', !h.puedeRehacer.value);

// Lo importante: deshacer no debe registrarse a si mismo.
const g = crearHistorial();
g.registrar({
  descripcion: 'cambio con efecto',
  deshacer: async () => {
    // Como haria el editor: al deshacer se llama a una operacion que tambien registra.
    g.registrar(paso('efecto colateral'));
  },
  rehacer: async () => undefined,
});
await g.deshacer();
check(
  'deshacer no se registra a si mismo',
  !g.puedeDeshacer.value,
  `quedan ${g.siguienteDeshacer.value ?? 'ninguno'}`,
);

// El limite evita que la memoria crezca sin freno.
const l = crearHistorial();
for (let i = 0; i < 80; i += 1) l.registrar(paso(`cambio ${i}`));
let quedan = 0;
while (await l.deshacer()) quedan += 1;
check('el historial se queda en 50 pasos', quedan === 50, String(quedan));

check('describe los tipos en cristiano', describirElemento({ type: 'video' }) === 'vídeo');
check('y los que no conoce no revientan', typeof describirElemento({ type: 'text' }) === 'string');

const v = crearHistorial();
v.registrar(paso('algo'));
v.limpiar();
check('limpiar deja el historial vacio', !v.puedeDeshacer.value && !v.puedeRehacer.value);

// ---------------------------------------------------------------- agrupar

/*
 * Varias operaciones son UNA sola cosa para quien las hace: mover tres elementos
 * con las flechas, o borrar una seleccion de cinco. Antes cada una dejaba su
 * propio paso y habia que pulsar Ctrl+Z tantas veces como elementos, lo que no se
 * parece a lo que uno espera.
 */
console.log('\n-- Agrupar varios cambios en uno --');

const g2 = crearHistorial();
const hechos: string[] = [];
const pasoQueAnota = (nombre: string) => ({
  descripcion: nombre,
  deshacer: async () => { hechos.push(`-${nombre}`); },
  rehacer: async () => { hechos.push(`+${nombre}`); },
});

await g2.agrupar('mover 3 elementos', async () => {
  g2.registrar(pasoQueAnota('a'));
  g2.registrar(pasoQueAnota('b'));
  g2.registrar(pasoQueAnota('c'));
});

check('tres cambios dejan un solo paso', g2.siguienteDeshacer.value === 'mover 3 elementos',
  String(g2.siguienteDeshacer.value));

await g2.deshacer();
check('deshacer una vez los deshace los tres', hechos.join(',') === '-c,-b,-a', hechos.join(','));
check('y al reves, que es el unico orden que reconstruye lo anterior', hechos[0] === '-c', hechos.join(','));
check('no queda nada mas que deshacer', !g2.puedeDeshacer.value);

hechos.length = 0;
await g2.rehacer();
check('rehacer los rehace en su orden', hechos.join(',') === '+a,+b,+c', hechos.join(','));

// Un solo cambio dentro de una agrupacion toma el nombre del grupo
const g3 = crearHistorial();
await g3.agrupar('borrar 1 elemento', async () => {
  g3.registrar(pasoQueAnota('solo'));
});
check('con un solo cambio se usa el nombre del grupo',
  g3.siguienteDeshacer.value === 'borrar 1 elemento', String(g3.siguienteDeshacer.value));

// Una agrupacion vacia no debe dejar un paso que no hace nada
const g4 = crearHistorial();
await g4.agrupar('nada', async () => {});
check('agrupar sin cambios no deja paso', !g4.puedeDeshacer.value);

// Anidar no debe partir el grupo de fuera
const g5 = crearHistorial();
await g5.agrupar('el de fuera', async () => {
  g5.registrar(pasoQueAnota('uno'));
  await g5.agrupar('el de dentro', async () => {
    g5.registrar(pasoQueAnota('dos'));
  });
});
check('anidando manda la agrupacion de fuera',
  g5.siguienteDeshacer.value === 'el de fuera', String(g5.siguienteDeshacer.value));
hechos.length = 0;
await g5.deshacer();
check('y deshace los dos de una vez', hechos.join(',') === '-dos,-uno', hechos.join(','));

// Lo que devuelve la funcion de dentro tiene que llegar a quien llama
const devuelto = await crearHistorial().agrupar('x', async () => 42);
check('agrupar devuelve lo que devuelva la funcion', devuelto === 42, String(devuelto));

console.log(fallos ? `\n${fallos} fallos` : '\nHistorial correcto');
process.exit(fallos ? 1 : 0);
