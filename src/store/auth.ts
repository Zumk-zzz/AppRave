import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { can, effectiveRole, type Permission, type UserRole } from '@/src/lib/permissions';
import { authService, type User } from '@/src/services';

const SESSION_KEY = 'apprave.session';
const WORK_MODE_KEY = 'apprave.work-mode';

export type AuthStatus = 'loading' | 'guest' | 'authed';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /**
   * Рабочий режим: сотрудник на смене.
   *
   * Выключен — человек ведёт себя как обычный гость и может покупать.
   * Именно это позволяет персоналу приходить в клуб отдыхать, не заводя
   * второй аккаунт.
   */
  atWork: boolean;
  setAtWork: (next: boolean) => Promise<void>;
  /** Прочитать сессию с устройства. Вызывается один раз при старте. */
  restore: () => Promise<void>;
  signIn: (contact: string, code: string) => Promise<void>;
  /** Привязать второй способ входа к текущему аккаунту. */
  linkContact: (contact: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Обновить пользователя локально — например, после начисления баллов. */
  patchUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  atWork: false,

  async setAtWork(next) {
    set({ atWork: next });
    try {
      await SecureStore.setItemAsync(WORK_MODE_KEY, next ? '1' : '0');
    } catch {
      // Режим не сохранился — после перезапуска сотрудник включит заново
    }
  },

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const saved = migrateUser(JSON.parse(raw) as User & { role?: string });
        const mode = await SecureStore.getItemAsync(WORK_MODE_KEY).catch(() => null);

        set({
          user: saved,
          // Режим имеет смысл только у сотрудника: у гостя он всегда выключен
          atWork: !!saved.staffRole && mode === '1',
          status: 'authed',
        });
        return;
      }
    } catch {
      // Повреждённая или недоступная сессия не должна блокировать вход —
      // просто показываем экран авторизации.
    }
    set({ user: null, atWork: false, status: 'guest' });
  },

  async signIn(contact, code) {
    // Ошибку намеренно не гасим: экран показывает её пользователю.
    const user = await authService.verifyCode(contact, code);
    await persist(user);
    // Вход всегда начинается в гостевом режиме: сотрудник включает
    // рабочий сам, когда выходит на смену.
    set({ user, atWork: false, status: 'authed' });
  },

  async linkContact(contact, code) {
    const current = get().user;
    if (!current) return;

    // Ошибку не гасим: экран показывает её пользователю
    const updated = await authService.linkContact(current, contact, code);
    await persist(updated);
    set({ user: updated });
  },

  async signOut() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.deleteItemAsync(WORK_MODE_KEY);
    } catch {
      // Даже если стереть не удалось, из состояния пользователя убираем.
    }
    set({ user: null, atWork: false, status: 'guest' });
  },

  patchUser(patch) {
    const current = get().user;
    if (!current) return;

    const next = { ...current, ...patch };
    set({ user: next });
    void persist(next);
  },
}));

/**
 * Сессии, записанные до разделения должности и действующей роли,
 * хранят одно поле role. Переносим его в staffRole, иначе сотрудник
 * после обновления окажется обычным гостем и потеряет доступ.
 */
function migrateUser(saved: User & { role?: string }): User {
  if (saved.staffRole || !saved.role || saved.role === 'guest') {
    const { role: _legacy, ...rest } = saved;
    return rest as User;
  }

  const { role, ...rest } = saved;
  return { ...rest, staffRole: role as User['staffRole'] };
}

async function persist(user: User) {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(user));
  } catch {
    // Сессия не сохранилась — пользователь просто войдёт заново
    // при следующем запуске. Ронять приложение из-за этого нельзя.
  }
}

/**
 * Роль, в которой человек действует прямо сейчас.
 * Должность учитывается только в рабочем режиме.
 */
export function useRole(): UserRole {
  return useAuthStore((s) => effectiveRole(s.user?.staffRole, s.atWork));
}

/** Есть ли у человека должность — независимо от того, на смене он или нет. */
export function useStaffRole() {
  return useAuthStore((s) => s.user?.staffRole);
}

export function useAtWork(): boolean {
  return useAuthStore((s) => s.atWork);
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
  return useAuthStore((s) => can(effectiveRole(s.user?.staffRole, s.atWork), permission));
}
