import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { can, isStaff, type Permission, type UserRole } from '@/src/lib/permissions';
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
        const saved = JSON.parse(raw) as User;
        // Сессии, записанные до появления ролей, поля role не содержат.
        // Без подстановки такой пользователь оказался бы с undefined
        // вместо роли, и проверки доступа вели бы себя непредсказуемо.
        set({ user: { ...saved, role: saved.role ?? 'guest' }, status: 'authed' });
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

/** Роль текущего пользователя. Без сессии — гость. */
export function useRole(): UserRole {
  return useAuthStore((s) => s.user?.role ?? 'guest');
}

/**
 * Проверка права у текущего пользователя.
 *
 * Экраны спрашивают «можно ли мне это», а не «кто я». Когда набор прав
 * у роли изменится, ни один экран трогать не придётся.
 *
 * Клиент этим лишь прячет кнопки. Настоящий запрет живёт на сервере:
 * спрятанная кнопка защищает от случайного нажатия, но не от подделанного
 * запроса.
 */
export function useCan(permission: Permission): boolean {
  return useAuthStore((s) => can(s.user?.role ?? 'guest', permission));
}

/** Сотрудник — любой, кто не просто гость. */
export function useIsStaff(): boolean {
  return useAuthStore((s) => isStaff(s.user?.role ?? 'guest'));
}
