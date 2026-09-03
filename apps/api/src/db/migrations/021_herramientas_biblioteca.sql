-- Que herramientas del editor puede usar el alumnado de cada biblioteca.
--
-- Se guardan las DESACTIVADAS, no las permitidas. Asi todo esta habilitado por
-- omision, que es lo pedido, y una herramienta nueva aparece encendida sin tener
-- que tocar las bibliotecas que ya existen. Con la lista al reves, cada funcion
-- nueva nacería apagada en todo el colegio hasta que alguien la activara una por una.

ALTER TABLE libraries ADD COLUMN IF NOT EXISTS disabled_tools JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN libraries.disabled_tools IS
  'Herramientas del editor vetadas al alumnado de esta biblioteca. Vacio = todas disponibles.';
