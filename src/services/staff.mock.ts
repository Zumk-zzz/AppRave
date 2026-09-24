import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  BanEntry,
  Shift,
  StaffAction,
  StaffMember,
  StaffService,
  User,
} from './types';

/**
 * Смена, журнал, сотрудники и стоп-лист без сервера.
 *
 * Всё на одном телефоне, поэтому «журнал команды» здесь — журнал этого
 * устройства. Для проверки сценария этого хватает; настоящая общая
 * история появляется только с сервером.
 */

const SHIFTS_KEY = 'apprave.shifts';
const ACTIONS_KEY = 'apprave.staff-actions';
const MEMBERS_KEY = 'apprave.staff-members';
const BANS_KEY = 'apprave.bans';

interface StoredShift extends Shift {
  userId: string;
}

async function read<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Журнал и смены — вспомогательные данные, их потеря не ломает работу
  }
}

async function openShiftOf(userId: string): Promise<StoredShift | undefined> {
  return (await read<StoredShift>(SHIFTS_KEY)).find((s) => s.userId === userId && !s.closedAt);
}

export const mockStaffService: StaffService = {
  async currentShift(user) {
    return (await openShiftOf(user.id)) ?? null;
  },

  async openShift(user) {
    const existing = await openShiftOf(user.id);
    if (existing) return existing;

    const shift: StoredShift = {
      id: `sh_${Date.now()}`,
      userId: user.id,
      openedAt: new Date().toISOString(),
    };

    await write(SHIFTS_KEY, [shift, ...(await read<StoredShift>(SHIFTS_KEY))]);
    await logMock({ kind: 'shift_opened', user, shiftId: shift.id });

    return shift;
  },

  async closeShift(user, note) {
    const open = await openShiftOf(user.id);
    if (!open) return;

    const shifts = (await read<StoredShift>(SHIFTS_KEY)).map((s) =>
      s.id === open.id ? { ...s, closedAt: new Date().toISOString(), note } : s,
    );

    await write(SHIFTS_KEY, shifts);
    await logMock({ kind: 'shift_closed', user, shiftId: open.id, summary: note });
  },

  async actions(limit = 100) {
    return (await read<StaffAction>(ACTIONS_KEY)).slice(0, limit);
  },

  async members() {
    return read<StaffMember>(MEMBERS_KEY);
  },

  async addMember({ contact, name, role }) {
    const members = await read<StaffMember>(MEMBERS_KEY);
    const existing = members.find((m) => m.contact === contact);

    await write(
      MEMBERS_KEY,
      existing
        ? members.map((m) => (m.contact === contact ? { ...m, name, role } : m))
        : [...members, { id: `st_${Date.now()}`, contact, name, role }],
    );
  },

  async removeMember(id) {
    const members = await read<StaffMember>(MEMBERS_KEY);
    await write(
      MEMBERS_KEY,
      members.filter((m) => m.id !== id),
    );
  },

  async bans(all = false) {
    const bans = await read<BanEntry>(BANS_KEY);
    return all ? bans : bans.filter((b) => !b.liftedAt);
  },

  async addBan({ contact, name, reason }) {
    const bans = await read<BanEntry>(BANS_KEY);
    const existing = bans.find((b) => b.contact === contact);

    // Повторный отказ по тому же контакту обновляет причину и снимает
    // отметку о снятии, а не плодит вторую запись
    await write(
      BANS_KEY,
      existing
        ? bans.map((b) =>
            b.contact === contact
              ? { ...b, reason, name: name ?? b.name, liftedAt: undefined }
              : b,
          )
        : [
            { id: `ban_${Date.now()}`, contact, name, reason, createdAt: new Date().toISOString() },
            ...bans,
          ],
    );
  },

  async liftBan(id) {
    const bans = await read<BanEntry>(BANS_KEY);
    await write(
      BANS_KEY,
      bans.map((b) => (b.id === id ? { ...b, liftedAt: new Date().toISOString() } : b)),
    );
  },
};

/**
 * Запись в местный журнал.
 *
 * На сервере то же самое делает он сам, в одной операции с действием.
 * Здесь записывать приходится вручную — но только изнутри сервиса:
 * журнал, в который дописывает экран, ничего не доказывает.
 */
export async function logMock(input: {
  kind: StaffAction['kind'];
  user: User;
  role?: StaffAction['actorRole'];
  orderId?: string;
  summary?: string;
  shiftId?: string;
}): Promise<void> {
  const action: StaffAction = {
    id: `ac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind: input.kind,
    actorId: input.user.id,
    actorName: input.user.name,
    actorRole: input.role ?? input.user.staffRole ?? 'guest',
    orderId: input.orderId,
    summary: input.summary,
    shiftId: input.shiftId ?? (await openShiftOf(input.user.id))?.id,
    createdAt: new Date().toISOString(),
  };

  // Журнал не должен расти бесконечно на устройстве: держим последние 500.
  const actions = [action, ...(await read<StaffAction>(ACTIONS_KEY))].slice(0, 500);
  await write(ACTIONS_KEY, actions);
}
