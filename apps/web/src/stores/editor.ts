import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { booksApi } from '@/services/api';
import { crearHistorial, describirElemento } from './historial';
import { errorMessage } from '@/services/http';
import type {
  BookDetail,
  CanvasElement,
  ElementType,
  Page,
  ShareVisibility,
  TransformMatrix,
} from '@/types/api';

/** Relacion de aspecto ancho/alto por formato de maquetacion fija. */
export const ASPECT_RATIOS = {
  portrait: 3 / 4,
  square: 1,
  landscape: 4 / 3,
} as const;

export const useEditorStore = defineStore('editor', () => {
  const book = ref<BookDetail | null>(null);
  const currentPageIndex = ref(0);
  const selectedElementId = ref<string | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  const currentPage = computed<Page | null>(() => book.value?.pages[currentPageIndex.value] ?? null);
  const aspectRatio = computed(() => (book.value ? ASPECT_RATIOS[book.value.layoutFormat] : 1));
  const canEdit = computed(() => book.value?.permissions.canEdit ?? false);
  const isManager = computed(() => book.value?.permissions.isManager ?? false);

  const sortedElements = computed<CanvasElement[]>(() =>
    [...(currentPage.value?.elements ?? [])].sort((a, b) => a.zIndex - b.zIndex),
  );

  /**
   * Seleccion multiple. `selectedElementId` sigue siendo la seleccion principal
   * (la que edita el inspector) y es siempre el ultimo id de la lista.
   */
  const selectedIds = ref<string[]>([]);

  const selectedElements = computed<CanvasElement[]>(() =>
    sortedElements.value.filter((el) => selectedIds.value.includes(el.id)),
  );

  const selectedElement = computed<CanvasElement | null>(
    () => sortedElements.value.find((el) => el.id === selectedElementId.value) ?? null,
  );

  const historial = crearHistorial();

  function replaceElement(updated: CanvasElement): void {
    const page = book.value?.pages.find((p) => p.id === updated.pageId);
    if (!page) return;
    const index = page.elements.findIndex((el) => el.id === updated.id);
    if (index === -1) page.elements.push(updated);
    else page.elements[index] = updated;
  }

  async function load(bookId: string): Promise<void> {
    historial.limpiar();
    loading.value = true;
    error.value = null;
    try {
      book.value = await booksApi.get(bookId);
      currentPageIndex.value = 0;
      selectedElementId.value = null;
      selectedIds.value = [];
    } catch (err) {
      error.value = errorMessage(err);
    } finally {
      loading.value = false;
    }
  }

  function goToPage(index: number): void {
    if (!book.value) return;
    currentPageIndex.value = Math.max(0, Math.min(index, book.value.pages.length - 1));
    selectedElementId.value = null;
    selectedIds.value = [];
  }

  function select(elementId: string | null, additive = false): void {
    if (!elementId) {
      selectedIds.value = [];
      selectedElementId.value = null;
      return;
    }

    if (additive) {
      selectedIds.value = selectedIds.value.includes(elementId)
        ? selectedIds.value.filter((id) => id !== elementId)
        : [...selectedIds.value, elementId];
    } else if (!selectedIds.value.includes(elementId)) {
      // Pulsar un elemento que YA forma parte del grupo no deshace la seleccion:
      // es lo que permite arrastrar el conjunto entero. Solo se reduce a uno
      // cuando se pulsa algo que estaba fuera de la seleccion.
      selectedIds.value = [elementId];
    }

    selectedElementId.value = selectedIds.value.at(-1) ?? null;
  }

  function selectMany(ids: string[]): void {
    selectedIds.value = [...ids];
    selectedElementId.value = ids.at(-1) ?? null;
  }

  /** Desplaza toda la seleccion, en porcentaje de pagina. */
  async function moveSelection(dx: number, dy: number): Promise<void> {
    const targets = selectedElements.value.filter((el) => !el.isLocked);
    if (!targets.length) return;

    await Promise.all(
      targets.map((element) => {
        const t = element.transformMatrix;
        return patchElement(element.id, {
          transformMatrix: {
            ...t,
            x: Math.min(120, Math.max(-20, t.x + dx)),
            y: Math.min(120, Math.max(-20, t.y + dy)),
          },
        });
      }),
    );
  }

  /** Elimina todos los elementos seleccionados que no esten bloqueados. */
  async function removeSelection(): Promise<void> {
    const targets = selectedElements.value.filter((el) => !el.isLocked).map((el) => el.id);
    for (const id of targets) await removeElement(id);
    selectedIds.value = [];
    selectedElementId.value = null;
  }

  async function withSaving<T>(fn: () => Promise<T>): Promise<T | null> {
    saving.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (err) {
      error.value = errorMessage(err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** Devuelve el elemento creado para que quien lo inserte pueda seguir operando sobre el. */
  async function addElement(
    type: ElementType,
    transformMatrix: TransformMatrix,
    properties: Record<string, unknown>,
  ): Promise<CanvasElement | undefined> {
    if (!book.value || !currentPage.value) return undefined;
    const created = await withSaving(() =>
      booksApi.createElement(book.value!.id, currentPage.value!.id, { type, transformMatrix, properties }),
    );
    if (created) {
      currentPage.value.elements.push(created);
      selectedElementId.value = created.id;

      const pageId = currentPage.value.id;
      let vigente = created;
      historial.registrar({
        descripcion: `añadir ${describirElemento(created)}`,
        deshacer: async () => {
          await booksApi.deleteElement(book.value!.id, pageId, vigente.id);
          const pagina = book.value!.pages.find((p) => p.id === pageId);
          if (pagina) pagina.elements = pagina.elements.filter((el) => el.id !== vigente.id);
        },
        rehacer: async () => {
          // Se recrea: el id cambia, asi que se guarda el nuevo para poder volver a
          // deshacerlo. Sin esto el segundo deshacer buscaria un id que ya no existe.
          const recreado = await booksApi.createElement(book.value!.id, pageId, {
            type, transformMatrix, properties,
          });
          vigente = recreado;
          book.value!.pages.find((p) => p.id === pageId)?.elements.push(recreado);
        },
      });
    }
    return created ?? undefined;
  }

  /** Aplica el cambio en local y luego persiste; ante error recarga para no dejar estado divergente. */
  async function patchElement(
    elementId: string,
    payload: {
      transformMatrix?: TransformMatrix;
      properties?: Record<string, unknown>;
      zIndex?: number;
      isLocked?: boolean;
      opacity?: number;
    },
  ): Promise<void> {
    if (!book.value || !currentPage.value) return;

    const page = currentPage.value;
    const index = page.elements.findIndex((el) => el.id === elementId);
    if (index === -1) return;
    const previous = page.elements[index];
    page.elements[index] = { ...previous, ...payload } as CanvasElement;

    const updated = await withSaving(() =>
      booksApi.updateElement(book.value!.id, page.id, elementId, payload),
    );

    if (updated) {
      replaceElement(updated);

      // Solo se guarda lo que de verdad cambio, para que deshacer no arrastre
      // campos que nadie toco.
      const antes: Record<string, unknown> = {};
      for (const clave of Object.keys(payload) as Array<keyof typeof payload>) {
        antes[clave] = (previous as unknown as Record<string, unknown>)[clave];
      }

      const pageId = page.id;
      const aplicar = async (valores: Record<string, unknown>) => {
        const r = await booksApi.updateElement(book.value!.id, pageId, elementId, valores as never);
        replaceElement(r);
      };

      historial.registrar({
        descripcion: payload.transformMatrix
          ? `mover ${describirElemento(previous)}`
          : `cambiar ${describirElemento(previous)}`,
        deshacer: () => aplicar(antes),
        rehacer: () => aplicar(payload as Record<string, unknown>),
      });
    } else {
      page.elements[index] = previous;
    }
  }

  async function removeElement(elementId: string): Promise<void> {
    if (!book.value || !currentPage.value) return;
    const page = currentPage.value;
    // Copia previa: sin ella no habria con que reconstruirlo al deshacer.
    const borrado = page.elements.find((el) => el.id === elementId);
    const ok = await withSaving(async () => {
      await booksApi.deleteElement(book.value!.id, page.id, elementId);
      return true;
    });
    if (ok) {
      page.elements = page.elements.filter((el) => el.id !== elementId);
      if (selectedElementId.value === elementId) selectedElementId.value = null;

      if (borrado) {
        const pageId = page.id;
        let vigente = borrado.id;
        historial.registrar({
          descripcion: `borrar ${describirElemento(borrado)}`,
          deshacer: async () => {
            const recreado = await booksApi.createElement(book.value!.id, pageId, {
              type: borrado.type,
              transformMatrix: borrado.transformMatrix,
              properties: borrado.properties as Record<string, unknown>,
            });
            vigente = recreado.id;
            book.value!.pages.find((p) => p.id === pageId)?.elements.push(recreado);
          },
          rehacer: async () => {
            await booksApi.deleteElement(book.value!.id, pageId, vigente);
            const pagina = book.value!.pages.find((p) => p.id === pageId);
            if (pagina) pagina.elements = pagina.elements.filter((el) => el.id !== vigente);
          },
        });
      }
    }
  }

  type LayerMove = 'front' | 'back' | 'forward' | 'backward';

  async function moveLayer(elementId: string, move: LayerMove): Promise<void> {
    if (!book.value || !currentPage.value) return;

    const ordered = sortedElements.value.map((el) => el.id);
    const from = ordered.indexOf(elementId);
    if (from === -1) return;

    const to =
      move === 'front' ? ordered.length - 1
      : move === 'back' ? 0
      : move === 'forward' ? Math.min(from + 1, ordered.length - 1)
      : Math.max(from - 1, 0);

    if (from === to) return;

    ordered.splice(to, 0, ordered.splice(from, 1)[0]);

    const page = currentPage.value;
    const elements = await withSaving(() => booksApi.reorderLayers(book.value!.id, page.id, ordered));
    if (elements) page.elements = elements;
  }

  async function addPage(): Promise<void> {
    if (!book.value) return;
    const page = await withSaving(() =>
      booksApi.addPage(book.value!.id, { afterPageNumber: currentPage.value?.pageNumber }),
    );
    if (!page) return;
    book.value = await booksApi.get(book.value.id);
    currentPageIndex.value = book.value.pages.findIndex((p) => p.id === page.id);
    selectedElementId.value = null;
    selectedIds.value = [];
  }

  /** Inserta una pagina nueva ya montada a partir de una plantilla. */
  async function addPageFromTemplate(template: {
    backgroundColor: string;
    backgroundPattern: string | null;
    elements: Array<{
      type: ElementType;
      transformMatrix: TransformMatrix;
      properties: Record<string, unknown>;
    }>;
  }): Promise<void> {
    if (!book.value) return;
    const page = await withSaving(() =>
      booksApi.addPage(book.value!.id, {
        afterPageNumber: currentPage.value?.pageNumber,
        backgroundColor: template.backgroundColor,
        backgroundPattern: template.backgroundPattern,
        elements: template.elements,
      }),
    );
    if (!page) return;
    book.value = await booksApi.get(book.value.id);
    currentPageIndex.value = book.value.pages.findIndex((p) => p.id === page.id);
    selectedElementId.value = null;
    selectedIds.value = [];
  }

  /** Copia la pagina con su contenido y abre la copia. */
  async function duplicatePage(pageId: string): Promise<void> {
    if (!book.value) return;
    const page = await withSaving(() => booksApi.duplicatePage(book.value!.id, pageId));
    if (!page) return;
    book.value = await booksApi.get(book.value.id);
    currentPageIndex.value = book.value.pages.findIndex((p) => p.id === page.id);
    selectedElementId.value = null;
    selectedIds.value = [];
  }

  async function deletePage(pageId: string): Promise<void> {
    if (!book.value) return;
    const removedIndex = book.value.pages.findIndex((p) => p.id === pageId);
    const ok = await withSaving(async () => {
      await booksApi.deletePage(book.value!.id, pageId);
      return true;
    });
    if (!ok) return;
    book.value = await booksApi.get(book.value.id);
    // Al borrar una pagina anterior el indice actual se desplaza una posicion.
    const target = removedIndex < currentPageIndex.value ? currentPageIndex.value - 1 : currentPageIndex.value;
    goToPage(Math.min(target, book.value.pages.length - 1));
  }

  async function deleteCurrentPage(): Promise<void> {
    if (currentPage.value) await deletePage(currentPage.value.id);
  }

  /** Reordena las paginas siguiendo la lista recibida y conserva la pagina abierta. */
  async function reorderPages(pageIds: string[]): Promise<void> {
    if (!book.value) return;
    const openPageId = currentPage.value?.id;
    const updated = await withSaving(() => booksApi.reorderPages(book.value!.id, pageIds));
    if (!updated) return;
    book.value = updated;
    const index = book.value.pages.findIndex((p) => p.id === openPageId);
    if (index >= 0) currentPageIndex.value = index;
  }

  /** Tipo de hoja (cuadricula, rayado, comic...); null la deja lisa. */
  async function setPagePattern(pattern: string | null): Promise<void> {
    if (!book.value || !currentPage.value) return;
    const page = currentPage.value;
    const previous = page.backgroundPattern;
    page.backgroundPattern = pattern;
    const updated = await withSaving(() =>
      booksApi.updatePage(book.value!.id, page.id, { backgroundPattern: pattern }),
    );
    if (!updated) page.backgroundPattern = previous;
  }

  async function setPageBackground(color: string): Promise<void> {
    if (!book.value || !currentPage.value) return;
    const page = currentPage.value;
    const previous = page.backgroundColor;
    page.backgroundColor = color;
    const updated = await withSaving(() =>
      booksApi.updatePage(book.value!.id, page.id, { backgroundColor: color }),
    );
    if (!updated) page.backgroundColor = previous;
  }

  /** Refleja en el libro abierto lo que devuelve el dialogo de compartir. */
  function applyShareState(state: { visibility: ShareVisibility; token: string | null }): void {
    if (!book.value) return;
    book.value.shareVisibility = state.visibility;
    book.value.shareToken = state.token;
  }

  /** Activa o desactiva que toda la clase pueda editar el libro. */
  async function setCollaborative(value: boolean): Promise<void> {
    if (!book.value) return;
    const updated = await withSaving(() => booksApi.setCollaborative(book.value!.id, value));
    if (updated) book.value.collaborative = updated.collaborative;
  }

  async function renameBook(title: string): Promise<void> {
    if (!book.value) return;
    const updated = await withSaving(() => booksApi.update(book.value!.id, { title }));
    if (updated) book.value.title = updated.title;
  }

  return {
    book,
    currentPageIndex,
    currentPage,
    selectedElementId,
    selectedIds,
    selectedElement,
    selectedElements,
    sortedElements,
    aspectRatio,
    canEdit,
    isManager,
    loading,
    saving,
    error,
    load,
    goToPage,
    select,
    selectMany,
    moveSelection,
    removeSelection,
    addElement,
    patchElement,
    removeElement,
    moveLayer,
    addPage,
    addPageFromTemplate,
    duplicatePage,
    deletePage,
    deleteCurrentPage,
    reorderPages,
    setPageBackground,
    setPagePattern,
    applyShareState,
    setCollaborative,
    renameBook,

    // Deshacer y rehacer
    puedeDeshacer: historial.puedeDeshacer,
    puedeRehacer: historial.puedeRehacer,
    siguienteDeshacer: historial.siguienteDeshacer,
    siguienteRehacer: historial.siguienteRehacer,
    deshacer: historial.deshacer,
    rehacer: historial.rehacer,
  };
});
