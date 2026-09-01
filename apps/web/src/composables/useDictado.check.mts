/**
 * Comprobacion del dictado. Se ejecuta con:
 *   npx tsx apps/web/src/composables/useDictado.check.mts
 *
 * El reconocimiento de voz real no se puede probar sin microfono ni navegador, pero
 * si lo que rodea: que detecte el soporte, que arme el texto y que no reviente donde
 * el navegador no lo trae. Se simula la API con un doble.
 */

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = ''): void => {
  if (!ok) fallos += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

/** Doble del reconocedor del navegador. */
class ReconocedorFalso {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  iniciado = 0;
  parado = 0;

  start(): void {
    this.iniciado += 1;
  }
  stop(): void {
    this.parado += 1;
  }
  abort(): void {
    this.parado += 1;
  }

  /** Simula lo que emite el navegador al oir algo. */
  emitir(trozos: Array<{ texto: string; final: boolean }>): void {
    const results: Record<number, unknown> & { length: number } = { length: trozos.length };
    trozos.forEach((t, i) => {
      results[i] = { isFinal: t.final, 0: { transcript: t.texto } };
    });
    this.onresult?.({ resultIndex: 0, results });
  }
}

// --- Sin soporte (el caso de Firefox) ---
(globalThis as { window?: unknown }).window = {};
let mod = await import(`./useDictado.js?sin=${Date.now()}`);
let d = mod.useDictado(() => undefined);
check('sin API del navegador, se declara no soportado', d.soportado === false);
d.iniciar();
check('y llamar a iniciar no revienta', d.escuchando.value === false);

// --- Con soporte ---
let ultimo: ReconocedorFalso | null = null;
(globalThis as { window?: unknown }).window = {
  SpeechRecognition: class extends ReconocedorFalso {
    constructor() {
      super();
      ultimo = this as unknown as ReconocedorFalso;
    }
  },
};
mod = await import(`./useDictado.js?con=${Date.now()}`);

const recibido: string[] = [];
d = mod.useDictado((t: string) => recibido.push(t));
check('con API disponible, se declara soportado', d.soportado === true);

d.iniciar();
check('empieza a escuchar', d.escuchando.value === true);
check('en espanol de Colombia', ultimo!.lang === 'es-CO', ultimo!.lang);
check('en modo continuo', ultimo!.continuous === true);
check('con resultados provisionales', ultimo!.interimResults === true);

ultimo!.emitir([{ texto: 'Falta ampliar el final', final: true }]);
check('el texto definitivo llega al campo', recibido[0] === 'Falta ampliar el final', recibido[0]);

ultimo!.emitir([{ texto: 'y revisar la', final: false }]);
check('lo provisional se muestra aparte', d.provisional.value === 'y revisar la', d.provisional.value);
check('y no se anade al campo todavia', recibido.length === 1, String(recibido.length));

ultimo!.emitir([
  { texto: 'ya definitivo', final: true },
  { texto: 'en curso', final: false },
]);
check('mezcla definitivo y provisional bien', recibido[1] === 'ya definitivo', recibido[1]);

d.parar();
check('para cuando se le pide', d.escuchando.value === false);
check('y silencia lo provisional', d.provisional.value === '');

// --- Errores ---
d.iniciar();
ultimo!.onerror?.({ error: 'not-allowed' });
check('explica el permiso denegado', (d.error.value ?? '').includes('permiso'), d.error.value ?? '');
check('y deja de escuchar', d.escuchando.value === false);

d.iniciar();
ultimo!.onerror?.({ error: 'aborted' });
check('parar a proposito no se cuenta como error', d.error.value === null, String(d.error.value));

console.log(fallos ? `\n${fallos} fallos` : '\nDictado correcto');
process.exit(fallos ? 1 : 0);
