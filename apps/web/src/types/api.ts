export type UserRole = 'teacher' | 'student' | 'admin';

/** Debe coincidir con el enum del backend (canvas.schemas.ts). */
export const FONT_FAMILIES = [
  'Lato', 'Cabin', 'Noto Sans', 'Nunito', 'Poppins', 'Quicksand',
  'Merriweather', 'Lora',
  'Fredoka', 'Baloo 2', 'Bangers', 'Luckiest Guy',
  'Caveat', 'Patrick Hand', 'Indie Flower',
  'OpenDyslexic', 'Atkinson Hyperlegible',
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Agrupacion mostrada en el selector de tipografia. */
export const FONT_GROUPS: Array<{ label: string; fonts: readonly FontFamily[] }> = [
  { label: 'Sin serifa', fonts: ['Lato', 'Cabin', 'Noto Sans', 'Nunito', 'Poppins', 'Quicksand'] },
  { label: 'Con serifa', fonts: ['Merriweather', 'Lora'] },
  { label: 'Titulares y comic', fonts: ['Fredoka', 'Baloo 2', 'Bangers', 'Luckiest Guy'] },
  { label: 'Manuscritas', fonts: ['Caveat', 'Patrick Hand', 'Indie Flower'] },
  { label: 'Accesibles', fonts: ['OpenDyslexic', 'Atkinson Hyperlegible'] },
];

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Library {
  id: string;
  name: string;
  codeInvite: string;
  ownerId: string;
  studentBookLimit: number;
  studentEditable: boolean;
  studentPublishable: boolean;
  commentsEnabled: boolean;
  /** Si esta apagado, cada alumno solo ve lo suyo y lo que reparte el docente. */
  studentsSeePeers: boolean;
  createdAt: string;
}

export interface ClassViewBook {
  id: string;
  title: string;
  layoutFormat: 'portrait' | 'square' | 'landscape';
  isPublished: boolean;
  pageCount: number;
  elementCount: number;
  updatedAt: string;
}

export interface ClassViewEntry {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  bookCount: number;
  publishedCount: number;
  totalPages: number;
  lastActivityAt: string | null;
  books: ClassViewBook[];
}

export interface ClassView {
  items: ClassViewEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LibraryMember {
  id: string;
  fullName: string;
  email: string;
  /** Clase de origen del sistema academico; null si no viene de ninguna. */
  course?: string | null;
}

export interface LibraryMembers {
  owner: LibraryMember;
  teachers: LibraryMember[];
  students: LibraryMember[];
}

export interface StudentCredential {
  user: User;
  qrToken: string;
  qrDataUrl: string;
}

/** Alumno encontrado al buscar por el centro, con los cursos en los que ya esta. */
export interface StudentSearchResult {
  id: string;
  fullName: string;
  email: string | null;
  libraries: string[];
  alreadyIn: boolean;
}

/** Grupo del que sacar alumnado: un curso de BookStudio o una seccion de Phidias. */
export interface SourceGroup {
  kind: 'library' | 'phidias';
  id: string;
  name: string;
  studentCount: number;
}

/** Alumno de un grupo. La clave es su uuid o "phidias:<seccion>:<alumno>". */
export interface Candidate {
  key: string;
  fullName: string;
  email: string | null;
  alreadyIn: boolean;
  hasAccount: boolean;
}

/**
 * Valoracion de un libro. Escala alemana: 1.0 es la mejor nota y 6.0 la peor, con un
 * decimal. Ojo al pintarla: la media mas baja es la mejor.
 */
export interface Grade {
  id: string;
  bookId: string;
  title: string;
  score: number;
  description: string;
  teacherId: string | null;
  teacherName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GradeBookEntry {
  studentId: string;
  studentName: string;
  course: string | null;
  average: number | null;
  grades: Array<Grade & { bookTitle: string }>;
}

export interface GradeBook {
  titles: string[];
  students: GradeBookEntry[];
  classAverage: number | null;
}

/** Una sesion de trabajo sobre un libro: desde que se abrio hasta el ultimo aviso. */
export interface WorkSession {
  id: string;
  userId: string;
  userName: string;
  role: string;
  startedAt: string;
  lastSeenAt: string;
  durationSeconds: number;
}

export interface BookActivity {
  sessions: WorkSession[];
  people: Array<{
    userId: string;
    userName: string;
    role: string;
    sessions: number;
    totalSeconds: number;
    firstAt: string;
    lastAt: string;
  }>;
}

/** Clave que hay que repartir a un alumno recien dado de alta. */
export interface ClaveEntregada {
  fullName: string;
  email: string;
  password: string;
  isNew: boolean;
}

export interface AddStudentsResult {
  added: number;
  skipped: number;
  accountsCreated: number;
  credentials: ClaveEntregada[];
}

/** Resumen de lo que se llevo por delante el borrado de una cuenta. */
export interface BorradoUsuario {
  fullName: string;
  email: string;
  books: number;
  pages: number;
  grades: number;
  mediaDeleted: number;
  storage: string;
}

export interface DistributeResult {
  delivered: number;
  created: number;
  updated: number;
  pages: number;
  books: number;
  withoutBooks: number;
  skipped: number;
}

export type LayoutFormat = 'portrait' | 'square' | 'landscape';
export type ElementType =
  | 'text' | 'shape' | 'drawing' | 'image' | 'audio' | 'video'
  | 'map' | 'icon' | 'embed' | 'question' | 'chart' | 'math';

export type ChartType = 'bar' | 'column' | 'line' | 'area' | 'pie' | 'doughnut';

export interface ChartSeries {
  label: string;
  value: number;
  color?: string;
}

export interface ChartProperties {
  chartType: ChartType;
  title: string;
  series: ChartSeries[];
  showValues: boolean;
  showLegend: boolean;
  accentColor: string;
}

export type QuestionKind = 'single' | 'multiple' | 'order';

export interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
  /** Solo llega a quien puede editar el libro; el lector la recibe sin ella. */
  correct?: boolean;
}

export interface QuestionProperties {
  kind: QuestionKind;
  prompt: string;
  promptImageUrl?: string;
  options: QuestionOption[];
  feedbackCorrect: string;
  feedbackWrong: string;
  accentColor: string;
  allowRetry: boolean;
}

export interface AnswerResult {
  correct: boolean;
  solution: string[];
  feedback: string;
}

export interface MediaResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator: string;
  creatorUrl: string | null;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  provider: string;
  width: number | null;
  height: number | null;
  attributionText: string;
}

export interface MediaSearchResponse {
  results: MediaResult[];
  page: number;
  pageCount: number;
  resultCount: number;
}

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
  type: string;
}

export interface UploadedFile {
  fileUrl: string;
  kind: 'audio' | 'video' | 'image';
  bytes: number;
  mimeType: string;
}

/** Coordenadas en porcentaje de la pagina, para que el lienzo escale sin recalcular posiciones. */
export interface TransformMatrix {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

export interface TextProperties {
  text: string;
  fontFamily: FontFamily;
  listStyle?: 'none' | 'bullet' | 'number';
  lineHeight?: number;
  letterSpacing?: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  columns: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  superscript: boolean;
  subscript: boolean;
  indent: number;
}

export interface ShapeProperties {
  shape: 'rectangle' | 'ellipse' | 'triangle' | 'star' | 'arrow' | 'speech-bubble';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  label: string;
}

export interface CanvasElement {
  id: string;
  pageId: string;
  type: ElementType;
  zIndex: number;
  transformMatrix: TransformMatrix;
  properties: Record<string, unknown>;
  isLocked: boolean;
  opacity: number;
  updatedAt: string;
}

export interface Page {
  id: string;
  bookId: string;
  pageNumber: number;
  backgroundColor: string;
  backgroundPattern: string | null;
  elements: CanvasElement[];
}

export interface BookPermissions {
  canView: boolean;
  canEdit: boolean;
  canPublish: boolean;
  isManager: boolean;
}

export interface Book {
  id: string;
  title: string;
  /** null cuando el libro es personal y no pertenece a ninguna biblioteca. */
  libraryId: string | null;
  portfolioId: string | null;
  creatorId: string | null;
  layoutFormat: LayoutFormat;
  isTemplate: boolean;
  isPublished: boolean;
  publishingSettings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  pageCount?: number;
  /** Primera pagina, para pintar la portada en las listas sin pedir el detalle. */
  cover?: CoverPage | null;
  shareVisibility?: ShareVisibility;
  shareToken?: string | null;
  collaborative?: boolean;
  /** Nombre de quien lo creo; llega al listar, para agrupar por autor. */
  creatorName?: string | null;
  /** Curso del autor, tomado de su clase del sistema academico. */
  creatorCourse?: string | null;
  /** Material del que salio, si llego por una entrega del docente. */
  originBookId?: string | null;
}

export type ShareVisibility = 'private' | 'library' | 'public';

export interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  externalSource: string | null;
  hasPassword: boolean;
  libraryCount: number;
  bookCount: number;
  createdAt: string;
}

export interface UserPage {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserStats {
  total: number;
  teachers: number;
  students: number;
  admins: number;
  inactive: number;
  fromPhidias: number;
}

export interface PhidiasSection {
  id: number;
  name: string;
  course: string;
  level: string;
  studentCount: number;
  withoutEmail: number;
}

export interface PhidiasImportResult {
  libraryId: string;
  libraryName: string;
  codeInvite: string;
  created: number;
  reused: number;
  enrolled: number;
  skipped: number;
}

export type PlanId = 'individual' | 'escuela' | 'institucional';

export interface BillingPlan {
  id: PlanId;
  name: string;
  amountCop: number;
  monthlyCop: number | null;
  summary: string;
  maxTeachers: number | null;
  maxStudents: number | null;
}

export interface BillingConfig {
  enabled: boolean;
  publicKey: string;
  currency: string;
  plans: BillingPlan[];
}

export interface Subscription {
  id: string;
  plan: PlanId;
  planName: string;
  status: 'pendiente' | 'activa' | 'vencida' | 'cancelada';
  organization: string | null;
  amountCop: number;
  autoRenew: boolean;
  maxTeachers: number | null;
  maxStudents: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  payerEmail: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: number;
  amountCop: number;
  status: string;
  statusDetail: string | null;
  paymentMethod: string | null;
  installments: number | null;
  payerEmail: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CheckoutResult {
  subscription: Subscription;
  payment: { status: string; statusDetail: string; invoiceNumber: number | null };
  authorizationUrl?: string;
}

export interface SignupCheckoutResult extends CheckoutResult {
  user: { id: string; email: string; fullName: string; role: UserRole };
  sessionToken: string;
}

export interface TrialSession {
  user: User;
  token: string;
  limits: { maxBooks: number; maxPagesPerBook: number };
}

export interface ShareState {
  visibility: ShareVisibility;
  token: string | null;
}

export interface CoverPage {
  backgroundColor: string;
  backgroundPattern: string | null;
  elements: CanvasElement[];
}

export interface BookDetail extends Book {
  pages: Page[];
  permissions: BookPermissions;
}

/** Libro abierto mediante enlace compartido: siempre de solo lectura. */
export interface SharedBook extends BookDetail {
  authorName: string | null;
}
