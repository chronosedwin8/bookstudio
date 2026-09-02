import { computed, ref } from 'vue';
import type { CanvasElement, ElementType, TransformMatrix } from '@/types/api';

/**
 * Historial de deshacer y rehacer del editor.
 *
 * Cada cambio guarda **como deshacerlo**, no una copia del libro entero. Un libro con
 * imagenes y audios incrustados pesa megas: fotografiarlo en cada tecla llenaria la
 * memoria del portatil de un alumno en minutos.
 *
 * La contrapartida es que hay que declarar el reverso de cada operacion, y por eso
 * solo se registran las que de verdad se hacen sin querer: mover, cambiar de tamano,
 * borrar, anadir y editar propiedades. Cambiar de pagina o renombrar el libro no
 * entran: son deliberadas y confunden mas de lo que ayudan.
 */

/** Lo que hay que hacer para deshacer un cambio, y para volver a hacerlo. */
export interface PasoHistorial {
  /** Texto para la persona: "mover 2 elementos", "borrar imagen". */
  descripcion: string;
  deshacer: () => Promise<void>;
  rehacer: () => Promise<void>;
}

/** Mas de esto empieza a pesar y nadie deshace tantos pasos seguidos. */
const LIMITE = 50;

export function crearHistorial() {
  const pasados = ref<PasoHistorial[]>([]);
  const futuros = ref<PasoHistorial[]>([]);
  /** Mientras se deshace no se registran los cambios que provoca el propio deshacer. */
  const aplicando = ref(false);

  const puedeDeshacer = computed(() => pasados.value.length > 0 && !aplicando.value);
  const puedeRehacer = computed(() => futuros.value.length > 0 && !aplicando.value);
  const siguienteDeshacer = computed(() => pasados.value.at(-1)?.descripcion ?? null);
  const siguienteRehacer = computed(() => futuros.value.at(-1)?.descripcion ?? null);

  function registrar(paso: PasoHistorial): void {
    if (aplicando.value) return;
    pasados.value = [...pasados.value.slice(-(LIMITE - 1)), paso];
    // Un cambio nuevo invalida lo que habia por delante: es una rama abandonada.
    futuros.value = [];
  }

  async function deshacer(): Promise<string | null> {
    const paso = pasados.value.at(-1);
    if (!paso || aplicando.value) return null;
    aplicando.value = true;
    try {
      await paso.deshacer();
      pasados.value = pasados.value.slice(0, -1);
      futuros.value = [...futuros.value, paso];
      return paso.descripcion;
    } finally {
      aplicando.value = false;
    }
  }

  async function rehacer(): Promise<string | null> {
    const paso = futuros.value.at(-1);
    if (!paso || aplicando.value) return null;
    aplicando.value = true;
    try {
      await paso.rehacer();
      futuros.value = futuros.value.slice(0, -1);
      pasados.value = [...pasados.value, paso];
      return paso.descripcion;
    } finally {
      aplicando.value = false;
    }
  }

  /** Al abrir otro libro el historial anterior deja de tener sentido. */
  function limpiar(): void {
    pasados.value = [];
    futuros.value = [];
  }

  return {
    puedeDeshacer,
    puedeRehacer,
    siguienteDeshacer,
    siguienteRehacer,
    aplicando,
    registrar,
    deshacer,
    rehacer,
    limpiar,
  };
}

/** Nombre legible de cada tipo, para describir lo que se deshace. */
export const NOMBRE_TIPO: Record<ElementType, string> = {
  text: 'texto',
  shape: 'forma',
  drawing: 'dibujo',
  image: 'imagen',
  audio: 'audio',
  video: 'vídeo',
  map: 'mapa',
  icon: 'icono',
  embed: 'contenido incrustado',
  question: 'pregunta',
  chart: 'gráfica',
  math: 'fórmula',
};

export const describirElemento = (el: { type: ElementType }): string =>
  NOMBRE_TIPO[el.type] ?? 'elemento';

export type { CanvasElement, TransformMatrix };
