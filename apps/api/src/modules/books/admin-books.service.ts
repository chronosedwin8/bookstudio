import { query } from '../../db/pool.js';

/**
 * Libros de toda la plataforma, para la administracion.
 *
 * Existe para poder limpiar en masa: libros de cuentas de prueba, entregas
 * repetidas, material de cursos pasados. Dentro de una biblioteca ya se podia
 * borrar en masa, pero la administracion no tenia una vista de TODO donde buscar
 * y marcar sin entrar biblioteca por biblioteca.
 */

export interface LibroAdmin {
  id: string;
  title: string;
  creatorName: string | null;
  creatorEmail: string | null;
  libraryId: string | null;
  libraryName: string | null;
  pageCount: number;
  isTrial: boolean;
  updatedAt: string;
}

export interface PaginaLibrosAdmin {
  items: LibroAdmin[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FiltroLibrosAdmin {
  search?: string;
  /** personal = sin biblioteca; library = en una; trial = de cuentas de prueba. */
  scope: 'all' | 'personal' | 'library' | 'trial';
  page: number;
  pageSize: number;
}

export async function listarLibros(filtro: FiltroLibrosAdmin): Promise<PaginaLibrosAdmin> {
  const condiciones: string[] = ['TRUE'];
  const valores: unknown[] = [];

  if (filtro.search) {
    valores.push(`%${filtro.search}%`);
    const n = valores.length;
    // Por titulo, por autor (nombre o correo) o por biblioteca: es como se busca.
    condiciones.push(`(b.title ILIKE $${n} OR u.full_name ILIKE $${n} OR u.email ILIKE $${n} OR l.name ILIKE $${n})`);
  }
  if (filtro.scope === 'personal') condiciones.push('b.library_id IS NULL');
  if (filtro.scope === 'library') condiciones.push('b.library_id IS NOT NULL');
  if (filtro.scope === 'trial') condiciones.push('u.is_trial = TRUE');

  const desde = `FROM books b
    LEFT JOIN users u ON u.id = b.creator_id
    LEFT JOIN libraries l ON l.id = b.library_id
    WHERE ${condiciones.join(' AND ')}`;

  const total = Number((await query<{ n: string }>(`SELECT COUNT(*) AS n ${desde}`, valores)).rows[0].n);

  valores.push(filtro.pageSize, (filtro.page - 1) * filtro.pageSize);
  const { rows } = await query<{
    id: string;
    title: string;
    creator_name: string | null;
    creator_email: string | null;
    library_id: string | null;
    library_name: string | null;
    page_count: string;
    is_trial: boolean | null;
    updated_at: Date;
  }>(
    `SELECT b.id, b.title, u.full_name AS creator_name, u.email AS creator_email,
            b.library_id, l.name AS library_name, u.is_trial,
            (SELECT COUNT(*) FROM pages p WHERE p.book_id = b.id) AS page_count,
            b.updated_at
     ${desde}
     ORDER BY b.updated_at DESC
     LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      creatorName: r.creator_name,
      creatorEmail: r.creator_email,
      libraryId: r.library_id,
      libraryName: r.library_name,
      pageCount: Number(r.page_count),
      isTrial: r.is_trial === true,
      updatedAt: r.updated_at.toISOString(),
    })),
    total,
    page: filtro.page,
    pageSize: filtro.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filtro.pageSize)),
  };
}

/**
 * Borra los libros indicados, de quien sean. Solo la administracion llega aqui.
 * Los ids van explicitos: nunca hay un "borra todo lo que coincida" a ciegas.
 */
export async function borrarLibros(bookIds: string[]): Promise<{ deleted: number; ignored: number }> {
  const { rowCount } = await query('DELETE FROM books WHERE id = ANY($1::uuid[])', [bookIds]);
  const borrados = rowCount ?? 0;
  return { deleted: borrados, ignored: bookIds.length - borrados };
}
