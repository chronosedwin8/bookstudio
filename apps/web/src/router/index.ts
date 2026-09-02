import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  // La portada es publica: es la puerta comercial del producto.
  { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue') },
  {
    path: '/clientes/facturacion',
    name: 'billing',
    component: () => import('@/views/BillingView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Contratacion directa: plan, cuenta y pago en la misma pantalla.
    path: '/contratar',
    name: 'checkout',
    component: () => import('@/views/CheckoutView.vue'),
  },
  // El area de cliente es la facturacion; ya no hay portal de presupuestos.
  { path: '/clientes', redirect: { name: 'billing' } },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guestOnly: true } },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/login/sso',
    name: 'login-sso',
    component: () => import('@/views/SsoCallbackView.vue'),
  },
  {
    path: '/login/qr',
    name: 'login-qr',
    component: () => import('@/views/QrLoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/usuarios',
    name: 'admin-users',
    component: () => import('@/views/AdminUsersView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/libraries/:id',
    name: 'library',
    component: () => import('@/views/LibraryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/quizzes/:id',
    name: 'quiz',
    component: () => import('@/views/QuizView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/books/:id/edit',
    name: 'book-editor',
    component: () => import('@/views/BookEditorView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/books/:id/imprimir',
    name: 'book-print',
    component: () => import('@/views/BookPrintView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/books/:id/read',
    name: 'book-reader',
    component: () => import('@/views/BookReaderView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Inscripcion por enlace; si no hay sesion, la vista redirige a iniciarla.
    path: '/unirse/:code',
    name: 'join-library',
    component: () => import('@/views/JoinLibraryView.vue'),
  },
  {
    // Enlace compartido: accesible sin sesion, la API decide que exige cada libro.
    path: '/leer/:token',
    name: 'book-shared',
    component: () => import('@/views/BookReaderView.vue'),
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.restore();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  // El backend vuelve a comprobarlo; esto solo evita mostrar una pantalla vacia.
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return { name: 'dashboard' };
  }
  return true;
});
