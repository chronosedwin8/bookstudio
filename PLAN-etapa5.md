# Plan Etapa 5 — Colaboración, datos y exportación

Orden por dependencias: primero lo que se puede verificar solo, luego lo que necesita
piezas nuevas. Cada fase deja el proyecto en verde (`tsc`, `vue-tsc`, `vite build` y
las suites de `scripts/`).

## Fase 1 — Ajustes del lienzo y del editor

| # | Tarea | Enfoque |
| - | ----- | ------- |
| 1.1 | Forma rectángulo real | Al insertar, corregir el alto por la proporción de la página: un cuadrado sale cuadrado y el rectángulo sale 3:2 |
| 1.2 | Preguntas más grandes | El bloque escala su tipografía con el tamaño del elemento (unidades de contenedor) |
| 1.3 | Duplicar página | `POST /books/:id/pages/:pageId/duplicate`, copia elementos en una transacción |
| 1.4 | Enlace de inscripción copiable | Devolver el código y una URL `/unirse/:codigo`; botón de copiar junto al QR |
| 1.5 | Más plantillas | Ampliar `utils/templates.ts` (cómic, organizadores, portadas, rúbricas) |

## Fase 2 — Herramientas del lienzo

| # | Tarea | Enfoque |
| - | ----- | ------- |
| 2.1 | Selección múltiple | Rectángulo de selección + `Shift`+clic; mover y borrar en grupo |
| 2.2 | Pase de página realista | Volteo 3D con `perspective` y `rotateY` sobre el eje del lomo |
| 2.3 | Gráficas estadísticas | Tipo `chart` (barras, líneas, pastel, área) dibujado en SVG propio, sin dependencias; datos editables en el inspector |
| 2.4 | Biblioteca de sonidos | Reutilizar el proxy de Openverse (`type=audio`), que ya filtra por licencia CC |
| 2.5 | Más servicios incrustables | Añadir Canva, Genially, H5P, Padlet y Desmos a la lista blanca |

## Fase 3 — Personas y colaboración

| # | Tarea | Enfoque |
| - | ----- | ------- |
| 3.1 | Gestión de usuarios | Panel de admin: listar, crear, cambiar rol, restablecer contraseña, desactivar |
| 3.2 | Integración Phidias | Proxy en el **backend** (nunca en el navegador, para no exponer el token); importar secciones como bibliotecas y sus estudiantes como alumnos |
| 3.3 | Edición colaborativa | Marcar un libro como colaborativo: todo miembro de la biblioteca puede editarlo. Sin sincronización en vivo todavía (eso es WebSockets, Etapa 6) |

## Fase 4 — Texto y exportación

| # | Tarea | Enfoque |
| - | ----- | ------- |
| 4.1 | Fórmulas matemáticas | Elemento `math` con KaTeX (MIT) autoalojado |
| 4.2 | Editor de texto ampliado | Listas, interlineado y más controles sobre el modelo actual |
| 4.3 | Exportar a HTML | Página autónoma con los elementos como HTML/CSS; imágenes en línea |
| 4.4 | Exportar a PDF | Hoja de impresión + `window.print()`; sin dependencias de servidor |

## Criterios transversales

- **Nada de credenciales en el navegador.** El token de Phidias vive en `apps/api/.env`
  y solo lo usa el backend.
- Cada fase añade su ensayo funcional en `scripts/`.
- Todo lo nuevo debe seguir funcionando sin internet salvo lo que por definición
  dependa de un servicio externo (Openverse, Phidias, incrustaciones).
