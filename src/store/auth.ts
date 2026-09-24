import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { canNow, effectiveRole, type Permission, type UserRole } from '@/src/lib/permissions';
import { authService, setActor, setToken, type User } from '@/src/services';
import { useOrdersStore } from './orders';
import { useStaffStore } from './staff';

const SESSION_KEY = 'apprave.session';

export type AuthStatus = 'loading' | 'guest' | 'authed';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Прочитать сессию с устройства. Вызывается один раз при старте. */
  restore: () => Promise<void>;
  signIn: (contact: string, code: string) => Promise<void>;
  /** Привязать второй способ входа к текущему аккаунту. */
  linkContact: (contact: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Обновить пользователя локально — например, после начисления баллов. */
  patchUser: (patch: Partial<User>) => void;
  /** Перечитать баллы и уровень: их меняет не только покупка. */
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const saved = migrateUser(JSON.parse(raw) as User & { role?: string });
        setActor(saved);
        set({ user: saved, status: 'authed' });
        return;
      }
    } catch {
      // Повреждённая или недоступная сессия не должна блокировать вход —
      // просто показываем экран авторизации.
    }
    setActor(null);
    set({ user: null, status: 'guest' });
  },

  async signIn(contact, code) {
    // Ошибку намеренно не гасим: экран показывает её пользователю.
    const user = await authService.verifyCode(contact, code);
    await persist(user);
    // Автономные сервисы узнают действующего сотрудника отсюда: на
    // сервере его роль приходит в токене, без сервера — взять неоткуда
    setActor(user);
    set({ user, status: 'authed' });
  },

  async linkContact(contact, code) {
    const current = get().user;
    if (!current) return;

    // Ошибку не гасим: экран показывает её пользователю
    const updated = await authService.linkContact(current, contact, code);
    await persist(updated);
    setActor(updated);
    set({ user: updated });
  },

  async signOut() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      // Токен обязательно: иначе следующий человек на этом телефоне
      // продолжит работать под чужим аккаунтом
      await setToken(null);
    } catch {
      // Даже если стереть не удалось, из состояния пользователя убираем.
    }

    setActor(null);
    useOrdersStore.getState().clear();
    useStaffStore.getState().clear();
    set({ user: null, status: 'guest' });
  },

  /**
   * Перечитать профиль.
   *
   * Баллы меняет не только покупка: отмена забирает их обратно, возврат
   * за отменённую вечеринку — тоже, и происходит это на сервере. Без
   * перечитывания в приложении остаётся вчерашняя цифра, и человек видит
   * баллы за заказ, который сам же и отменил.
   */
  async refresh() {
    const current = get().user;
    if (!current) return;

    try {
      const fresh = await authService.refresh(current);
      setActor(fresh);
      await persist(fresh);
      set({ user: fresh });
    } catch {
      // Нет связи — оставляем что было: показать старые баллы лучше,
      // чем обнулить их из-за пропавшей сети
    }
  },

  patchUser(patch) {
    const current = get().user;
    if (!current) return;

    const next = { ...current, ...patch };
    setActor(next);
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

/** Роль для показа: должность либо «гость». */
export function useRole(): UserRole {
  return useAuthStore((s) => effectiveRole(s.user?.staffRole));
}

/** Есть ли у человека должность — независимо от того, на смене он или нет. */
export function useStaffRole() {
  return useAuthStore((s) => s.user?.staffRole);
}

/**
 * На смене ли человек прямо сейчас.
 *
 * Смена — и есть «я работаю»: отдельного переключателя в приложении нет.
 * Два признака одного и того же неминуемо разошлись бы, и стало бы
 * непонятно, кто на самом деле стоит на входе.
 */
export function useOnShift(): boolean {
  return useStaffStore((s) => !!s.shift);
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
  const staffRole = useAuthStore((s) => s.user?.staffRole);
  const onShift = useStaffStore((s) => !!s.shift);

  return canNow(staffRole, onShift, permission);
}
