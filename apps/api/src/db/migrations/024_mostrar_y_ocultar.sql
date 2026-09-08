-- Mostrar y ocultar objetos al pulsar otro objeto.
--
-- Va en su propia columna, al lado de `interaction` y `animation`, porque es lo
-- mismo que ellas: algo que vale para cualquier tipo de elemento y que no tiene
-- sitio dentro de `properties`, que es distinto en cada tipo.
--
-- Contenido:
--   {
--     "key": "roble",            nombre del objeto dentro de su pagina
--     "startHidden": true,       en modo lectura arranca invisible
--     "rules": [                 lo que hace este objeto al pulsarlo
--       { "trigger": "click", "action": "show", "target": "roble" }
--     ]
--   }
--
-- Los objetivos se apuntan POR NOMBRE y no por identificador a proposito. Al
-- duplicar una pagina o repartirla a la clase, cada elemento recibe un id nuevo:
-- unas reglas guardadas por id quedarian apuntando al vacio, o peor, a los
-- elementos de la pagina original. El nombre se copia tal cual y se resuelve
-- dentro de la propia pagina, asi que la copia funciona sin tocar nada.
ALTER TABLE canvas_elements ADD COLUMN IF NOT EXISTS actions JSONB;

COMMENT ON COLUMN canvas_elements.actions IS
  'Nombre del objeto en su pagina, si arranca oculto, y que muestra u oculta al pulsarlo. NULL = nada.';
