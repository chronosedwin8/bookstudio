# BookStudio

Creador de libros interactivos educativos, 100% open source.

## Stack

| Capa      | Tecnología                                  |
| --------- | ------------------------------------------- |
| Frontend  | Vue 3 + TypeScript + Pinia + Tailwind + Vite |
| Backend   | Node.js + Express + TypeScript              |
| Base datos| PostgreSQL 17                               |

## Puesta en marcha

```powershell
npm install
npm run migrate      # aplica el esquema
npm run seed         # datos de demostración (opcional)
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

La configuración del backend vive en `apps/api/.env` (ver `.env.example`).

## Despliegue en producción (Coolify)

Un solo contenedor: la API compilada sirve también el frontend, así que no hace falta
proxy delante ni un segundo servicio web.

```bash
docker compose -f docker-compose.prod.yml up --build
```

En Coolify, apuntar al repositorio y usar `docker-compose.prod.yml`. Variables a
definir **en Coolify, nunca en el repositorio**:

| Variable | Obligatoria | Para qué |
| -------- | ----------- | -------- |
| `POSTGRES_PASSWORD` | Sí | Contraseña de la base de datos |
| `JWT_SECRET` | Sí | Firma de las sesiones (mínimo 24 caracteres, aleatoria) |
| `CORS_ORIGIN` | No | Por omisión `https://bookstudio.uk` |
| `PHIDIAS_TOKEN` | No | Sin él, la importación de grupos queda desactivada |
| `PHIDIAS_DEFAULT_PASSWORD` | No | Contraseña inicial del alumnado importado |

El volumen `storage` guarda las fotos, audios y vídeos subidos: **sin él se pierden
en cada redespliegue**. Las migraciones se aplican solas al arrancar y son
idempotentes.

## Web comercial

| Ruta | Qué es |
| ---- | ------ |
| `/` | Portada: funciones, casos de uso, precios y preguntas frecuentes |
| `/clientes` | Portal de clientes: demo/presupuesto y consumo de la instalación |

El contenido (ventajas, planes, FAQ) vive en
[`utils/site.ts`](apps/web/src/utils/site.ts): cambiar un precio o una respuesta no
obliga a tocar la maquetación.

### Planes

| Plan | Precio | Incluye |
| ---- | ------ | ------- |
| Individual | $150.000 COP/mes, pago anual | Un docente o profesional |
| Escuela | $5.000.000 COP/año | Hasta 5 profesores y 500 estudiantes |
| Institucional y empresas | $20.000.000 COP/año | Usuarios ilimitados |

### SEO

- Título, descripción, canonical, Open Graph y Twitter Card por vista
  ([`useSeo`](apps/web/src/composables/useSeo.ts)), con los valores de la portada
  escritos también a mano en `index.html` — los rastreadores sociales no ejecutan JS.
- Datos estructurados JSON-LD: `SoftwareApplication` y `FAQPage`.
- HTML semántico, respuestas del FAQ siempre en el DOM (`[hidden]`, no `v-if`).
- `robots.txt` y `sitemap.xml` en `apps/web/public/`. **El contenido de los libros
  no se indexa**: `/books/`, `/leer/`, `/libraries/` y `/dashboard` van en `Disallow`.

Al ser una SPA, el HTML inicial no trae el texto de la portada. Google lo indexa
igual porque ejecuta JavaScript; si necesitas indexación máxima, el paso siguiente
sería prerenderizar la portada en el build.

Las solicitudes del formulario se guardan en `contact_requests` y las lee un admin en
`GET /api/contact`. El envío es público, con un tope de 20 por IP y hora — generoso a
propósito, porque en un colegio todo el personal sale por la misma IP pública.

## Uso en la red local

Para probar desde tablets, móviles u otros equipos de la misma red:

```powershell
npm run red            # muestra la dirección de acceso (http://192.168.x.x:5173)
npm run red:cert       # HTTPS autofirmado: necesario para cámara y micrófono
npm run red:firewall   # abre los puertos 4000 y 5173 (PowerShell como administrador)
```

> **La grabación de voz, foto y vídeo exige HTTPS fuera de este equipo.** Los navegadores
> solo permiten `getUserMedia` en contextos seguros, y `http://192.168.x.x` no lo es.
> Ejecuta `npm run red:cert` una vez: Vite detecta el certificado y arranca en HTTPS.
> Al ser autofirmado, cada dispositivo debe aceptarlo la primera vez.

## Contenido del lienzo

| Recurso        | Cuántos | Origen                                          |
| -------------- | ------- | ----------------------------------------------- |
| Formas         | 26      | Geometría propia (`utils/shapes.ts`)             |
| Iconos         | 2 048   | [Lucide](https://lucide.dev), licencia ISC       |
| Emojis         | ~250    | Unicode nativo, agrupados y buscables en español |
| GIF animados   | —       | Openverse, filtrando por extensión (licencias CC)|
| Tipos de hoja  | 20      | Degradados CSS propios (`utils/papers.ts`)       |
| Tipografías    | 17      | Google Fonts autoalojadas con `@fontsource`      |
| Plantillas     | 24      | Definiciones de página propias                    |
| Gráficas       | 6 tipos | SVG propio, datos editables                       |
| Fórmulas       | —       | KaTeX (MIT) autoalojado, LaTeX                    |
| Sonidos        | —       | Openverse audio, licencias CC                     |

El catálogo de iconos se regenera con `node scripts/generar-iconos.mjs`. Cada icono se
reduce a atributos `d`, nunca a marcado libre: las propiedades vienen de la base de
datos y `v-html` sería un vector de inyección.

### Autoforma (reconocimiento de trazo)

Al dibujar a mano alzada con el lápiz, el editor propone convertir el garabato en una
forma limpia o en un icono. Usa el algoritmo **$1 Unistroke** (Wobbrock et al., 2007,
dominio público) contra plantillas propias, con dos ajustes: se elimina la invariancia
a la rotación (si no, un cuadrado y un rombo son el mismo dibujo girado) y se añade la
proporción de área de la caja envolvente para separar rectángulo de elipse.

Todo ocurre **en el navegador**. AutoDraw de Google no tiene API pública, y usar su
endpoint interno enviaría cada dibujo del alumnado a un servicio externo. Se desactiva
con la casilla «Autoforma» del panel del lápiz.

## Ver y leer los libros

| Vista              | Dónde                                    | Qué hace                                      |
| ------------------ | ---------------------------------------- | --------------------------------------------- |
| Panel de libros    | `/dashboard`                             | Portadas reales de cada libro y de cada clase  |
| Modo lectura       | `/books/:id/read`                        | Pasa página a página, teclado y pantalla completa |
| Rejilla de páginas | Editor → **Páginas** (o lector → Páginas) | Ver todas las páginas, reordenar y eliminar    |
| Tira de páginas    | Pie del editor                           | Miniaturas; **arrastra para reordenar**        |

Las miniaturas se generan en el cliente reutilizando el renderizador del lienzo, sin
servicios de captura ni dependencias añadidas.

## Plantillas

Botón **Plantillas** en el editor: 13 páginas prefabricadas en 4 grupos —
organizadores gráficos (lluvia de ideas, KWL, Venn, mapa del cuento, causa-efecto,
ficha de animal), cómics de 2/4/6 viñetas, tablas y calendario, y una portada.

No existe una librería open source equivalente a la de Book Creator, así que se
generan en [`utils/templates.ts`](apps/web/src/utils/templates.ts) a partir de los
elementos del propio editor. Al ser código del repositorio son 100% abiertas,
funcionan sin internet y se pueden traducir o ampliar sin depender de nadie.

La página y todos sus elementos se crean en **una sola transacción**, así que una
plantilla nunca queda a medio montar si algo falla.

## Contenido incrustado

Botón **Incrustar**. Admite YouTube, Vimeo, PeerTube, Documentos/Presentaciones/Hojas/
Formularios de Google, Microsoft Office, Internet Archive (libros libres) y Wikipedia.

> **Aviso:** salvo PeerTube, Internet Archive y Wikipedia son servicios privativos y
> se apartan del criterio «100% open source» del plan. Se incluyen por petición
> expresa; el contenido se carga desde sus servidores, no desde el colegio.

Cómo se contiene el riesgo:

- **Lista blanca cerrada de dominios.** Nunca se incrusta una URL arbitraria; un
  iframe libre permitiría meter cualquier página dentro del libro de un menor.
- **La URL de incrustación la reconstruye el servidor** a partir del identificador,
  así que el cliente no puede imponer la suya (probado) y se descartan los parámetros
  del enlace original.
- Se comprueba el dominio exacto o subdominio: `youtube.com.malicioso.net` se rechaza.
- Solo `https`. `javascript:`, `data:` y `file:` se rechazan.
- YouTube se sirve por `youtube-nocookie.com`, y el iframe va con `sandbox` y
  `referrerpolicy="no-referrer"`.
- Con «Pedir confirmación» activo, no se contacta con el servicio hasta que alguien
  pulsa: por omisión no hay peticiones a terceros al abrir el libro.

## Gestión de usuarios

Cabecera → **Usuarios** (solo rol `admin`). Listar con búsqueda y filtro por rol,
crear cuentas, cambiar rol, restablecer contraseñas y desactivar sin borrar (para no
perder los libros). Un admin no puede quitarse su propio rol ni desactivarse.

### Importar grupos desde Phidias

En el mismo panel, si el servidor tiene `PHIDIAS_TOKEN`. Lista las 52 secciones del
colegio y crea de un clic la biblioteca con sus alumnos, usando el correo
institucional. Es **idempotente**: reimportar no duplica cuentas ni matrículas.

> **El token vive solo en `apps/api/.env`.** La llamada se hace desde el backend a
> propósito: es un JWT de larga duración con acceso a datos personales de menores, y
> desde el navegador estaría en el código de cada alumno además de exigir proxies CORS
> de terceros.

Los alumnos importados entran con su correo y la contraseña de `PHIDIAS_DEFAULT_PASSWORD`;
deben cambiarla. Quien no tenga correo institucional se omite y se informa de cuántos.

## Edición colaborativa

En **Compartir** → «Edición compartida con la clase». Cualquier miembro de la
biblioteca puede añadir contenido al mismo libro. Los cambios se ven al recargar:
**todavía no hay sincronización en vivo** (eso es WebSockets, Etapa 6).

## Exportar

Botón **Exportar** en el editor:

- **Página web (.html)** — un único archivo con su CSS y su JS dentro. Se abre con
  doble clic, sin servidor y sin BookStudio, con navegación de páginas propia.
- **PDF** — abre la vista de impresión (una página del libro por hoja) y se usa
  «Guardar como PDF» del navegador. Sin dependencias ni servicios externos.

## Preguntas interactivas

Botón **❓ Pregunta** en el editor: 6 bloques listos para usar (respuesta única,
verdadero/falso, varias respuestas, ordenar, elegir imagen, línea del tiempo). Los
textos, las imágenes y la respuesta correcta se cambian en el panel derecho.

| Tipo | Cómo se corrige |
| ---- | --------------- |
| Respuesta única | Exactamente una opción correcta |
| Varias respuestas | El conjunto marcado debe coincidir exactamente |
| Ordenar | La secuencia debe coincidir; el orden guardado **es** la solución |

Enunciado y opciones admiten texto e imagen. Al acertar en modo lectura salta una
animación de confeti, que se desactiva sola con `prefers-reduced-motion`.

**Las respuestas correctas no salen del servidor.** A quien no puede editar el libro
se le envían las opciones sin la marca `correct`, y en las de ordenar además barajadas
—si no, el propio orden sería la solución—. La corrección ocurre en
`POST /books/:id/questions/:elementId/answer` (y su gemela pública para enlaces
compartidos), así que abrir las herramientas del navegador no revela nada.

## Enlaces en los elementos

Textos, imágenes, formas e iconos admiten un enlace (campo **Enlace** del inspector).
Se abre al pulsarlos en el modo lectura, en una pestaña nueva con
`rel="noopener noreferrer"`. Solo `http(s)` y rutas internas: cualquier otro esquema
se rechaza en el servidor y se revalida en el cliente antes de pintarlo.

## Compartir un libro

Botón **Compartir** en el editor. Tres niveles:

| Visibilidad | Quién puede abrir el enlace |
| ----------- | --------------------------- |
| Privado     | Solo quien tenga permiso dentro de la aplicación |
| Mi clase    | Miembros de la biblioteca del libro, tras iniciar sesión |
| Público     | Cualquiera con el enlace, sin cuenta |

El enlace es `/leer/<token>` y siempre abre en **solo lectura**. El token se genera la
primera vez y se conserva al cambiar de visibilidad, para que un enlace ya repartido
siga sirviendo; «Generar un enlace nuevo» lo rota e invalida el anterior. Un token
revocado y uno inexistente devuelven el mismo 404, para no filtrar que el libro existe.

## Tipos de libro

| Tipo      | Dónde se crea                    | Quién lo ve                       |
| --------- | -------------------------------- | --------------------------------- |
| Personal  | Panel principal → **Mis libros** | Solo su autor                     |
| De clase  | Biblioteca → **Nuevo libro**     | La biblioteca (alumnos y docentes) |

Los libros personales no requieren pertenecer a ninguna clase: funcionan igual para
docentes, administradores y alumnos, y no aparecen en la vista de clase del docente.

### Credenciales de demo

| Rol     | Acceso                                        |
| ------- | --------------------------------------------- |
| Docente | `profe@bookstudio.local` / `BookStudio123`    |
| Alumno  | Código QR generado desde la vista de biblioteca |

## Estructura

```
apps/
  api/   Backend Express (auth, bibliotecas, class view)
  web/   Frontend Vue 3
infra/   Configuración de Nginx para Docker
scripts/ Ensayos funcionales (PowerShell)
```

## Ensayos

```powershell
# Con la API corriendo en el puerto 4000
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-etapa1.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-etapa2.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-etapa3.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-etapa4.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-libros-personales.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-formas-iconos.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-compartir.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-plantillas-embeds.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-preguntas.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-etapa5.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-web-comercial.ps1

# Comprobacion del limitador de peticiones (sin servidor)
npx tsx apps/api/src/lib/rate-limit.check.mts
```

> Los ensayos de la Etapa 4 consultan Openverse y Nominatim, asi que necesitan salida a internet.

## Progreso

- [x] **Etapa 1** — Infraestructura, autenticación JWT + QR, bibliotecas, class view
- [x] **Etapa 2** — Motor de maquetación fija (canvas editor)
- [x] **Etapa 3** — Editor de texto inclusivo y herramientas de lápiz
- [x] **Etapa 4** — Multimedia open source (Openverse, Leaflet, MediaRecorder)
- [x] **Etapa 5** — Usuarios, Phidias, colaboración, gráficas, fórmulas y exportación
- [ ] **Etapa 5.5** — Accesibilidad universal (TTS/STT Web API)
- [x] **Etapa 4.5** — Iconos, formas y fondos, plantillas, embeds, modo lectura y compartir
- [ ] **Etapa 6** — Colaboración en tiempo real y LTI 1.3
