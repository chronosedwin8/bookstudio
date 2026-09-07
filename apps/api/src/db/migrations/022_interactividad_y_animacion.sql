-- Interactividad y animacion de los elementos del lienzo.
--
-- Van como columnas propias del elemento y no dentro de `properties` porque
-- valen para cualquier tipo. La otra opcion era copiar el mismo bloque en los
-- doce esquemas de tipo, que es justo lo que ya paso con `linkUrl`: acabo en
-- cuatro de ellos y hay que acordarse de mantenerlos a la par.
--
-- NULL significa "sin interactividad" y "sin animacion", que es como nace todo
-- lo que ya existe y todo lo que se cree sin tocar nada.

-- { kind: 'tooltip'|'popup', trigger: 'hover'|'click', title, text, imageUrl? }
ALTER TABLE canvas_elements ADD COLUMN IF NOT EXISTS interaction JSONB;

-- { trigger: 'entrance'|'loop'|'hover'|'click', effect, duration, delay }
ALTER TABLE canvas_elements ADD COLUMN IF NOT EXISTS animation JSONB;

COMMENT ON COLUMN canvas_elements.interaction IS
  'Informacion ampliada que se muestra al pasar el raton o al pulsar. NULL = ninguna.';
COMMENT ON COLUMN canvas_elements.animation IS
  'Animacion del elemento en modo lectura. NULL = ninguna.';
