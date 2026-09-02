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

console.log(fallos ? `\n${fallos} fallos` : '\nHistorial correcto');
process.exit(fallos ? 1 : 0);
