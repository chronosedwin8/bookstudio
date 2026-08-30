/**
 * Comprobacion del limitador. Se ejecuta con:
 *   npx tsx apps/api/src/lib/rate-limit.check.mts
 */
import { createRateLimiter } from './rate-limit.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

// --- Tope ---
const l = createRateLimiter(3, 60_000);
const resultados = [l.hit('a'), l.hit('a'), l.hit('a'), l.hit('a')];
check('deja pasar hasta el tope', resultados.slice(0, 3).every((r) => r === false), String(resultados));
check('bloquea al superarlo', resultados[3] === true);
check('sigue bloqueando despues', l.hit('a') === true);

// --- Aislamiento por clave ---
check('otra IP no queda afectada', l.hit('b') === false);
check('restantes de la otra IP', l.remaining('b') === 2, String(l.remaining('b')));
check('restantes de la agotada', l.remaining('a') === 0, String(l.remaining('a')));

// --- La ventana expira ---
const corto = createRateLimiter(2, 60);
corto.hit('c'); corto.hit('c');
check('agotada dentro de la ventana', corto.hit('c') === true);
await new Promise((r) => setTimeout(r, 90));
check('se libera al pasar la ventana', corto.hit('c') === false);

// --- reset ---
const r2 = createRateLimiter(1, 60_000);
r2.hit('d'); 
check('agotada antes del reset', r2.hit('d') === true);
r2.reset('d');
check('reset libera esa clave', r2.hit('d') === false);
r2.hit('e');
r2.reset();
check('reset sin clave lo vacia todo', r2.remaining('e') === 1, String(r2.remaining('e')));

// --- Valores del formulario de contacto: 20 por hora ---
const contacto = createRateLimiter(20, 60 * 60_000);
let bloqueadoEn = -1;
for (let i = 1; i <= 25; i++) if (contacto.hit('colegio') && bloqueadoEn < 0) bloqueadoEn = i;
check('el formulario admite 20 envios por hora', bloqueadoEn === 21, `bloqueo en el ${bloqueadoEn}`);

console.log(fallos ? `\n${fallos} fallos` : '\nLimitador correcto');
process.exit(fallos ? 1 : 0);
