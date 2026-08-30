import { http } from './http';
import type {
  AnswerResult,
  Book,
  ManagedUser,
  PhidiasImportResult,
  PhidiasSection,
  UserPage,
  UserStats,
  BookDetail,
  CanvasElement,
  ClassView,
  ElementType,
  GeocodeResult,
  LayoutFormat,
  Library,
  LibraryMembers,
  MediaSearchResponse,
  Page,
  ShareState,
  ShareVisibility,
  SharedBook,
  StudentCredential,
  TransformMatrix,
  UploadedFile,
  User,
} from '@/types/api';

interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  async register(payload: { email: string; password: string; fullName: string; role: 'teacher' | 'student' }) {
    const { data } = await http.post<AuthResponse>('/auth/register', payload);
    return data;
  },
  async login(payload: { email: string; password: string }) {
    const { data } = await http.post<AuthResponse>('/auth/login', payload);
    return data;
  },
  async loginWithQr(token: string) {
    const { data } = await http.post<AuthResponse>('/auth/login/qr', { token });
    return data;
  },
  async me() {
    const { data } = await http.get<{ user: User }>('/auth/me');
    return data.user;
  },
  async createStudent(payload: { fullName: string; libraryId: string }) {
    const { data } = await http.post<StudentCredential>('/auth/students', payload);
    return data;
  },
};

export const librariesApi = {
  async list() {
    const { data } = await http.get<{ libraries: Library[] }>('/libraries');
    return data.libraries;
  },
  async get(id: string) {
    const { data } = await http.get<{ library: Library }>(`/libraries/${id}`);
    return data.library;
  },
  async create(payload: { name: string; studentBookLimit?: number }) {
    const { data } = await http.post<{ library: Library }>('/libraries', payload);
    return data.library;
  },
  async update(id: string, payload: Partial<Omit<Library, 'id' | 'codeInvite' | 'ownerId' | 'createdAt'>>) {
    const { data } = await http.patch<{ library: Library }>(`/libraries/${id}`, payload);
    return data.library;
  },
  async remove(id: string) {
    await http.delete(`/libraries/${id}`);
  },
  async join(codeInvite: string) {
    const { data } = await http.post<{ library: Library }>('/libraries/join', { codeInvite });
    return data.library;
  },
  async members(id: string) {
    const { data } = await http.get<LibraryMembers>(`/libraries/${id}/members`);
    return data;
  },
  async classView(id: string, params: { page?: number; pageSize?: number; search?: string } = {}) {
    const { data } = await http.get<ClassView>(`/libraries/${id}/class-view`, { params });
    return data;
  },
  async addTeacher(id: string, email: string) {
    await http.post(`/libraries/${id}/teachers`, { email });
  },
  async removeTeacher(id: string, teacherId: string) {
    await http.delete(`/libraries/${id}/teachers/${teacherId}`);
  },
};

export const booksApi = {
  async list(
    params: {
      libraryId?: string;
      creatorId?: string;
      isTemplate?: 'true' | 'false';
      /** personal = libros fuera de clase; library = libros de bibliotecas. */
      scope?: 'all' | 'personal' | 'library';
    } = {},
  ) {
    const { data } = await http.get<{ books: Book[] }>('/books', { params });
    return data.books;
  },
  async get(id: string) {
    const { data } = await http.get<{ book: BookDetail }>(`/books/${id}`);
    return data.book;
  },
  /** Sin libraryId el libro se crea como personal, fuera de toda biblioteca. */
  async create(payload: { title?: string; libraryId?: string | null; layoutFormat?: LayoutFormat; isTemplate?: boolean }) {
    const { data } = await http.post<{ book: Book }>('/books', payload);
    return data.book;
  },
  async update(id: string, payload: { title?: string; isPublished?: boolean; isTemplate?: boolean }) {
    const { data } = await http.patch<{ book: Book }>(`/books/${id}`, payload);
    return data.book;
  },
  async remove(id: string) {
    await http.delete(`/books/${id}`);
  },

  async setSharing(id: string, visibility: ShareVisibility) {
    const { data } = await http.put<{ share: ShareState }>(`/books/${id}/share`, { visibility });
    return data.share;
  },
  async setCollaborative(id: string, collaborative: boolean) {
    const { data } = await http.put<{ book: Book }>(`/books/${id}/collaborative`, { collaborative });
    return data.book;
  },
  async rotateShareLink(id: string) {
    const { data } = await http.post<{ share: ShareState }>(`/books/${id}/share/rotate`);
    return data.share;
  },
  /** Corrige una pregunta en el servidor; la solucion nunca viaja al navegador. */
  async answerQuestion(bookId: string, elementId: string, answer: string[]) {
    const { data } = await http.post<{ result: AnswerResult }>(
      `/books/${bookId}/questions/${elementId}/answer`,
      { answer },
    );
    return data.result;
  },
  async answerSharedQuestion(token: string, elementId: string, answer: string[]) {
    const { data } = await http.post<{ result: AnswerResult }>(
      `/public/books/${token}/questions/${elementId}/answer`,
      { answer },
    );
    return data.result;
  },

  /** Abre un libro por su enlace compartido; funciona tambien sin sesion. */
  async getShared(token: string) {
    const { data } = await http.get<{ book: SharedBook }>(`/public/books/${token}`);
    return data.book;
  },

  async addPage(
    bookId: string,
    payload: {
      afterPageNumber?: number;
      backgroundColor?: string;
      backgroundPattern?: string | null;
      /** Contenido inicial de la pagina; lo usan las plantillas. */
      elements?: Array<{
        type: ElementType;
        transformMatrix: TransformMatrix;
        properties: Record<string, unknown>;
      }>;
    } = {},
  ) {
    const { data } = await http.post<{ page: Page }>(`/books/${bookId}/pages`, payload);
    return data.page;
  },
  async updatePage(bookId: string, pageId: string, payload: { backgroundColor?: string; backgroundPattern?: string | null }) {
    const { data } = await http.patch<{ page: Omit<Page, 'elements'> }>(`/books/${bookId}/pages/${pageId}`, payload);
    return data.page;
  },
  async duplicatePage(bookId: string, pageId: string) {
    const { data } = await http.post<{ page: Page }>(`/books/${bookId}/pages/${pageId}/duplicate`);
    return data.page;
  },
  async deletePage(bookId: string, pageId: string) {
    await http.delete(`/books/${bookId}/pages/${pageId}`);
  },
  async reorderPages(bookId: string, pageIds: string[]) {
    const { data } = await http.patch<{ book: BookDetail }>(`/books/${bookId}/pages/reorder`, { pageIds });
    return data.book;
  },

  async createElement(
    bookId: string,
    pageId: string,
    payload: {
      type: ElementType;
      transformMatrix: TransformMatrix;
      properties: Record<string, unknown>;
      opacity?: number;
      isLocked?: boolean;
    },
  ) {
    const { data } = await http.post<{ element: CanvasElement }>(`/books/${bookId}/pages/${pageId}/elements`, payload);
    return data.element;
  },
  async updateElement(
    bookId: string,
    pageId: string,
    elementId: string,
    payload: {
      transformMatrix?: TransformMatrix;
      properties?: Record<string, unknown>;
      zIndex?: number;
      isLocked?: boolean;
      opacity?: number;
    },
  ) {
    const { data } = await http.patch<{ element: CanvasElement }>(
      `/books/${bookId}/pages/${pageId}/elements/${elementId}`,
      payload,
    );
    return data.element;
  },
  async deleteElement(bookId: string, pageId: string, elementId: string) {
    await http.delete(`/books/${bookId}/pages/${pageId}/elements/${elementId}`);
  },
  async reorderLayers(bookId: string, pageId: string, elementIds: string[]) {
    const { data } = await http.patch<{ elements: CanvasElement[] }>(
      `/books/${bookId}/pages/${pageId}/elements/reorder`,
      { elementIds },
    );
    return data.elements;
  },
};

export const mediaApi = {
  async search(params: {
    q: string;
    type?: 'images' | 'audio';
    page?: number;
    pageSize?: number;
    /** gif limita la busqueda a imagenes animadas con licencia abierta. */
    extension?: 'gif' | 'png' | 'jpg' | 'svg';
  }) {
    const { data } = await http.get<MediaSearchResponse>('/media/search', { params });
    return data;
  },
  async geocode(q: string, limit = 5) {
    const { data } = await http.get<{ results: GeocodeResult[] }>('/media/geocode', { params: { q, limit } });
    return data.results;
  },
  async upload(dataUrl: string) {
    // Los archivos multimedia tardan mas que una peticion normal.
    const { data } = await http.post<UploadedFile>('/media/uploads', { dataUrl }, { timeout: 60_000 });
    return data;
  },
};

export const usersApi = {
  async list(params: { search?: string; role?: string; page?: number; pageSize?: number } = {}) {
    const { data } = await http.get<UserPage>('/users', { params });
    return data;
  },
  async stats() {
    const { data } = await http.get<{ stats: UserStats }>('/users/stats');
    return data.stats;
  },
  async create(payload: { email: string; password: string; fullName: string; role: string }) {
    const { data } = await http.post<{ user: ManagedUser }>('/users', payload);
    return data.user;
  },
  async update(id: string, payload: { fullName?: string; role?: string; isActive?: boolean }) {
    const { data } = await http.patch<{ user: ManagedUser }>(`/users/${id}`, payload);
    return data.user;
  },
  async resetPassword(id: string, password: string) {
    await http.post(`/users/${id}/password`, { password });
  },
};

export const phidiasApi = {
  async status() {
    const { data } = await http.get<{ enabled: boolean }>('/phidias/status');
    return data.enabled;
  },
  async sections() {
    // La descarga del consolidado tarda; el backend la cachea cinco minutos.
    const { data } = await http.get<{ sections: PhidiasSection[] }>('/phidias/sections', { timeout: 90_000 });
    return data.sections;
  },
  /** Sin libraryId crea la clase de la seccion; con el, anade a una ya existente. */
  async importSection(sectionId: number, libraryId?: string) {
    const { data } = await http.post<{ result: PhidiasImportResult }>(
      '/phidias/import',
      { sectionId, libraryId },
      { timeout: 120_000 },
    );
    return data.result;
  },
  async refresh() {
    await http.post('/phidias/refresh');
  },
};

export const contactApi = {
  /** Envio publico: quien pide una demo todavia no tiene cuenta. */
  async send(payload: {
    name: string;
    email: string;
    organization?: string;
    plan?: string;
    people?: number;
    message: string;
  }) {
    await http.post('/contact', payload);
  },
};
