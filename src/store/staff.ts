import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { UserRole } from '@/src/lib/permissions';

const SHIFTS_KEY = 'apprave.shifts';
const ACTIONS_KEY = 'apprave.staff-actions';
const MEMBERS_KEY = 'apprave.staff-members';
const BANS_KEY = 'apprave.bans';

export type StaffActionKind =
  | 'entry_admitted'
  | 'entry_manual'
  | 'bar_issued'
  | 'shift_opened'
  | 'shift_closed'
  | 'role_granted'
  | 'role_revoked';

export interface StaffAction {
  id: string;
  kind: StaffActionKind;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  orderId?: string;
  /** Короткое описание для журнала: «Негрони × 2», «2 гостя» */
  summary?: string;
  shiftId?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string;
  note?: string;
}

export interface BanEntry {
  id: string;
  /** Контакт гостя: телефон или почта */
  contact: string;
  /** Имя на момент отказа — контакт может смениться, память должна остаться */
  name?: string;
  reason: string;
  createdAt: string;
  liftedAt?: string;
}

export interface StaffMember {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  addedAt: string;
}

interface StaffState {
  shifts: Shift[];
  actions: StaffAction[];
  members: StaffMember[];
  bans: BanEntry[];
  loaded: boolean;

  load: () => Promise<void>;

  openShift: (user: { id: string; name: string }) => Promise<Shift>;
  closeShift: (userId: string, note?: string) => Promise<void>;
  currentShift: (userId: string) => Shift | undefined;

  /** Записать действие в журнал. */
  log: (input: Omit<StaffAction, 'id' | 'createdAt' | 'shiftId'>) => void;

  addMember: (member: Omit<StaffMember, 'id' | 'addedAt'>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;

  /** Внести гостя в стоп-лист. */
  addBan: (input: { contact: string; name?: string; reason: string }) => Promise<void>;
  /** Снять отказ. Запись остаётся: история отказов не должна пропадать. */
  liftBan: (id: string) => Promise<void>;
  /** Действующий отказ по контакту, если он есть. */
  banFor: (contact?: string) => BanEntry | undefined;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  shifts: [],
  actions: [],
  members: [],
  bans: [],
  loaded: false,

  async load() {
    try {
      const [s, a, m, b] = await Promise.all([
        AsyncStorage.getItem(SHIFTS_KEY),
        AsyncStorage.getItem(ACTIONS_KEY),
        AsyncStorage.getItem(MEMBERS_KEY),
        AsyncStorage.getItem(BANS_KEY),
      ]);

      set({
        shifts: s ? JSON.parse(s) : [],
        actions: a ? JSON.parse(a) : [],
        members: m ? JSON.parse(m) : [],
        bans: b ? JSON.parse(b) : [],
        loaded: true,
      });
    } catch {
      set({ shifts: [], actions: [], members: [], bans: [], loaded: true });
    }
  },

  currentShift(userId) {
    return get().shifts.find((s) => s.userId === userId && !s.closedAt);
  },

  async openShift(user) {
    const existing = get().currentShift(user.id);
    if (existing) return existing;

    const shift: Shift = {
      id: `sh_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      openedAt: new Date().toISOString(),
    };

    const shifts = [shift, ...get().shifts];
    set({ shifts });
    await persist(SHIFTS_KEY, shifts);

    return shift;
  },

  async closeShift(userId, note) {
    const open = get().currentShift(userId);
    if (!open) return;

    const shifts = get().shifts.map((s) =>
      s.id === open.id ? { ...s, closedAt: new Date().toISOString(), note } : s,
    );

    set({ shifts });
    await persist(SHIFTS_KEY, shifts);
  },

  log(input) {
    const action: StaffAction = {
      ...input,
      id: `ac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      shiftId: get().currentShift(input.actorId)?.id,
      createdAt: new Date().toISOString(),
    };

    // Журнал не должен расти бесконечно на устройстве: держим последние 500.
    // Полная история живёт на сервере, здесь она нужна только за смену.
    const actions = [action, ...get().actions].slice(0, 500);
    set({ actions });
    void persist(ACTIONS_KEY, actions);
  },

  async addMember(member) {
    const existing = get().members.find((m) => m.phone === member.phone);

    const members = existing
      ? get().members.map((m) => (m.phone === member.phone ? { ...m, ...member } : m))
      : [
          ...get().members,
          { ...member, id: `st_${Date.now()}`, addedAt: new Date().toISOString() },
        ];

    set({ members });
    await persist(MEMBERS_KEY, members);
  },

  async removeMember(id) {
    const members = get().members.filter((m) => m.id !== id);
    set({ members });
    await persist(MEMBERS_KEY, members);
  },

  async addBan({ contact, name, reason }) {
    const existing = get().bans.find((b) => b.contact === contact);

    // Повторный отказ по тому же контакту обновляет причину и снимает
    // отметку о снятии, а не плодит вторую запись
    const bans = existing
      ? get().bans.map((b) =>
          b.contact === contact ? { ...b, reason, name: name ?? b.name, liftedAt: undefined } : b,
        )
      : [
          {
            id: `ban_${Date.now()}`,
            contact,
            name,
            reason,
            createdAt: new Date().toISOString(),
          },
          ...get().bans,
        ];

    set({ bans });
    await persist(BANS_KEY, bans);
  },

  async liftBan(id) {
    const bans = get().bans.map((b) =>
      b.id === id ? { ...b, liftedAt: new Date().toISOString() } : b,
    );
    set({ bans });
    await persist(BANS_KEY, bans);
  },

  banFor(contact) {
    if (!contact) return undefined;
    return get().bans.find((b) => b.contact === contact && !b.liftedAt);
  },
}));

/** Действия сотрудника за его текущую смену. */
export function selectShiftActions(state: StaffState, userId: string): StaffAction[] {
  const shift = state.shifts.find((s) => s.userId === userId && !s.closedAt);
  if (!shift) return [];

  return state.actions.filter((a) => a.shiftId === shift.id);
}

export type { StaffActionKind as ActionKind };

export const ACTION_LABEL: Record<StaffActionKind, string> = {
  entry_admitted: 'Пропуск по коду',
  entry_manual: 'Пропуск без кода',
  bar_issued: 'Выдача напитка',
  shift_opened: 'Смена открыта',
  shift_closed: 'Смена закрыта',
  role_granted: 'Выдана роль',
  role_revoked: 'Роль отозвана',
};

async function persist(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Журнал и смены — вспомогательные данные, их потеря не ломает работу
  }
}
