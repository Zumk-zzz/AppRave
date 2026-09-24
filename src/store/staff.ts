import { create } from 'zustand';

import {
  staffService,
  type BanEntry,
  type Shift,
  type StaffAction,
  type StaffActionKind,
  type StaffMember,
  type TeamShift,
  type User,
  type UserRole,
} from '@/src/services';

export type { BanEntry, Shift, StaffAction, StaffActionKind, StaffMember, TeamShift };

/**
 * Смена, журнал, сотрудники и стоп-лист на экране.
 *
 * Кэш над сервисом, как заказы и каталог. Журнал здесь только читается:
 * записывает его тот, кто выполняет действие, — на сервере сам сервер,
 * в одной операции с выдачей. Журнал, в который дописывает экран,
 * ничего не доказывает, а нужен он именно для разбирательств.
 */
interface StaffState {
  /** Моя открытая смена */
  shift: Shift | null;
  /** Смены команды: их видит тот, кто за сменами следит, а не стоит на них */
  team: TeamShift[];
  actions: StaffAction[];
  members: StaffMember[];
  bans: BanEntry[];
  loaded: boolean;

  /** Перечитать всё, что доступно этому человеку. */
  load: (user: User | null) => Promise<void>;

  openShift: (user: User) => Promise<void>;
  closeShift: (user: User, note?: string) => Promise<void>;

  addMember: (input: { contact: string; name: string; role: UserRole }) => Promise<void>;
  removeMember: (id: string) => Promise<void>;

  /** Внести гостя в стоп-лист. */
  addBan: (input: { contact: string; name?: string; reason: string }) => Promise<void>;
  /** Снять отказ. Запись остаётся: история отказов не должна пропадать. */
  liftBan: (id: string) => Promise<void>;
  /** Действующий отказ по контакту, если он есть. */
  banFor: (contact?: string) => BanEntry | undefined;

  clear: () => void;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  shift: null,
  team: [],
  actions: [],
  members: [],
  bans: [],
  loaded: false,

  async load(user) {
    if (!user) {
      set({ shift: null, team: [], actions: [], members: [], bans: [], loaded: true });
      return;
    }

    // Части читаются независимо: у бармена нет доступа к списку
    // сотрудников, но смена и журнал ему нужны
    const [shift, team, actions, members, bans] = await Promise.all([
      staffService.currentShift(user).catch(() => null),
      staffService.teamShifts().catch(() => []),
      staffService.actions().catch(() => []),
      staffService.members().catch(() => []),
      staffService.bans(true).catch(() => []),
    ]);

    set({ shift, team, actions, members, bans, loaded: true });
  },

  async openShift(user) {
    set({ shift: await staffService.openShift(user) });
    await get().load(user);
  },

  async closeShift(user, note) {
    await staffService.closeShift(user, note);
    await get().load(user);
  },

  async addMember(input) {
    await staffService.addMember(input);
    set({ members: await staffService.members() });
  },

  async removeMember(id) {
    await staffService.removeMember(id);
    set({ members: await staffService.members() });
  },

  async addBan(input) {
    await staffService.addBan(input);
    set({ bans: await staffService.bans(true) });
  },

  async liftBan(id) {
    await staffService.liftBan(id);
    set({ bans: await staffService.bans(true) });
  },

  banFor(contact) {
    if (!contact) return undefined;
    return get().bans.find((b) => b.contact === contact && !b.liftedAt);
  },

  clear() {
    set({ shift: null, team: [], actions: [], members: [], bans: [], loaded: false });
  },
}));

export const ACTION_LABEL: Record<StaffActionKind, string> = {
  entry_admitted: 'Пропуск по коду',
  entry_manual: 'Пропуск без кода',
  bar_issued: 'Выдача напитка',
  shift_opened: 'Смена открыта',
  shift_closed: 'Смена закрыта',
  role_granted: 'Выдана роль',
  role_revoked: 'Роль отозвана',
  stock_adjusted: 'Правка склада',
};
