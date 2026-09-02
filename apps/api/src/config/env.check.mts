/**
 * Comprobacion de las banderas del entorno. Se ejecuta con:
 *   npx tsx apps/api/src/config/env.check.mts
 *
 * Existe por una trampa concreta: `z.coerce.boolean()` convierte cualquier cadena
 * no vacia en true, la cadena "false" incluida. Aplicada a
 * MAGNIFIC_ALLOW_STUDENTS, apagar la bandera la habria encendido, y con ella el
 * gasto de creditos de todo el alumnado. Es un fallo mudo: nada falla, solo se
 * gasta dinero.
 */
process.env.JWT_SECRET ??= 'secreto-de-prueba-para-comprobaciones-1234';
process.env.PGHOST ??= 'localhost';
process.env.PGUSER ??= 'postgres';
process.env.PGPASSWORD ??= '';
process.env.PGDATABASE ??= 'bookstudio';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

/** Recarga el modulo de entorno con un valor concreto de la bandera. */
async function conBandera(valor: string | undefined): Promise<boolean> {
  if (valor === undefined) delete process.env.MAGNIFIC_ALLOW_STUDENTS;
  else process.env.MAGNIFIC_ALLOW_STUDENTS = valor;
  // La cache de modulos guardaria el primer valor: se fuerza una copia nueva.
  const { env } = await import(`./env.js?v=${Math.random()}`);
  return env.MAGNIFIC_ALLOW_STUDENTS;
}

check('sin poner nada, el alumnado no genera', (await conBandera(undefined)) === false);
check('"false" apaga de verdad', (await conBandera('false')) === false);
check('"0" apaga', (await conBandera('0')) === false);
check('vacio apaga', (await conBandera('')) === false);
check('cualquier cosa rara apaga', (await conBandera('quiza')) === false);
check('"true" enciende', (await conBandera('true')) === true);
check('"TRUE" enciende', (await conBandera('TRUE')) === true);
check('"1" enciende', (await conBandera('1')) === true);
check('"si" enciende', (await conBandera('si')) === true);

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
