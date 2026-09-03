/**
 * Ejecuta una sentencia SQL contra la base de datos configurada. Se usa con:
 *   npm run sql --workspace @bookstudio/api -- "SELECT 1"
 *
 * Existe para los guiones de prueba: necesitan preparar situaciones que la API no
 * ofrece a proposito (ascender a alguien a administrador, dar una licencia por
 * pagada) y `psql` no siempre esta en el PATH en Windows. npm lo lanza con el
 * directorio del paquete como raiz, asi que lee apps/api/.env y apunta a la misma
 * base de datos que la aplicacion.
 *
 * No es una herramienta de produccion: no hay confirmacion ni copia de seguridad.
 */
import { pool } from './pool.js';

const sentencia = process.argv.slice(2).join(' ').trim();

if (!sentencia) {
  console.error('Falta la sentencia. Ejemplo: npm run sql --workspace @bookstudio/api -- "SELECT 1"');
  process.exit(2);
}

try {
  const resultado = await pool.query(sentencia);
  // Las filas van en JSON para que el guion que llame pueda leerlas.
  console.log(JSON.stringify(resultado.rows ?? []));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await pool.end();
}
