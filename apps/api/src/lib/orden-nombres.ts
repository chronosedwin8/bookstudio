/**
 * Ordenar personas por apellidos, en SQL.
 *
 * El nombre completo no sirve para ordenar: cada via de alta lo escribe a su
 * manera (Phidias "NOMBRES APELLIDOS", Microsoft "APELLIDOS NOMBRES", a mano
 * como cada cual). Por eso se ordena por `family_name` y, si no lo hay, por el
 * nombre completo, que en el alumnado importado ya empieza por los apellidos.
 *
 * Sin tildes y en mayusculas: la base de produccion (Postgres sobre Alpine)
 * compara byte a byte, y "ÁLVAREZ" quedaba detras de "ZAPATA". La Ñ va con la N
 * (MUÑOZ entre MUNERA y MURILLO), que es donde se busca.
 */
export function ordenApellidos(alias: string): string {
  const clave = `upper(COALESCE(NULLIF(${alias}.family_name, ''), ${alias}.full_name) || ' ' || COALESCE(${alias}.given_name, ''))`;
  return `translate(${clave}, 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÇÑ', 'AAAAEEEEIIIIOOOOUUUUCN')`;
}

/**
 * Nombre para mostrar empezando por los apellidos ("ORTIZ HERAZO EDWIN"), con
 * las dos partes si estan guardadas y, si no, el nombre completo tal cual.
 */
export function nombrePorApellidos(alias: string): string {
  return `CASE WHEN NULLIF(${alias}.family_name, '') IS NOT NULL
               THEN trim(${alias}.family_name || ' ' || COALESCE(${alias}.given_name, ''))
               ELSE ${alias}.full_name END`;
}
