import { onBeforeUnmount, ref } from 'vue';

/**
 * Dictado por voz sobre un campo de texto.
 *
 * Usa el reconocimiento de voz del propio navegador (Web Speech API). Eso importa por
 * dos razones: no hay que pagar ningun servicio, y la voz de quien dicta no sale del
 * equipo hacia un tercero. La contrapartida es que **no todos los navegadores lo
 * traen**: hoy funciona en Chrome, Edge y Safari, y no en Firefox.
 *
 * Por eso `soportado` se expone: la interfaz debe esconder el boton donde no sirve, en
 * vez de ofrecer algo que no va a funcionar.
 */

/** El tipo no esta en las librerias de TypeScript por defecto. */
interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoVoz extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoVoz };
}

interface Reconocedor extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

type ConstructorVoz = new () => Reconocedor;

function constructorDisponible(): ConstructorVoz | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstructorVoz;
    webkitSpeechRecognition?: ConstructorVoz;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAJES: Record<string, string> = {
  'not-allowed': 'No diste permiso al micrófono. Actívalo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El navegador ha bloqueado el reconocimiento de voz.',
  'no-speech': 'No se escuchó nada. Acércate al micrófono y vuelve a intentarlo.',
  'audio-capture': 'No se encontró ningún micrófono.',
  network: 'El reconocimiento de voz necesita conexión y no pudo contactar con el servicio.',
};

export function useDictado(alTexto: (texto: string) => void) {
  const soportado = Boolean(constructorDisponible());
  const escuchando = ref(false);
  /** Lo que se está oyendo pero aún no es definitivo; se muestra en gris. */
  const provisional = ref('');
  const error = ref<string | null>(null);

  let reconocedor: Reconocedor | null = null;
  /** Distingue parar a proposito de que el navegador corte solo. */
  let detenidoPorNosotros = false;

  function parar(): void {
    detenidoPorNosotros = true;
    reconocedor?.stop();
    escuchando.value = false;
    provisional.value = '';
  }

  function iniciar(): void {
    const Constructor = constructorDisponible();
    if (!Constructor) return;

    error.value = null;
    detenidoPorNosotros = false;

    reconocedor = new Constructor();
    reconocedor.lang = 'es-CO';
    // Continuo: dictar un comentario de varias frases sin tener que reactivarlo.
    reconocedor.continuous = true;
    reconocedor.interimResults = true;

    reconocedor.onresult = (evento) => {
      let definitivo = '';
      let enCurso = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const trozo = evento.results[i][0].transcript;
        if (evento.results[i].isFinal) definitivo += trozo;
        else enCurso += trozo;
      }
      provisional.value = enCurso;
      if (definitivo.trim()) alTexto(definitivo.trim());
    };

    reconocedor.onerror = (evento) => {
      // "aborted" es lo que llega al parar a proposito: no es un fallo.
      if (evento.error === 'aborted') return;
      error.value = MENSAJES[evento.error] ?? `No se pudo dictar (${evento.error}).`;
      escuchando.value = false;
    };

    reconocedor.onend = () => {
      // El navegador corta la escucha tras unos segundos de silencio. Si no fuimos
      // nosotros, se reanuda: quien dicta espera seguir hablando cuando quiera.
      if (!detenidoPorNosotros && escuchando.value) {
        try {
          reconocedor?.start();
          return;
        } catch {
          // Si no se puede reanudar, se refleja parado en vez de mentir.
        }
      }
      escuchando.value = false;
      provisional.value = '';
    };

    try {
      reconocedor.start();
      escuchando.value = true;
    } catch {
      error.value = 'No se pudo iniciar el dictado.';
    }
  }

  const alternar = (): void => (escuchando.value ? parar() : iniciar());

  onBeforeUnmount(() => {
    detenidoPorNosotros = true;
    reconocedor?.abort();
  });

  return { soportado, escuchando, provisional, error, iniciar, parar, alternar };
}
