-- Numeracion de paginas de un libro.
--
-- Es un ajuste del libro, no un elemento por pagina: se define una vez (formato,
-- estilo, posicion, desde donde se cuenta) y aparece sola en todas las hojas, al
-- editar, al leer, al imprimir y al exportar. NULL = sin numeracion, que es como
-- estan todos los libros hasta hoy.

ALTER TABLE books ADD COLUMN IF NOT EXISTS page_numbering JSONB;
