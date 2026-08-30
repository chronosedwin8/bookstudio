import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * Ancho en px de un elemento, actualizado con ResizeObserver.
 * Las miniaturas necesitan una medida real porque transform: scale() trabaja en px.
 */
export function useElementWidth(target: Ref<HTMLElement | null>): Ref<number> {
  const width = ref(0);
  let observer: ResizeObserver | undefined;

  onMounted(() => {
    const measure = (): void => {
      if (target.value) width.value = target.value.clientWidth;
    };
    measure();
    observer = new ResizeObserver(measure);
    if (target.value) observer.observe(target.value);
  });

  onBeforeUnmount(() => observer?.disconnect());

  return width;
}
