import { ref } from 'vue';

/**
 * Cerrar un dialogo al pulsar fuera, sin cerrarlo por accidente.
 *
 * Con `@click.self` a secas el dialogo se cerraba solo al escribir la nota. El motivo
 * es del navegador, no de Vue: si entre el `mousedown` y el `mouseup` desaparece o se
 * reemplaza el elemento donde se pulso, el `click` no se dispara sobre el, sino sobre
 * el **ancestro comun** de ambos. Ese ancestro es la propia capa del dialogo, asi que
 * `.self` acertaba y lo cerraba.
 *
 * En el campo de la nota pasaba en cada pulsacion: al cambiar el valor aparece o
 * desaparece la etiqueta de la escala ("Bien", "Deficiente"), Vue toca el DOM y el
 * navegador reapunta el clic.
 *
 * La solucion es no fiarse del `click`: solo se cierra si el gesto **empezo y termino**
 * sobre la capa, que es lo que de verdad significa "he pulsado fuera".
 */
export function useCierreExterior(alCerrar: () => void) {
  const empezoFuera = ref(false);

  return {
    /** `@mousedown` de la capa. */
    onMousedown(evento: MouseEvent): void {
      empezoFuera.value = evento.target === evento.currentTarget;
    },
    /** `@mouseup` de la capa. */
    onMouseup(evento: MouseEvent): void {
      if (empezoFuera.value && evento.target === evento.currentTarget) alCerrar();
      empezoFuera.value = false;
    },
  };
}
