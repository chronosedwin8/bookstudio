import { defineStore } from 'pinia';
import { ref } from 'vue';
import { librariesApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { Library } from '@/types/api';

export const useLibrariesStore = defineStore('libraries', () => {
  const items = ref<Library[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Interruptor de la administracion para ver las bibliotecas de todo el colegio.
   * Apagado por omision: quien administra tambien usa la plataforma para lo suyo.
   */
  const verTodo = ref(false);

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      items.value = await librariesApi.list(verTodo.value);
    } catch (err) {
      error.value = errorMessage(err);
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string): Promise<Library> {
    const library = await librariesApi.create({ name });
    items.value = [library, ...items.value];
    return library;
  }

  async function join(codeInvite: string): Promise<Library> {
    const library = await librariesApi.join(codeInvite);
    if (!items.value.some((l) => l.id === library.id)) items.value = [library, ...items.value];
    return library;
  }

  async function remove(id: string): Promise<void> {
    await librariesApi.remove(id);
    items.value = items.value.filter((l) => l.id !== id);
  }

  function upsert(library: Library): void {
    const index = items.value.findIndex((l) => l.id === library.id);
    if (index === -1) items.value = [library, ...items.value];
    else items.value[index] = library;
  }

  async function alternarVerTodo(): Promise<void> {
    verTodo.value = !verTodo.value;
    await fetchAll();
  }

  return { items, loading, error, verTodo, fetchAll, alternarVerTodo, create, join, remove, upsert };
});
