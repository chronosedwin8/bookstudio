-- Botones en el lienzo y mural publico de libros.
--
-- Dos cosas independientes que van juntas por no partir una migracion en dos
-- para dos lineas cada una.

-- 1. El boton es un tipo de elemento mas.
--
-- Se anade a la restriccion en vez de quitarla: la lista cerrada es lo que evita
-- que una fila con un tipo inventado llegue a la base y reviente al leerla.
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_type_check;
ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_type_check
  CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video',
                  'map', 'icon', 'embed', 'question', 'chart', 'math', 'button'));

-- 2. El mural.
--
-- Se guarda CUANDO se publico y no un simple si/no: asi el mural se ordena por
-- lo mas reciente sin una columna aparte, y queda constancia de la fecha. NULL
-- significa que el libro no esta en el mural, que es como nacen todos.
ALTER TABLE books ADD COLUMN IF NOT EXISTS mural_at TIMESTAMP WITH TIME ZONE;

-- Quien lo puso, que no siempre es quien creo el libro: la administracion puede
-- publicar el trabajo de otra persona, y conviene saber quien lo hizo.
ALTER TABLE books ADD COLUMN IF NOT EXISTS mural_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN books.mural_at IS
  'Momento en que el libro se publico en el mural publico. NULL = no esta en el mural.';
COMMENT ON COLUMN books.mural_by IS
  'Quien lo publico en el mural; puede no ser su autor.';

-- El mural lista solo lo publicado, ordenado por lo mas reciente. El indice
-- parcial deja fuera los miles de libros que nunca se publican.
CREATE INDEX IF NOT EXISTS books_mural_idx ON books (mural_at DESC) WHERE mural_at IS NOT NULL;
