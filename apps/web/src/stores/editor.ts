import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { booksApi } from '@/services/api';
import { crearHistorial, describirElemento, NOMBRE_TIPO } from './historial';
import { errorMessage } from '@/services/http';
import type {
  BookDetail,
  CanvasElement,
  ElementActions,
  ElementAnimation,
  ElementInteraction,
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

/** Lo que se copia de un elemento: todo menos donde vivia. */
export type ElementoCopiado = Pick<
  CanvasElement,
  'type' | 'transformMatrix' | 'properties' | 'opacity' | 'isLocked' | 'interaction' | 'animation' | 'actions'
>;

/**
 * Lo que se deja en el portapapeles del sistema al copiar objetos.
 *
 * La marca sirve para distinguir "esto lo copie de BookStudio" de cualquier otro
 * texto que la persona tuviera copiado: sin ella, pegar dentro del lienzo no
 * podria saber si lo que hay es un objeto o el correo de alguien.
 */
export interface PortapapelesBookStudio {
  __bookstudio: 'elementos';
  version: 1;
  elementos: ElementoCopiado[];
}

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

  /**
   * Elemento que debe abrirse para escribir nada mas crearse.
   *
   * Lo pone quien inserta un texto y lo consume la caja del lienzo. Sin esto
   * habia que crear el texto, buscarlo y hacer doble clic encima antes de poder
   * escribir la primera letra.
   */
  const editingElementId = ref<string | null>(null);

  const historial = crearHistorial();

  /*
   * Que id tiene ahora un elemento que ya existia.
   *
   * Deshacer un borrado no devuelve el elemento: crea uno igual, y el servidor le
   * da un id nuevo. Los pasos del historial anteriores a ese borrado siguen
   * apuntando al id viejo, asi que al seguir deshaciendo se pedia al servidor un
   * elemento inexistente y saltaba un error. Aqui se apunta la equivalencia y
   * todo el historial la consulta antes de tocar nada.
   */
  const equivalencias = new Map<string, string>();

  function idVigente(id: string): string {
    let actual = id;
    // En cadena: un elemento puede borrarse y recuperarse varias veces
    const vistos = new Set<string>();
    while (equivalencias.has(actual) && !vistos.has(actual)) {
      vistos.add(actual);
      actual = equivalencias.get(actual)!;
    }
    return actual;
  }

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

    // Un solo paso de deshacer: mover tres cosas a la vez es una accion, no tres
    const que = targets.length === 1 ? `mover ${describirElemento(targets[0])}` : `mover ${targets.length} elementos`;
    await historial.agrupar(que, async () => {
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
    });
  }

  /** Elimina todos los elementos seleccionados que no esten bloqueados. */
  async function removeSelection(): Promise<void> {
    const elegidos = selectedElements.value.filter((el) => !el.isLocked);
    if (!elegidos.length) return;

    const que = elegidos.length === 1 ? `borrar ${describirElemento(elegidos[0])}` : `borrar ${elegidos.length} elementos`;
    await historial.agrupar(que, async () => {
      for (const el of elegidos) await removeElement(el.id);
    });

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

  /**
   * Cambia el elemento SOLO en memoria, sin guardar ni tocar el historial.
   *
   * Lo usa el inspector mientras se teclea: el lienzo tiene que reflejar cada
   * letra al momento, pero guardar en cada pulsacion serian treinta peticiones
   * para escribir una frase y treinta pasos de "deshacer", uno por letra. Quien
   * llame a esto se compromete a llamar despues a `patchElement` para guardarlo.
   */
  function patchElementLocal(elementId: string, properties: Record<string, unknown>): void {
    const page = currentPage.value;
    if (!page) return;
    const index = page.elements.findIndex((el) => el.id === elementId);
    if (index === -1) return;
    page.elements[index] = { ...page.elements[index], properties } as CanvasElement;
  }

  /* ------------------------------------------------------------------------
   * Copiar y pegar objetos
   *
   * Lo copiado se guarda aqui Y en el portapapeles del sistema. Lo primero es lo
   * que hace que funcione siempre; lo segundo permite copiar un objeto de un
   * libro y pegarlo en otro, o en otra pestana.
   *
   * En el portapapeles va con una marca reconocible, para distinguir "esto lo
   * copie yo de BookStudio" de cualquier otro texto que alguien tenga copiado.
   * --------------------------------------------------------------------- */

  const copiados = ref<ElementoCopiado[]>([]);

  const recortar = (el: CanvasElement): ElementoCopiado => ({
    type: el.type,
    transformMatrix: { ...el.transformMatrix },
    properties: JSON.parse(JSON.stringify(el.properties ?? {})),
    opacity: el.opacity,
    isLocked: el.isLocked,
    interaction: el.interaction ?? null,
    animation: el.animation ?? null,
    actions: el.actions ?? null,
  });


  /** Lo copiado, listo para dejarlo en el portapapeles del sistema. */
  function paquetePortapapeles(): string {
    const paquete: PortapapelesBookStudio = {
      __bookstudio: 'elementos',
      version: 1,
      elementos: copiados.value,
    };
    return JSON.stringify(paquete);
  }

  /**
   * Lee un paquete nuestro de un texto del portapapeles. Devuelve null si ese
   * texto es cualquier otra cosa, que es lo normal.
   */
  function leerPaquete(texto: string): ElementoCopiado[] | null {
    if (!texto.includes('__bookstudio')) return null;
    try {
      const dato = JSON.parse(texto) as PortapapelesBookStudio;
      if (dato?.__bookstudio !== 'elementos' || !Array.isArray(dato.elementos)) return null;
      return dato.elementos;
    } catch {
      return null;
    }
  }

  /**
   * Guarda la seleccion como "lo copiado" y devuelve el paquete para dejarlo en
   * el portapapeles del sistema.
   *
   * No se escribe aqui en el portapapeles. Se intento con
   * `navigator.clipboard.writeText` y no llegaba a escribir nada: esa API exige
   * que la pagina tenga el foco y permisos concedidos, y falla en silencio. Quien
   * escribe es el evento `copy` del navegador, que ya viene autorizado porque lo
   * ha provocado la persona.
   */
  function copiarSeleccion(): { cuantos: number; paquete: string } {
    const elegidos = selectedElements.value;
    if (!elegidos.length) return { cuantos: 0, paquete: '' };

    copiados.value = elegidos.map(recortar);
    return { cuantos: copiados.value.length, paquete: paquetePortapapeles() };
  }

  async function cortarSeleccion(): Promise<{ cuantos: number; paquete: string }> {
    const copia = copiarSeleccion();
    if (copia.cuantos) await removeSelection();
    return copia;
  }

  /**
   * Pega los elementos indicados (o lo ultimo copiado) en la pagina actual.
   *
   * Se corren un poco respecto al original para que se vea que hay dos cosas y no
   * una: pegados exactamente encima, parece que no ha pasado nada.
   */
  async function pegar(elementos: ElementoCopiado[] = copiados.value): Promise<number> {
    if (!book.value || !currentPage.value || !elementos.length) return 0;

    const DESPLAZAMIENTO = 3;
    const que = elementos.length === 1
      ? `pegar ${NOMBRE_TIPO[elementos[0].type] ?? 'elemento'}`
      : `pegar ${elementos.length} elementos`;

    const nuevos: string[] = [];
    await historial.agrupar(que, async () => {
      for (const copia of elementos) {
        const t = copia.transformMatrix;
        const creado = await addElement(
          copia.type,
          {
            ...t,
            x: Math.min(100 - Math.min(t.width, 100), t.x + DESPLAZAMIENTO),
            y: Math.min(100 - Math.min(t.height, 100), t.y + DESPLAZAMIENTO),
          },
          copia.properties as Record<string, unknown>,
        );
        if (!creado) continue;
        nuevos.push(creado.id);

        // Lo que no viaja en `addElement` se pone despues: opacidad, bloqueo y
        // todo lo de interactividad, que tambien forma parte de lo copiado.
        const extra: Parameters<typeof patchElement>[1] = {};
        if (copia.opacity !== 1) extra.opacity = copia.opacity;
        if (copia.isLocked) extra.isLocked = copia.isLocked;
        if (copia.interaction) extra.interaction = copia.interaction;
        if (copia.animation) extra.animation = copia.animation;
        if (copia.actions) extra.actions = copia.actions;
        if (Object.keys(extra).length) await patchElement(creado.id, extra);
      }
    });

    // Lo recien pegado queda seleccionado: es lo que se va a mover a continuacion
    if (nuevos.length) {
      selectedIds.value = nuevos;
      selectedElementId.value = nuevos[nuevos.length - 1];
    }
    return nuevos.length;
  }

  /** Duplicar es copiar y pegar sin tocar el portapapeles de nadie. */
  async function duplicarSeleccion(): Promise<number> {
    const elegidos = selectedElements.value;
    if (!elegidos.length) return 0;
    return pegar(elegidos.map(recortar));
  }

  /** Hay algo que pegar sin mirar el portapapeles del sistema. */
  const hayCopiados = computed(() => copiados.value.length > 0);

  /** Aplica el cambio en local y luego persiste; ante error recarga para no dejar estado divergente. */
  async function patchElement(
    elementId: string,
    payload: {
      transformMatrix?: TransformMatrix;
      properties?: Record<string, unknown>;
      zIndex?: number;
      isLocked?: boolean;
      opacity?: number;
      /** null la quita; ausente la deja como estaba. */
      interaction?: ElementInteraction | null;
      animation?: ElementAnimation | null;
      actions?: ElementActions | null;
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
        const vigente = idVigente(elementId);
        // Un paso viejo puede apuntar a algo que ya no esta; deshacer no puede
        // reventar por eso, simplemente no hay nada que cambiar.
        if (!page.elements.some((el) => el.id === vigente)) return;
        const r = await booksApi.updateElement(book.value!.id, pageId, vigente, valores as never);
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
              interaction: borrado.interaction,
              animation: borrado.animation,
              actions: borrado.actions,
            });
            // Quien apunte al id viejo debe encontrar el nuevo
            equivalencias.set(vigente, recreado.id);
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

    const previo = [...ordered];
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);

    const page = currentPage.value;

    const aplicar = async (orden: string[]): Promise<void> => {
      // Los ids pueden haber cambiado si algo se borro y se recupero
      const vigentes = orden.map(idVigente).filter((id) => page.elements.some((el) => el.id === id));
      if (vigentes.length !== page.elements.length) return;
      const elements = await withSaving(() => booksApi.reorderLayers(book.value!.id, page.id, vigentes));
      if (elements) page.elements = elements;
    };

    await aplicar(ordered);

    // Cambiar de capa era lo unico que no se podia deshacer: se guarda el orden
    // que habia, que es lo unico que hace falta para volver atras.
    historial.registrar({
      descripcion: `cambiar la capa de ${describirElemento(sortedElements.value.find((el) => el.id === elementId) ?? { type: 'shape' })}`,
      deshacer: () => aplicar(previo),
      rehacer: () => aplicar(ordered),
    });
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
    editingElementId,
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
    patchElementLocal,
    copiarSeleccion,
    cortarSeleccion,
    pegar,
    duplicarSeleccion,
    leerPaquete,
    hayCopiados,
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
