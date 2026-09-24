import type { BanEntry, Shift, StaffAction, StaffService, UserRole } from '@/src/services/types';
import { request } from './client';

/**
 * Смена, журнал, сотрудники и стоп-лист на сервере.
 *
 * Журнал только читается. Записывает его сервер — в той же операции,
 * что и само действие. Ручки «добавить запись» нет намеренно: журнал,
 * в который приложение может дописать что угодно, ничего не доказывает,
 * а нужен он ровно для того, чтобы разбираться со спорными ситуациями.
 */

interface ApiShift {
  id: string;
  openedAt: string;
  closedAt: string | null;
  note: string | null;
}

interface ApiAction {
  id: string;
  kind: StaffAction['kind'];
  actor: { name: string; role: UserRole };
  orderId: string | null;
  shiftId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface ApiMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  createdAt: string;
}

interface ApiBan {
  id: string;
  contact: string;
  name: string | null;
  reason: string;
  createdAt: string;
  liftedAt: string | null;
}

export const apiStaffService: StaffService = {
  async currentShift() {
    const shift = await request<ApiShift | null>('/staff/shift');
    return shift ? mapShift(shift) : null;
  },

  async openShift() {
    return mapShift(await request<ApiShift>('/staff/shift/open', { method: 'POST', body: {} }));
  },

  async closeShift(_user, note) {
    await request('/staff/shift/close', { method: 'POST', body: { note } });
  },

  async teamShifts(limit = 50) {
    const shifts = await request<(ApiShift & { staff: { name: string; role: UserRole }; actions: number })[]>(
      `/staff/shifts?limit=${limit}`,
    );

    return shifts.map((s) => ({ ...mapShift(s), staff: s.staff, actions: s.actions }));
  },

  async actions(limit = 100) {
    const actions = await request<ApiAction[]>(`/staff/actions?limit=${limit}`);
    return actions.map(mapAction);
  },

  async members() {
    const members = await request<ApiMember[]>('/staff/members');
    return members.map((m) => ({
      id: m.id,
      name: m.name,
      contact: m.phone ?? m.email ?? '',
      role: m.role,
    }));
  },

  async addMember({ contact, name, role }) {
    await request('/staff/members', { method: 'POST', body: { contact, name, role } });
  },

  async removeMember(id) {
    await request(`/staff/members/${id}`, { method: 'DELETE' });
  },

  async bans(all = false) {
    const bans = await request<ApiBan[]>(`/staff/bans${all ? '?all=true' : ''}`);
    return bans.map(mapBan);
  },

  async addBan({ contact, name, reason }) {
    // На сервере поле называется phone по историческим причинам, но
    // хранит любой контакт: отказ выносится человеку, а не номеру
    await request('/staff/bans', { method: 'POST', body: { phone: contact, name, reason } });
  },

  async liftBan(id) {
    await request(`/staff/bans/${id}`, { method: 'DELETE' });
  },
};

function mapShift(s: ApiShift): Shift {
  return {
    id: s.id,
    openedAt: s.openedAt,
    closedAt: s.closedAt ?? undefined,
    note: s.note ?? undefined,
  };
}

function mapBan(b: ApiBan): BanEntry {
  return {
    id: b.id,
    contact: b.contact,
    name: b.name ?? undefined,
    reason: b.reason,
    createdAt: b.createdAt,
    liftedAt: b.liftedAt ?? undefined,
  };
}

function mapAction(a: ApiAction): StaffAction {
  return {
    id: a.id,
    kind: a.kind,
    // Сервер не отдаёт идентификатор исполнителя: журнал показывается
    // тому, кто и так видит либо только свои записи, либо все
    actorId: '',
    actorName: a.actor.name,
    actorRole: a.actor.role,
    orderId: a.orderId ?? undefined,
    shiftId: a.shiftId ?? undefined,
    summary: summarize(a),
    createdAt: a.createdAt,
  };
}

/**
 * Подробности — в строку для журнала.
 *
 * Сервер хранит их как есть, чтобы не терять ничего для разбирательства.
 * Читать их сотруднику нужно одной строкой: «Негрони × 2» понятно
 * с первого взгляда, JSON — нет.
 */
function summarize(a: ApiAction): string | undefined {
  const d = a.details;
  if (!d) return undefined;

  if (a.kind === 'bar_issued') return `${d.item} × ${d.qty}`;
  if (a.kind === 'entry_admitted' || a.kind === 'entry_manual') {
    return `${d.number}: ${d.guests} гостей`;
  }
  if (a.kind === 'stock_adjusted') {
    const delta = Number(d.delta ?? 0);
    return `${d.item}: ${delta > 0 ? '+' : ''}${delta}`;
  }
  if (a.kind === 'role_granted' || a.kind === 'role_revoked') {
    return String(d.contact ?? '');
  }

  return undefined;
}
