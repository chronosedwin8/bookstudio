/**
 * Phidias y el correo corregido a mano.
 *
 * Necesita la base de datos, por eso no va en test:unit: lo lanza
 * scripts/smoke-transferir-y-correo.ps1. Todo ocurre dentro de una transaccion que
 * se deshace al final, asi que no deja nada escrito.
 *
 * El fallo que protege: antes la importacion buscaba al alumno SOLO por correo. Si
 * un docente se lo corregia (alumnado con correo de fuera del colegio, que no puede
 * entrar con Microsoft), la siguiente importacion no lo encontraba, intentaba
 * crearlo otra vez y chocaba con el indice unico de su identificador de Phidias:
 * fallaba la importacion de la seccion entera.
 */
import assert from 'node:assert/strict';
import { closePool, pool } from '../../db/pool.ts';
import { cuentaDeAlumno, type PhidiasStudent } from './phidias.service.ts';

let hechas = 0;
async function prueba(nombre: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  hechas++;
  console.log('  OK  ', nombre);
}

const client = await pool.connect();
const sufijo = Math.random().toString(36).slice(2, 8);
// Identificadores que Phidias nunca daria, para no tocar alumnado real.
const idPhidias = 900_000_000 + Math.floor(Math.random() * 90_000_000);

const alumno: PhidiasStudent = {
  id: idPhidias,
  firstname: 'Lucia',
  lastname: `Prueba ${sufijo}`,
  email: `lucia.${sufijo}@gmail.test`,
  code: 12345,
};

console.log('\n== Phidias y el correo corregido ==');

try {
  await client.query('BEGIN');

  let cuentaId = '';

  await prueba('la primera importacion crea la cuenta con el correo de Phidias', async () => {
    const r = await cuentaDeAlumno(client, alumno, alumno.email!, '10A');
    assert.equal(r.inserted, true);
    cuentaId = r.id;
    const { rows } = await client.query('SELECT email, external_id FROM users WHERE id = $1', [cuentaId]);
    assert.equal(rows[0].email, alumno.email);
    assert.equal(rows[0].external_id, String(idPhidias));
  });

  const corregido = `lucia.${sufijo}@colegio.test`;
  await client.query('UPDATE users SET email = $2 WHERE id = $1', [cuentaId, corregido]);

  await prueba('tras corregir el correo, reimportar NO falla', async () => {
    // Phidias sigue mandando el correo viejo: es lo que pasa en la realidad.
    await cuentaDeAlumno(client, { ...alumno, lastname: `Prueba ${sufijo} Renombrada` }, alumno.email!, '11A');
  });

  await prueba('reconoce a la misma persona: no crea una segunda cuenta', async () => {
    const { rows } = await client.query(
      "SELECT id FROM users WHERE external_source = 'phidias' AND external_id = $1",
      [String(idPhidias)],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, cuentaId);

    const viejo = await client.query('SELECT id FROM users WHERE email = $1', [alumno.email]);
    assert.equal(viejo.rows.length, 0, 'se ha creado una cuenta con el correo viejo');
  });

  await prueba('y NO le devuelve el correo viejo: la correccion manda', async () => {
    const { rows } = await client.query('SELECT email FROM users WHERE id = $1', [cuentaId]);
    assert.equal(rows[0].email, corregido);
  });

  await prueba('nombre y curso si se refrescan desde Phidias', async () => {
    const { rows } = await client.query('SELECT full_name, external_group FROM users WHERE id = $1', [cuentaId]);
    assert.match(rows[0].full_name, /Renombrada/);
    assert.equal(rows[0].external_group, '11A');
  });

  await prueba('la contrasena que la persona se puso no se toca', async () => {
    await client.query("UPDATE users SET password_hash = 'propia', password_is_default = FALSE WHERE id = $1", [cuentaId]);
    const r = await cuentaDeAlumno(client, alumno, alumno.email!, '11A');
    assert.equal(r.password_is_default, false);
    const { rows } = await client.query('SELECT password_hash FROM users WHERE id = $1', [cuentaId]);
    assert.equal(rows[0].password_hash, 'propia');
  });

  await prueba('una cuenta hecha a mano con ese correo se sigue reaprovechando', async () => {
    const otro: PhidiasStudent = { id: idPhidias + 1, firstname: 'Mario', lastname: sufijo, email: `mario.${sufijo}@colegio.test` };
    const manual = await client.query(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Mario a mano', 'student') RETURNING id",
      [otro.email],
    );
    const r = await cuentaDeAlumno(client, otro, otro.email!, '10A');
    assert.equal(r.inserted, false);
    assert.equal(r.id, manual.rows[0].id);
  });

  console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
} finally {
  await client.query('ROLLBACK');
  client.release();
  await closePool();
}
