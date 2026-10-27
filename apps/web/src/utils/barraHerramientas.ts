/**
 * La barra de herramientas del editor: que herramientas hay y en que categoria va
 * cada una.
 *
 * El catalogo vive aqui porque cada herramienta es un boton del editor con su
 * propia accion; lo que la administracion configura (y guarda el servidor) es
 * solo la ubicacion: el orden de las categorias, su nombre y que herramientas
 * lleva cada una. Asi una configuracion guardada nunca puede inventar un boton,
 * y una herramienta nueva aparece sola en su categoria de siempre aunque la
 * configuracion sea anterior a ella.
 */

export const HERRAMIENTAS = {
  pincel: { label: 'Opciones de dibujo', icono: '✏️', categoria: 'dibujo' },
  texto: { label: 'Texto', icono: 'T', categoria: 'texto' },
  tabla: { label: 'Tabla', icono: '▦', categoria: 'texto' },
  imagen: { label: 'Imagen libre', icono: '🖼️', categoria: 'imagenes' },
  'imagen-equipo': { label: 'Imagen desde mi equipo', icono: '📁', categoria: 'imagenes' },
  gif: { label: 'GIF animado', icono: '🎞️', categoria: 'imagenes' },
  'imagen-ia': { label: 'Crear imagen con IA', icono: '✨', categoria: 'imagenes' },
  ilustracion: { label: 'Ilustración educativa', icono: '🎨', categoria: 'imagenes' },
  marcos: { label: 'Marcos', icono: '🖼️', categoria: 'imagenes' },
  'grabar-pantalla': { label: 'Grabar pantalla', icono: '🖥️', categoria: 'grabar' },
  recorte: { label: 'Recorte de pantalla', icono: '✂️', categoria: 'grabar' },
  video: { label: 'Video', icono: '🎬', categoria: 'grabar' },
  foto: { label: 'Foto', icono: '📷', categoria: 'grabar' },
  voz: { label: 'Voz', icono: '🎤', categoria: 'grabar' },
  sonidos: { label: 'Biblioteca de sonidos', icono: '🔊', categoria: 'grabar' },
  'audio-equipo': { label: 'Audio desde mi equipo', icono: '🎵', categoria: 'grabar' },
  formas: { label: 'Formas rápidas', icono: '⬛', categoria: 'formas' },
  'mas-formas': { label: 'Más formas', icono: '⬡', categoria: 'formas' },
  iconos: { label: 'Iconos', icono: '✦', categoria: 'formas' },
  emojis: { label: 'Emojis', icono: '😀', categoria: 'formas' },
  notas: { label: 'Notas adhesivas', icono: '🟨', categoria: 'formas' },
  'nota-cinta': { label: 'Nota con cinta', icono: '📌', categoria: 'formas' },
  formula: { label: 'Fórmula', icono: '∑', categoria: 'matematicas' },
  grafica: { label: 'Gráfica', icono: '📊', categoria: 'matematicas' },
  'grafica-funciones': { label: 'Gráfica de funciones', icono: '📈', categoria: 'matematicas' },
  pregunta: { label: 'Pregunta', icono: '❓', categoria: 'interactivos' },
  boton: { label: 'Botón', icono: '⬢', categoria: 'interactivos' },
  mapa: { label: 'Mapa', icono: '🗺️', categoria: 'interactivos' },
  incrustar: { label: 'Incrustar', icono: '⧉', categoria: 'interactivos' },
  'color-fondo': { label: 'Color de la página', icono: '🎨', categoria: 'pagina' },
  'tipo-hoja': { label: 'Tipo de hoja', icono: '📄', categoria: 'pagina' },
  'imagen-fondo': { label: 'Imagen de fondo', icono: '🌄', categoria: 'pagina' },
} as const satisfies Record<string, { label: string; icono: string; categoria: string }>;

export type HerramientaId = keyof typeof HERRAMIENTAS;

export const esHerramienta = (id: string): id is HerramientaId => Object.hasOwn(HERRAMIENTAS, id);

export interface CategoriaBarra {
  id: string;
  label: string;
  icon: string;
  tools: HerramientaId[];
}

export interface ConfigBarra {
  categories: CategoriaBarra[];
  /** Categoria abierta la primera vez que se entra al editor. */
  openByDefault: string | null;
}

const CATEGORIAS_POR_DEFECTO: Omit<CategoriaBarra, 'tools'>[] = [
  { id: 'dibujo', label: 'Dibujo', icon: '✏️' },
  { id: 'texto', label: 'Texto y tablas', icon: '🔤' },
  { id: 'imagenes', label: 'Imágenes', icon: '🖼️' },
  { id: 'grabar', label: 'Grabar y capturar', icon: '🎙️' },
  { id: 'formas', label: 'Formas y notas', icon: '⬡' },
  { id: 'matematicas', label: 'Matemáticas y gráficas', icon: '∑' },
  { id: 'interactivos', label: 'Interactivos', icon: '❓' },
  { id: 'pagina', label: 'Página', icon: '📄' },
];

/** La barra tal y como sale de fabrica. */
export function barraPorDefecto(): ConfigBarra {
  const ids = Object.keys(HERRAMIENTAS) as HerramientaId[];
  return {
    categories: CATEGORIAS_POR_DEFECTO.map((c) => ({
      ...c,
      tools: ids.filter((id) => HERRAMIENTAS[id].categoria === c.id),
    })),
    // Grabar la pantalla es de lo que mas se usa en clase: a la vista al entrar.
    openByDefault: 'grabar',
  };
}

/**
 * La configuracion guardada, hecha valida contra el catalogo de hoy:
 *   - se quitan las herramientas que ya no existen y las repetidas;
 *   - cada herramienta que falta vuelve a su categoria de fabrica (si la
 *     administracion la borro, a la ultima), detras de las que ya hay;
 *   - sin configuracion, o con una vacia, vale la de fabrica.
 */
export function normalizarBarra(guardada: Partial<ConfigBarra> | null | undefined): ConfigBarra {
  const fabrica = barraPorDefecto();
  const categorias = (guardada?.categories ?? []).filter((c) => c && typeof c.id === 'string');
  if (!categorias.length) return fabrica;

  const vistas = new Set<string>();
  const ids = new Set<string>();
  const resultado: CategoriaBarra[] = [];
  for (const c of categorias) {
    if (ids.has(c.id)) continue;
    ids.add(c.id);
    const tools: HerramientaId[] = [];
    for (const t of c.tools ?? []) {
      if (!esHerramienta(t) || vistas.has(t)) continue;
      vistas.add(t);
      tools.push(t);
    }
    resultado.push({ id: c.id, label: c.label?.trim() || 'Sin nombre', icon: c.icon ?? '', tools });
  }

  for (const id of Object.keys(HERRAMIENTAS) as HerramientaId[]) {
    if (vistas.has(id)) continue;
    const destino = resultado.find((c) => c.id === HERRAMIENTAS[id].categoria) ?? resultado[resultado.length - 1];
    destino.tools.push(id);
  }

  const abierta = guardada?.openByDefault ?? null;
  return {
    categories: resultado,
    openByDefault: abierta && resultado.some((c) => c.id === abierta) ? abierta : null,
  };
}

/** Id nuevo para una categoria creada a mano, que no choque con las que hay. */
export function idCategoriaNueva(existentes: string[]): string {
  let n = existentes.length + 1;
  while (existentes.includes(`categoria-${n}`)) n++;
  return `categoria-${n}`;
}

/** Categoria donde esta una herramienta, o null si no aparece. */
export function categoriaDe(config: ConfigBarra, herramienta: HerramientaId): string | null {
  return config.categories.find((c) => c.tools.includes(herramienta))?.id ?? null;
}
