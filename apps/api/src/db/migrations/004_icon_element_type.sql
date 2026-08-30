-- Iconos y emojis como nuevo tipo de elemento del lienzo.
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_type_check;

ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_type_check
    CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video', 'map', 'icon'));
