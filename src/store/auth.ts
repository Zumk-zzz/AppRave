import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { authService, type User } from '@/src/services';

const SESSION_KEY = 'apprave.session';

export type AuthStatus = 'loading' | 'guest' | 'authed';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Прочитать сессию с устройства. Вызывается один раз при старте. */
  restore: () => Promise<void>;
  signIn: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Обновить пользователя локально — например, после начисления баллов. */
  patchUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        set({ user: JSON.parse(raw) as User, status: 'authed' });
        return;
      }
    } catch {
      // Повреждённая или недоступная сессия не должна блокировать вход —
      // просто показываем экран авторизации.
    }
    set({ user: null, status: 'guest' });
  },

  async signIn(phone, code) {
    // Ошибку намеренно не гасим: экран показывает её пользователю.
    const user = await authService.verifyCode(phone, code);
    await persist(user);
    set({ user, status: 'authed' });
  },

  async signOut() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // Даже если стереть не удалось, из состояния пользователя убираем.
    }
    set({ user: null, status: 'guest' });
  },

  patchUser(patch) {
    const current = get().user;
    if (!current) return;

    const next = { ...current, ...patch };
    set({ user: next });
    void persist(next);
  },
}));

async function persist(user: User) {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(user));
  } catch {
    // Сессия не сохранилась — пользователь просто войдёт заново
    // при следующем запуске. Ронять приложение из-за этого нельзя.
  }
}
