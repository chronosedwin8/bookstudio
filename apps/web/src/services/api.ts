import { http } from './http';
import type {
  AdminOrganization,
  AnswerResult,
  Charge,
  ChargeItem,
  ClientOrganization,
  ClientPortal,
  TeamMember,
  MagnificAspect,
  MagnificModel,
  MagnificTask,
  Quiz,
  QuizDetail,
  QuizQuestion,
  QuizQuestionInput,
  QuizResultAnswer,
  QuizResults,
  QuizStatus,
  QuizSubmitResult,
  BillingConfig,
  Book,
  BookActivity,
  CheckoutResult,
  Invoice,
  SignupCheckoutResult,
  Subscription,
  TrialSession,
  ManagedUser,
  PhidiasImportResult,
  PhidiasSection,
  UserPage,
  UserStats,
  BookDetail,
  CanvasElement,
  AddStudentsResult,
  BorradoUsuario,
  Candidate,
  ClassView,
  DistributeResult,
  ElementType,
  Grade,
  GradeBook,
  SourceGroup,
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
  StudentSearchResult,
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
  /** Acceso de prueba sin registro; el servidor crea una cuenta temporal. */
  async startTrial() {
    const { data } = await http.post<TrialSession>('/auth/trial');
    return data;
  },
  /** La actual no hace falta si la cuenta entra por QR y nunca tuvo una. */
  async changePassword(payload: { currentPassword?: string; newPassword: string }) {
    await http.post('/auth/password', payload);
  },
  async createStudent(payload: { fullName: string; libraryId: string }) {
    const { data } = await http.post<StudentCredential>('/auth/students', payload);
    return data;
  },
};

/** Estado de la entrada con la cuenta del colegio. */
export const ssoApi = {
  async config() {
    const { data } = await http.get<{ enabled: boolean; domain: string }>('/auth/sso/config');
    return data;
  },
  /** Sale del SPA a proposito: la vuelta la maneja el servidor. */
  entrar(redirect = '/dashboard') {
    window.location.href = `/api/auth/sso/start?redirect=${encodeURIComponent(redirect)}`;
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

  /** Grupos de los que se puede sacar alumnado: cursos de BookStudio y de Phidias. */
  async sourceGroups(id: string) {
    const { data } = await http.get<{ groups: SourceGroup[] }>(`/libraries/${id}/sources`);
    return data.groups;
  },
  /** Lista completa de un grupo, para marcar a quien haga falta. */
  async roster(id: string, kind: SourceGroup['kind'], groupId: string) {
    const { data } = await http.get<{ students: Candidate[] }>(`/libraries/${id}/roster`, {
      params: { kind, id: groupId },
    });
    return data.students;
  },
  /** Busca alumnado por nombre o correo, cuando ya se sabe a quien se quiere. */
  async searchStudents(id: string, q: string) {
    const { data } = await http.get<{ students: StudentSearchResult[] }>(
      `/libraries/${id}/students/search`,
      { params: { q } },
    );
    return data.students;
  },
  /** Las claves son uuid de cuentas existentes o "phidias:<seccion>:<alumno>". */
  async addStudents(id: string, keys: string[]) {
    const { data } = await http.post<AddStudentsResult>(`/libraries/${id}/students`, { keys });
    return data;
  },
  /** Cuadricula de valoraciones de toda la clase. */
  async gradebook(id: string) {
    const { data } = await http.get<GradeBook>(`/libraries/${id}/gradebook`);
    return data;
  },
  async bulkDeleteBooks(id: string, bookIds: string[]) {
    const { data } = await http.post<{ deleted: number; ignored: number }>(
      `/libraries/${id}/books/bulk-delete`,
      { bookIds },
    );
    return data;
  },
  async removeStudent(id: string, studentId: string) {
    await http.delete(`/libraries/${id}/students/${studentId}`);
  },

  /** Entrega una pagina o un libro entero como copia propia de cada alumno. */
  async distribute(
    id: string,
    payload: {
      sourceBookId: string;
      pageId?: string;
      studentIds?: string[];
      title?: string;
      /** nuevo: libro propio de la entrega. existentes: dentro de los que ya tienen. */
      target?: 'nuevo' | 'existentes';
      position?: 'inicio' | 'final';
    },
  ) {
    const { data } = await http.post<DistributeResult>(`/libraries/${id}/distribute`, payload);
    return data;
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

  /** Valoraciones del libro. El alumno solo alcanza las de los suyos. */
  async grades(bookId: string) {
    const { data } = await http.get<{ grades: Grade[] }>(`/books/${bookId}/grades`);
    return data.grades;
  },
  async addGrade(bookId: string, payload: { title: string; score: number; description: string }) {
    const { data } = await http.post<{ grade: Grade }>(`/books/${bookId}/grades`, payload);
    return data.grade;
  },
  async updateGrade(
    bookId: string,
    gradeId: string,
    payload: { title: string; score: number; description: string },
  ) {
    const { data } = await http.patch<{ grade: Grade }>(`/books/${bookId}/grades/${gradeId}`, payload);
    return data.grade;
  },
  async removeGrade(bookId: string, gradeId: string) {
    await http.delete(`/books/${bookId}/grades/${gradeId}`);
  },

  /** Aviso de que se sigue trabajando; el servidor alarga la sesion en curso. */
  async touchActivity(bookId: string) {
    await http.post(`/books/${bookId}/activity`);
  },
  async activity(bookId: string) {
    const { data } = await http.get<BookActivity>(`/books/${bookId}/activity`);
    return data;
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
  /** Borra la cuenta y todo su contenido: libros, notas y archivos, tambien de S3. */
  async remove(id: string) {
    const { data } = await http.delete<{ deleted: BorradoUsuario }>(`/users/${id}`);
    return data.deleted;
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
  /** Pone al dia el curso (K10A...) de todo el alumnado traido de Phidias. */
  async syncGroups() {
    const { data } = await http.post<{
      total: number;
      actualizadas: number;
      clavesPuestas: number;
      sinSeccion: number;
    }>(
      '/phidias/sync-groups',
      {},
      { timeout: 120_000 },
    );
    return data;
  },
  async refresh() {
    await http.post('/phidias/refresh');
  },
};


export const billingApi = {
  async config() {
    const { data } = await http.get<BillingConfig>('/billing/config');
    return data;
  },
  async subscription() {
    const { data } = await http.get<{ subscription: Subscription | null }>('/billing/subscription');
    return data.subscription;
  },
  async invoices() {
    const { data } = await http.get<{ invoices: Invoice[] }>('/billing/invoices');
    return data.invoices;
  },
  /**
   * El navegador envia el identificador del plan, nunca el importe: el precio lo
   * decide el servidor a partir de su propio catalogo.
   */
  /** Alta y pago a la vez, para quien todavia no tiene cuenta. */
  async signupCheckout(payload: {
    fullName: string;
    password: string;
    plan: string;
    token?: string;
    paymentMethodId: string;
    installments: number;
    payerEmail: string;
    payerDocType?: string;
    payerDocNumber?: string;
    organization?: string;
    autoRenew: boolean;
  }) {
    const { data } = await http.post<SignupCheckoutResult>('/billing/signup-checkout', payload, {
      timeout: 60_000,
    });
    return data;
  },
  async checkout(payload: {
    plan: string;
    token?: string;
    paymentMethodId: string;
    installments: number;
    payerEmail: string;
    payerDocType?: string;
    payerDocNumber?: string;
    organization?: string;
    autoRenew: boolean;
  }) {
    const { data } = await http.post<CheckoutResult>('/billing/checkout', payload, {
      timeout: 60_000,
    });
    return data;
  },
  async setAutoRenew(autoRenew: boolean) {
    const { data } = await http.put<{ subscription: Subscription; authorizationUrl?: string }>(
      '/billing/auto-renew',
      { autoRenew },
    );
    return data;
  },
  async allSubscriptions() {
    const { data } = await http.get<{ subscriptions: Subscription[] }>('/billing/subscriptions');
    return data.subscriptions;
  },
};

export const quizzesApi = {
  async list(libraryId?: string) {
    const { data } = await http.get<{ quizzes: Quiz[] }>('/quizzes', { params: libraryId ? { libraryId } : {} });
    return data.quizzes;
  },
  async get(id: string) {
    const { data } = await http.get<{ quiz: QuizDetail }>(`/quizzes/${id}`);
    return data.quiz;
  },
  async create(payload: { libraryId: string; title: string; description?: string }) {
    const { data } = await http.post<{ quiz: Quiz }>('/quizzes', payload);
    return data.quiz;
  },
  async update(
    id: string,
    payload: Partial<{
      title: string;
      description: string;
      status: QuizStatus;
      showSolutions: boolean;
      allowRetry: boolean;
      timeLimitMinutes: number | null;
    }>,
  ) {
    const { data } = await http.patch<{ quiz: Quiz }>(`/quizzes/${id}`, payload);
    return data.quiz;
  },
  async remove(id: string) {
    await http.delete(`/quizzes/${id}`);
  },
  /** El examen se guarda entero: es como se edita en pantalla. */
  async saveQuestions(id: string, questions: QuizQuestionInput[]) {
    const { data } = await http.put<{ questions: QuizQuestion[] }>(`/quizzes/${id}/questions`, { questions });
    return data.questions;
  },
  /** Sin lista concreta va a toda la clase. */
  async assign(id: string, studentIds: string[] = []) {
    const { data } = await http.post<{ assigned: number; total: number }>(`/quizzes/${id}/assign`, { studentIds });
    return data;
  },
  async answer(id: string, answers: Array<{ questionId: string; answer: string[] }>, submit: boolean) {
    const { data } = await http.post<QuizSubmitResult>(`/quizzes/${id}/answers`, { answers, submit });
    return data;
  },
  async results(id: string) {
    const { data } = await http.get<QuizResults>(`/quizzes/${id}/results`);
    return data;
  },
  async review(
    id: string,
    questionId: string,
    studentId: string,
    payload: { score: number; correct?: boolean | null; teacherNote?: string },
  ) {
    const { data } = await http.patch<{ answer: QuizResultAnswer }>(
      `/quizzes/${id}/answers/${questionId}/${studentId}`,
      payload,
    );
    return data.answer;
  },
};

export const magnificApi = {
  async config() {
    const { data } = await http.get<{ enabled: boolean; canGenerate: boolean }>('/magnific/config');
    return data;
  },
  async generar(payload: {
    prompt: string;
    aspectRatio: MagnificAspect;
    model: MagnificModel;
    resolution: '1k' | '2k';
  }) {
    const { data } = await http.post<MagnificTask>('/magnific/images', payload);
    return data;
  },
  async consultar(taskId: string) {
    const { data } = await http.get<MagnificTask>(`/magnific/images/${taskId}`);
    return data;
  },
};

export const clientsApi = {
  /** organizationId solo lo usa la administracion, para entrar en otro cliente. */
  async portal(organizationId?: string) {
    const { data } = await http.get<{ portal: ClientPortal }>('/clients/portal', {
      params: organizationId ? { organizationId } : {},
    });
    return data.portal;
  },
  async updateBillingData(
    payload: Partial<{
      legalName: string;
      taxId: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
      address: string;
      city: string;
    }>,
    organizationId?: string,
  ) {
    const { data } = await http.patch<{ organization: ClientOrganization }>('/clients/billing-data', payload, {
      params: organizationId ? { organizationId } : {},
    });
    return data.organization;
  },

  async team(organizationId?: string) {
    const { data } = await http.get<{ team: TeamMember[] }>('/clients/team', {
      params: organizationId ? { organizationId } : {},
    });
    return data.team;
  },
  /** Devuelve la clave del docente nuevo; no se puede volver a consultar. */
  async createTeacher(payload: { fullName: string; email: string }, organizationId?: string) {
    const { data } = await http.post<{ member: TeamMember; password: string }>('/clients/team', payload, {
      params: organizationId ? { organizationId } : {},
    });
    return data;
  },
  async updateTeacher(id: string, payload: { fullName?: string; isActive?: boolean }, organizationId?: string) {
    const { data } = await http.patch<{ member: TeamMember }>(`/clients/team/${id}`, payload, {
      params: organizationId ? { organizationId } : {},
    });
    return data.member;
  },
  async removeTeacher(id: string, organizationId?: string) {
    await http.delete(`/clients/team/${id}`, { params: organizationId ? { organizationId } : {} });
  },

  async charge(id: string) {
    const { data } = await http.get<{ charge: Charge }>(`/clients/charges/${id}`);
    return data.charge;
  },
  async payCharge(
    id: string,
    payload: {
      token?: string;
      paymentMethodId: string;
      installments: number;
      payerEmail: string;
      payerDocType?: string;
      payerDocNumber?: string;
    },
  ) {
    const { data } = await http.post<{
      charge: Charge;
      payment: { status: string; statusDetail: string; invoiceNumber: number | null };
    }>(`/clients/charges/${id}/pay`, payload, { timeout: 40_000 });
    return data;
  },

  // --- Administracion de BookStudio ---
  async organizations() {
    const { data } = await http.get<{ organizations: AdminOrganization[] }>('/clients/organizations');
    return data.organizations;
  },
  async createOrganization(payload: {
    name: string;
    legalName?: string;
    taxId?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    city?: string;
    notes?: string;
  }) {
    const { data } = await http.post<{ organization: ClientOrganization }>('/clients/organizations', payload);
    return data.organization;
  },
  async linkOwner(organizationId: string, email: string) {
    const { data } = await http.post<{ organization: ClientOrganization }>(
      `/clients/organizations/${organizationId}/owner`,
      { email },
    );
    return data.organization;
  },
  async chargesOf(organizationId: string) {
    const { data } = await http.get<{ charges: Charge[] }>(`/clients/organizations/${organizationId}/charges`);
    return data.charges;
  },
  async createCharge(
    organizationId: string,
    payload: {
      concept: string;
      items: ChargeItem[];
      dueDate?: string | null;
      subscriptionId?: string | null;
      notes?: string;
      issue?: boolean;
    },
  ) {
    const { data } = await http.post<{ charge: Charge }>(
      `/clients/organizations/${organizationId}/charges`,
      payload,
    );
    return data.charge;
  },
  async updateCharge(id: string, payload: { status?: 'emitida' | 'anulada'; notes?: string; dueDate?: string | null }) {
    const { data } = await http.patch<{ charge: Charge }>(`/clients/charges/${id}`, payload);
    return data.charge;
  },
};
