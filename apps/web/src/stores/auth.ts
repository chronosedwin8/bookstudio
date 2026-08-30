import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/services/api';
import { TOKEN_STORAGE_KEY } from '@/services/http';
import type { User } from '@/types/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  const initialized = ref(false);

  const isAuthenticated = computed(() => Boolean(user.value));
  const isTeacher = computed(() => user.value?.role === 'teacher' || user.value?.role === 'admin');

  function setSession(payload: { user: User; token: string }): void {
    user.value = payload.user;
    token.value = payload.token;
    localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
  }

  function logout(): void {
    user.value = null;
    token.value = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  async function restore(): Promise<void> {
    if (initialized.value) return;
    initialized.value = true;
    if (!token.value) return;
    try {
      user.value = await authApi.me();
    } catch {
      logout();
    }
  }

  async function login(email: string, password: string): Promise<void> {
    setSession(await authApi.login({ email, password }));
  }

  async function register(payload: {
    email: string;
    password: string;
    fullName: string;
    role: 'teacher' | 'student';
  }): Promise<void> {
    setSession(await authApi.register(payload));
  }

  async function loginWithQr(qrToken: string): Promise<void> {
    setSession(await authApi.loginWithQr(qrToken));
  }

  return { user, token, initialized, isAuthenticated, isTeacher, login, register, loginWithQr, logout, restore };
});
