import AsyncStorage from '@react-native-async-storage/async-storage';

import { mockCatalog } from './catalog.mock';
import { currentActor } from './session';
import type {
  BanEntry,
  Shift,
  StaffAction,
  StaffMember,
  StaffService,
  User,
  ShiftReport,
  UserRole,
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
  staffName?: string;
  staffRole?: UserRole;
  report?: ShiftReport;
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
  async myShifts() { return (await read<StoredShift>(SHIFTS_KEY)).filter((s)=>s.userId===currentActor()?.id).slice(0,50); },
  async shiftReport(id) {
    const shift=(await read<StoredShift>(SHIFTS_KEY)).find((s)=>s.id===id),actor=currentActor();
    if(!actor?.staffRole||!shift||(shift.userId!==actor.id&&!['manager','admin'].includes(actor.staffRole)))throw new Error('Смена не найдена');
    return shift.report??buildReport(shift);
  },
  async currentShift(user) {
    return (await openShiftOf(user.id)) ?? null;
  },

  async openShift(user) {
    const existing = await openShiftOf(user.id);
    if (existing) return existing;

    const shift: StoredShift = {
      id: `sh_${Date.now()}`,
      userId: user.id,
      staffName: user.name,
      staffRole: user.staffRole,
      openedAt: new Date().toISOString(),
    };

    await write(SHIFTS_KEY, [shift, ...(await read<StoredShift>(SHIFTS_KEY))]);
    await logMock({ kind: 'shift_opened', user, shiftId: shift.id });

    return shift;
  },

  async closeShift(user, note, counts) {
    const open=await openShiftOf(user.id);if(!open)throw new Error('Открытой смены нет');
    const report=await buildReport(open);if(report.pendingPreparations>0)throw new Error('Передайте незавершённое приготовление');
    for(const count of counts??[]){const row=report.stock.find((r)=>r.barItemId===count.barItemId);if(!row||row.available!==count.available||row.reserved!==count.reserved)throw new Error('Обновите остатки');if(count.actual!==row.expected&&count.reason.trim().length<3)throw new Error('Укажите причину расхождения');row.actual=count.actual;row.difference=count.actual-row.expected;row.reason=count.reason;}
    report.closedAt=new Date().toISOString();report.saved=true;
    await write(SHIFTS_KEY,(await read<StoredShift>(SHIFTS_KEY)).map((s)=>s.id===open.id?{...s,closedAt:report.closedAt!,note,report}:s));
    await logMock({kind:'shift_closed',user,shiftId:open.id,summary:note});
  },

  async teamShifts(limit = 50) {
    // На телефоне команда — это один человек: чужие смены взяться неоткуда
    const actor = currentActor();
    const shifts = await read<StoredShift>(SHIFTS_KEY);
    const actions = await read<StaffAction>(ACTIONS_KEY);

    return shifts.slice(0, limit).map((shift) => ({
      ...shift,
      staff: { name: shift.staffName ?? actor?.name ?? 'Сотрудник', role: shift.staffRole ?? actor?.staffRole ?? 'guest' },
      actions: actions.filter((a) => a.shiftId === shift.id).length,
    }));
  },

  async actions(limit = 100) {
    const actor = currentActor();
    const seesAll = actor?.staffRole === 'admin' || actor?.staffRole === 'manager';
    return (await read<StaffAction>(ACTIONS_KEY))
      .filter((a) => seesAll || a.actorId === actor?.id).slice(0, limit);
  },

  async history(cursor, orderId) {
    const actor = currentActor();
    if (!actor?.staffRole) throw new Error('История доступна только сотрудникам');
    const all = actor.staffRole === 'admin' || actor.staffRole === 'manager';
    const rows = (await read<StaffAction>(ACTIONS_KEY)).filter((a) =>
      (all || a.actorId === actor.id) && (!orderId || a.orderId === orderId) &&
      (actor.staffRole === 'bartender' ? ['bar_issued', 'bar_started', 'bar_ready', 'bar_transferred'].includes(a.kind) :
        actor.staffRole === 'doorman' ? ['entry_admitted', 'entry_manual'].includes(a.kind) :
          ['bar_issued', 'bar_started', 'bar_ready', 'bar_transferred', 'table_updated', 'entry_admitted', 'entry_manual'].includes(a.kind)),
    );
    const start = cursor ? rows.findIndex((a) => a.id === cursor) + 1 : 0;
    const items = rows.slice(start, start + 50);
    return { items, nextCursor: start + 50 < rows.length ? items[49].id : null };
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
    orderNumber: input.orderId,
    summary: input.summary,
    shiftId: input.shiftId ?? (await openShiftOf(input.user.id))?.id,
    createdAt: new Date().toISOString(),
  };

  // Журнал не должен расти бесконечно на устройстве: держим последние 500.
  const actions = [action, ...(await read<StaffAction>(ACTIONS_KEY))].slice(0, 500);
  await write(ACTIONS_KEY, actions);
}

export async function mockActiveBarWorkers() {
  return (await read<StoredShift>(SHIFTS_KEY)).filter((s)=>!s.closedAt&&['bartender','manager','admin'].includes(s.staffRole??'')).map((s)=>({id:s.userId,name:s.staffName??'Сотрудник',shiftId:s.id}));
}
async function buildReport(shift:StoredShift):Promise<ShiftReport>{
  const {mockOperationalOrders}=await import('./orders.mock');const orders=await mockOperationalOrders();
  const actions=(await read<StaffAction>(ACTIONS_KEY)).filter((a)=>a.shiftId===shift.id);
  const qty=(k:string)=>actions.filter((a)=>a.kind===k).reduce((n,a)=>n+Number(a.summary?.match(/×\s*(\d+)/)?.[1]??0),0);
  const stock=await mockCatalog.stock(),menu=await mockCatalog.barMenu();
  const until=shift.closedAt??new Date().toISOString();
  const sold=orders.filter((o)=>['paid','used'].includes(o.status)&&o.createdAt>=shift.openedAt&&o.createdAt<=until);
  const items=new Map<string,{title:string;prepared:number;ready:number;issued:number}>();
  for(const a of actions){if(!['bar_started','bar_ready','bar_issued'].includes(a.kind))continue;const title=a.summary?.split(' × ')[0]??'Напиток';const row=items.get(title)??{title,prepared:0,ready:0,issued:0};row[a.kind==='bar_started'?'prepared':a.kind==='bar_ready'?'ready':'issued']+=Number(a.summary?.match(/×\s*(\d+)/)?.[1]??0);items.set(title,row);}
  const manager=['manager','admin'].includes(shift.staffRole??'');
  return {saved:false,shiftId:shift.id,staffName:shift.staffName??currentActor()?.name??'Сотрудник',openedAt:shift.openedAt,closedAt:shift.closedAt??null,generatedAt:new Date().toISOString(),admitted:actions.filter((a)=>['entry_admitted','entry_manual'].includes(a.kind)).reduce((n,a)=>n+Number(a.summary?.match(/^(\d+)/)?.[1]??0),0),started:qty('bar_started'),ready:qty('bar_ready'),issued:qty('bar_issued'),pendingPreparations:orders.flatMap((o)=>o.status==='paid'&&(!o.eventDate||new Date(o.eventDate).getTime()+8*3600000>Date.now())?o.lines:[]).filter((l)=>l.preparedById===shift.userId&&(l.preparingQty??0)>0).length,soldOrders:manager?sold.length:null,salesKopecks:manager?sold.reduce((n,o)=>n+o.total*100,0):null,items:[...items.values()],stock:shift.closedAt||shift.staffRole==='doorman'?[]:stock.map((r)=>{const reserved=orders.filter((o)=>['paid','used','pending'].includes(o.status)).flatMap((o)=>o.lines).filter((l)=>l.kind==='bar'&&l.refId===r.barItemId).reduce((n,l)=>n+l.qty-l.redeemed-(l.cancelled??0),0);return {barItemId:r.barItemId,title:menu.find((m)=>m.id===r.barItemId)?.name??'Напиток',unit:r.unit,available:r.qty,reserved,expected:r.qty+reserved,actual:null,difference:null,reason:''};})};
}
