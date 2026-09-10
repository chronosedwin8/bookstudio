-- Tablas en el lienzo.
--
-- Un tipo de elemento mas. Como en las anteriores, se anade a la lista cerrada
-- en vez de quitarla: esa lista es lo que impide que una fila con un tipo
-- inventado llegue a la base y reviente al leerla.
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_type_check;
ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_type_check
  CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video',
                  'map', 'icon', 'embed', 'question', 'chart', 'math', 'button',
                  'illustration', 'table'));
