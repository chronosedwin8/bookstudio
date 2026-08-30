Plan de Trabajo: OpenBookCreator (Fork de Book Creator)

Este plan de desarrollo está diseñado como una directiva de ingeniería estructurada para ser procesada por un agente de desarrollo autónomo (como Claude Code). Define la arquitectura, el diseño de la base de datos PostgreSQL, los contratos de API y las etapas secuenciales para replicar y ampliar el ecosistema de Book Creator utilizando componentes estrictamente de código abierto.
🛠️ Stack Tecnológico de Referencia

    Frontend: Vue 3 (Composition API, <script setup>), Pinia (Gestor de Estado), Tailwind CSS (Maquetación y UI).
    Backend: Node.js + Express.js o Fastify (JavaScript).
    Base de Datos: PostgreSQL 15+.
    Comunicación en Tiempo Real: Socket.io (WebSockets) para colaboración sincrónica.
    Lienzo y Gráficos: HTML5 Canvas API + SVG para la manipulación vectorial del lápiz.

🗄️ Modelo de Datos (Esquema PostgreSQL)

Para soportar la estructura de bibliotecas, libros de maquetación fija, páginas y elementos dinámicos, implementa el siguiente esquema de base de datos relacional:

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de Usuarios (Soporta Autenticación Local y SSO)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('teacher', 'student', 'admin')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Bibliotecas (Organizadas por Clase o Asignatura)
CREATE TABLE libraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code_invite VARCHAR(10) UNIQUE NOT NULL, -- Código de acceso (ej. VBWQ2)
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    student_book_limit INT DEFAULT 40, -- Límite de creación por estudiante
    student_editable BOOLEAN DEFAULT TRUE,
    student_publishable BOOLEAN DEFAULT FALSE,
    comments_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Asociación de Profesores Invitados (Co-docentes)
CREATE TABLE library_teachers (
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (library_id, teacher_id)
);

-- Tabla de Asociación Estudiante-Biblioteca
CREATE TABLE library_students (
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (library_id, student_id)
);

-- Tabla de Portafolios (Persistencia interanual por Alumno)
CREATE TABLE student_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Libros (Estructura de Maquetación Fija)
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) DEFAULT 'Libro sin título',
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES student_portfolios(id) ON DELETE SET NULL,
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    layout_format VARCHAR(20) DEFAULT 'square' CHECK (layout_format IN ('portrait', 'square', 'landscape')), -- Fijo
    is_template BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT FALSE,
    publishing_settings JSONB, -- Configuración de visualización y remixing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Páginas (Orden secuencial del libro)
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    page_number INT NOT NULL, -- 1-indexed (1 = Cover)
    background_color VARCHAR(30) DEFAULT '#FFFFFF',
    background_pattern TEXT, -- ID o URL del patrón de cómic/textura
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (book_id, page_number)
);

-- Tabla de Elementos Multimedia (Lienzo interactivo)
CREATE TABLE canvas_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video')),
    z_index INT NOT NULL,
    transform_matrix JSONB NOT NULL, -- Almacena posición (x, y), escala (scaleX, scaleY) y rotación (angle)
    properties JSONB NOT NULL, -- Propiedades específicas según el tipo de elemento
    is_locked BOOLEAN DEFAULT FALSE,
    opacity NUMERIC(3,2) DEFAULT 1.0 CHECK (opacity >= 0.0 AND opacity <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Comentarios y Retroalimentación
CREATE TABLE page_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'audio', 'video', 'sticker')),
    content TEXT, -- Texto o URL del archivo multimedia de feedback
    x_position INT DEFAULT 0, -- Ubicación del marcador en la página
    y_position INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

🎨 Especificaciones de Atributos del Canvas JSONB

Para guiar a la IA en el almacenamiento de elementos dinámicos en la columna canvas_elements.properties, utiliza estos esquemas JSON de referencia:
1. Elemento de Texto (type: 'text')

{
  "text": "Hola Mundo",
  "fontFamily": "OpenDyslexic",
  "fontSize": 24,
  "color": "#333333",
  "backgroundColor": "#F5F5DC",
  "textAlign": "left",
  "columns": 1,
  "bold": false,
  "italic": false,
  "underline": false,
  "strikethrough": false,
  "superscript": false,
  "subscript": false,
  "indent": 0
}

2. Elemento de Dibujo Vectorial (type: 'drawing')

{
  "svgPath": "M 10,10 L 50,50 ...",
  "brushStyle": "crayon",
  "strokeWidth": 5,
  "strokeColor": "magic-glitter-rainbow",
  "fillColor": "transparent"
}

3. Elemento de Audio (type: 'audio')

{
  "fileUrl": "/storage/audio/123.mp3",
  "durationSeconds": 45.2,
  "hotspotColor": "#FF5733",
  "hasAutoTranscript": true,
  "transcriptText": "Transcripción automática del mensaje de voz."
}

🚀 Etapas del Plan de Trabajo (Paso a Paso)
ETAPA 1: Infraestructura Base y Control del Aula

Objetivo: Crear el entorno Docker, levantar PostgreSQL, configurar el backend Node.js, e implementar las bibliotecas y el control de accesos para profesores y alumnos.
Tareas Técnicas para la IA:

    Dockerización: Configurar un entorno de desarrollo multi-contenedor local con Docker Compose que levante Node.js, PostgreSQL y Nginx como proxy inverso.
    Setup de Base de Datos: Ejecutar la migración SQL descrita en la sección anterior. Crear las relaciones, índices de búsqueda rápida y restricciones para optimizar las consultas del calificador y de la biblioteca.
    Módulo de Autenticación:
        Implementar JSON Web Tokens (JWT) para sesiones del navegador.
        Implementar inicio de sesión por Código QR único para alumnos de primaria (generando un hash JWT que se mapea al ID del alumno sin requerir credenciales por correo electrónico).
    Dashboard Docente:
        Implementar el endpoint POST /api/libraries que genere un código de invitación aleatorio de 5 caracteres en mayúsculas (ej. VBWQ2).
        Implementar el endpoint de Class View (Vista de Clase): Un endpoint que consolide de forma eficiente en una sola consulta paginada el estado de avance de las páginas de todos los libros de la clase (para renderizar la cuadrícula visual de control de aula).
        Implementar la promoción de roles para asociar a otros profesores como co-profesores en bibliotecas de aula específicas.

ETAPA 2: Motor de Maquetación Fija (Canvas Editor)

Objetivo: Desarrollar el core del lienzo interactivo en Vue 3 que soporte formatos geométricos de página inmutables y la manipulación de capas.
Tareas Técnicas para la IA:

    Estructura del Lienzo (Lienzo Fijo):
        Crear el componente BookEditor.vue que configure una relación de aspecto rígida de página según el formato del libro: portrait (vertical 3:4), square (1:1) o landscape (apaisado 4:3).
        Asegurar que la relación de aspecto se mantenga responsiva usando escalado CSS (escalar contenedor mediante transform: scale()) dentro del viewport.
    Gestor de Capas y Colisiones:
        Diseñar las directivas Vue para interactuar con los elementos gráficos agregando bordes interactivos, controles en esquinas para escalado proporcional (no distorsivo) y rotación fluida mediante cálculos de vectores de mouse.
        Implementar la opción de reordenamiento de capas en la interfaz (Traer al frente, Enviar al fondo) mapeada directamente a la columna z_index de PostgreSQL.
        Implementar el bloqueo físico de elementos (is_locked: true) para que los profesores puedan diseñar plantillas inamovibles.
        Añadir un slider de opacidad en el menú del Inspector que manipule el canal alfa de visualización de cada elemento.

ETAPA 3: Editor de Texto Inclusivo y Herramientas del Lápiz (Pen Tool)

Objetivo: Integrar un editor de texto enriquecido diseñado para la diversidad lectora y un sistema de dibujo basado en SVG que use algoritmos de código abierto.
Tareas Técnicas para la IA:

    Procesador de Texto Inclusivo:
        Incorporar fuentes web de código abierto y alta legibilidad: OpenDyslexic, Cabin, Lato y Noto Sans.
        Configurar el editor de texto para que por defecto aplique un tamaño mínimo de 24px, alineación izquierda estricta (no justificado para evitar la fatiga cognitiva por espaciado desestructurado) y permita definir colores de fondo suaves para mitigar el contraste excesivo (tonos hueso y ópalo).
        Desarrollar la persistencia local de la última tipografía elegida por el usuario: almacenar el ID de la fuente seleccionada en el estado local de Pinia y el almacenamiento local (LocalStorage) para autocompletar el siguiente elemento de texto.
    Pluma Vectorial (Pen Tool):
        Desarrollar un sistema de dibujo que capture las coordenadas del ratón o lápiz óptico y las guarde como trazos vectoriales SVG de alta definición (eliminando pérdida de calidad al redimensionar).
        Crear 4 estilos de pincel por software:
            Pen: Trazo clásico con bordes nítidos.
            Paintbrush: Trazo analógico simulando cerdas con ligera dispersión.
            Crayon: Trazo poroso y texturizado.
            Highlighter: Trazo semitransparente que se superpone a las capas de texto.
        Implementar el Bote de Pintura (Fill Tool) utilizando un algoritmo de relleno de inundación (flood-fill) adaptado a coordenadas poligonales SVG o elementos Canvas locales.
        Implementar un lienzo de papel cebolla semitransparente que sirva de guía para calcar trazos.

ETAPA 4: Integración Estricta de Multimedia de Código Abierto (Sin Privativos)

Objetivo: Desarrollar los módulos para insertar y buscar imágenes, videos, mapas y modelos 3D sin depender de servicios privativos.
Tareas Técnicas para la IA:

    Google Safe Search / Pixabay Replacement -> Openverse API:
        Registrar la integración del backend con la API pública de Openverse (el motor de búsqueda de WordPress con acceso a más de 700 millones de archivos con licencias Creative Commons y de dominio público).
        Crear un proxy en el backend GET /api/media/search que consulte el catálogo de Openverse aplicando un filtro estricto de accesibilidad y derechos de uso comercial permitidos con modificación.
        Desarrollar la atribución automatizada en pantalla: insertar un cuadro de texto editable justo debajo de la imagen importada con los metadatos de autoría y el enlace de origen de la licencia CC.
    Google Maps Replacement -> OpenStreetMap + Leaflet:
        Crear el componente MapWidget.vue que utilice Leaflet.js y mapas de OpenStreetMap (eliminando dependencias de Google Maps API y APIs propietarias).
        Permitir al estudiante escribir el nombre de un lugar en un cuadro de búsqueda (usando la API de geocodificación gratuita Nominatim de OpenStreetMap), posicionar un marcador geográfico, realizar capturas estáticas e interactuar con el widget sobre el lienzo utilizando el lápiz vectorial.
    Soporte de Grabación HTML5 Nativo:
        Implementar la captura directa con la API MediaRecorder del navegador para capturar fotos con webcam, videos y clips de voz.
        Para grabaciones de audio, permitir al usuario personalizar el color del hotspot de reproducción y desplegar controles de elocución simples.

ETAPA 5: Accesibilidad Universal (TTS & STT por API Web)

Objetivo: Desarrollar sistemas inclusivos de conversión de texto a voz y voz a texto utilizando estándares de la API Web del Navegador, prescindiendo de servicios de pago en la nube.
Tareas Técnicas para la IA:

    Text-to-Speech (Sintetizador en Edición):
        Utilizar el motor nativo del navegador window.speechSynthesis para habilitar el modo Lectura de Editores.
        Al hacer clic en el botón de reproducción de un elemento de texto, de una forma geométrica con inscripciones o de un PDF escaneado (procesado en cliente), el sintetizador debe leer en voz alta la cadena de caracteres.
        Durante la lectura, implementar el resaltado sincronizado de palabras: procesar el evento onboundary de la API de síntesis para calcular la posición de la palabra hablada y aplicar estilos CSS dinámicos de resaltado en el DOM en tiempo real.
    Dictado Directo (Speech-to-Text):
        Integrar la API nativa de reconocimiento de voz window.webkitSpeechRecognition o window.SpeechRecognition.
        Permitir al alumno dictar texto de forma sincrónica especificando su idioma nativo de una lista de compatibilidad de más de 120 variantes lingüísticas internacionales.
    Read Mode (Modo Lectura):
        Crear la interfaz de visualización limpia que oscurezca la pantalla, despliegue transiciones de página en dos columnas simulando el paso de hojas real y proporcione controles integrados de volumen, cambio de voces locales de síntesis y velocidad ajustable.

ETAPA 6: Colaboración Sincrónica y LMS

Objetivo: Implementar la edición simultánea basada en WebSockets y la interoperabilidad mediante LTI 1.3 con plataformas Canvas y Moodle.
Tareas Técnicas para la IA:

    Colaboración en Tiempo Real:
        Implementar un servicio Node.js + WebSockets con Socket.io para coordinar y propagar las transformaciones espaciales realizadas sobre el lienzo.
        Utilizar bibliotecas de resolución de conflictos tipo CRDT (como Yjs o de desarrollo personalizado basado en estados atómicos JSON) para evitar solapamientos destructivos en el lienzo cuando varios alumnos editan páginas simultáneamente.
        Mostrar indicadores visuales flotantes con los nombres o avatares de los estudiantes activos en la página.
    Integración LTI 1.3 de Código Abierto (Interoperability):
        Desarrollar la arquitectura de autenticación y entrega basada en el estándar IMS LTI 1.3 para integrarse de manera fluida en sistemas como Canvas y Moodle.
        Configurar el backend para recibir cargas LTI (parámetros de consumidor y clave pública/privada JWKS).
        Implementar la visualización en calificador mediante el método de devolución de notas (Gradebook Services), permitiendo al profesor evaluar el libro interactivo del alumno a pantalla completa directamente dentro del SpeedGrader de Canvas sin salir de su plataforma institucional.

🎯 Directivas Generales para la IA (Claude Code)

Cuando inicies la IA para este proyecto, proporciónale la siguiente directiva inicial de estilo y robustez:

    "Por favor, actúa como un programador de software sénior. Implementa el código de Vue 3 utilizando estrictamente TypeScript, Composition API y la sintaxis <script setup>. Asegúrate de que todas las dependencias de librerías utilizadas para el manejo de imágenes, mapas y renderizado gráfico de PDF sean 100% de código abierto (Open Source, como Leaflet, OpenStreetMap, Openverse, PDF.js de Mozilla). Escribe código defensivo: valida los esquemas JSONB entrantes en el backend antes de insertarlos en PostgreSQL, controla la saturación de conexiones en PostgreSQL utilizando pools de conexión optimizados, e implementa manejadores de errores descriptivos tanto en la lógica del backend como en las llamadas Axios de Vue."
