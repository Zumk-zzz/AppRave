import AsyncStorage from '@react-native-async-storage/async-storage';

import { pointsForPurchase } from '@/src/lib/loyalty';
import { deriveStatus, redeemableOf } from '@/src/lib/order-status';
import { canNow, type Permission } from '@/src/lib/permissions';
import { entryAvailable } from '@/src/lib/fulfillment';
import { mockCatalog } from './catalog.mock';
import { currentActor } from './session';
import { logMock, mockStaffService } from './staff.mock';
import type { CheckoutItem, EntryInvitation, Order, OrderLine, OrdersService, OperationalTable } from './types';

/**
 * Заказы без сервера.
 *
 * Живут на самом телефоне: приложение должно открываться и работать,
 * когда бэкенда нет вовсе. Возврат товара при отмене делается тут же,
 * руками — на сервере то же самое делает одна транзакция.
 *
 * Все заказы здесь «мои»: списка чужих покупок на устройстве взяться
 * неоткуда, поэтому сотрудник в этом режиме видит только то, что куплено
 * на этом же телефоне. Для демонстрации сценария этого хватает.
 */

// Заказы не секретны, поэтому AsyncStorage, а не secure-store:
// у последнего практический лимит около 2 КБ, а история растёт.
const ORDERS_KEY = 'apprave.orders';
const WORK_KEY = 'apprave.fulfillment';
type Work = { invites: EntryInvitation[]; owners: Record<string, string>; visits: string[]; tables: Record<string,OperationalTable>; depositRequests: Record<string,string>; depositSources: Record<string,string> };
async function readWork(): Promise<Work> {
  const raw = await AsyncStorage.getItem(WORK_KEY);
  const work = raw ? JSON.parse(raw) : { invites: [], owners: {}, visits: [] };
  work.tables ??= {}; work.depositRequests ??= {}; work.depositSources ??= {}; return work;
}
async function writeWork(work: Work) { await AsyncStorage.setItem(WORK_KEY, JSON.stringify(work)); }
async function own(id: string) {
  const work = await readWork();
  if (work.owners[id] && work.owners[id] !== currentActor()?.id) throw new Error('Заказ не найден');
  return find(id);
}
async function invitationOrder(token: string) {
  const work = await readWork();
  const invite = work.invites.find((i) => i.token === token);
  if (!invite) throw new Error('Приглашение не найдено');
  const order = await find(invite.orderId);
  return { work, invite, order };
}

let cache: Order[] | null = null;
let depositTail: Promise<unknown> = Promise.resolve();
async function serializeDeposit<T>(action: () => Promise<T>): Promise<T> {
  const next=depositTail.then(action); depositTail=next.catch(()=>undefined); return next;
}

async function all(): Promise<Order[]> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Order[]) : [];
    cache = parsed.map(migrate);
  } catch {
    // Повреждённая история не должна мешать покупать дальше.
    cache = [];
  }

  return cache;
}

async function save(next: Order[]): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  } catch {
    // Не сохранилось — заказ всё равно есть в памяти до перезапуска.
  }
}

/** Заменяет один заказ и возвращает его же — так же, как ответ сервера. */
async function replace(next: Order): Promise<Order> {
  const orders = await all();
  await save(orders.map((o) => (o.id === next.id ? next : o)));
  return next;
}

async function find(orderId: string): Promise<Order> {
  const order = (await all()).find((o) => o.id === orderId);
  if (!order) throw new Error('Заказ не найден');
  return order;
}

async function requireWork(permission?: Permission) {
  const actor = currentActor();
  const shift = actor ? await mockStaffService.currentShift(actor) : null;
  const may = (p: Permission) => canNow(actor?.staffRole, !!shift, p);
  if (permission ? !may(permission) : !may('scan:entry') && !may('scan:bar') && !may('orders:read')) {
    throw new Error('Действие недоступно: проверьте роль и откройте смену');
  }
}

function scoped(order: Order): Order {
  const role = currentActor()?.staffRole;
  if (role === 'admin' || role === 'manager') return order;
  const lines = order.lines.filter((line) => role === 'doorman' ? line.kind === 'ticket' || (line.kind === 'table' && !!line.entryIncluded) : line.kind === 'bar')
    .map((line) => line.kind === 'table' ? { ...line, kind: 'ticket' as const, price: 0, qty: line.entryIncluded ?? 0,
      redeemed: line.entryRedeemed ?? 0, cancelled: line.cancelled ? line.entryIncluded : 0, entryIncluded: 0, entryRedeemed: 0 } : line);
  return { ...order, lines, total: lines.reduce((n, l) => n + l.price * (l.qty - (l.cancelled ?? 0)), 0),
    pointsEarned: 0, guest: order.guest ? { name: order.guest.name, contact: role === 'bartender' ? undefined : order.guest.contact } : undefined };
}

function requirePaid(order: Order) {
  if (order.status !== 'paid' && order.status !== 'used') throw new Error('Заказ не оплачен или отменён');
}

export const mockOrdersService: OrdersService = {
  async barTeam() { const { mockActiveBarWorkers } = await import('./staff.mock'); return mockActiveBarWorkers(); },
  async transferBar(order,lineId,toUserId,reason) {
    await requireWork('scan:bar');
    const full=await find(order.id),actor=currentActor()!,line=full.lines.find((l)=>l.id===lineId);
    if (!line || !line.preparingQty || line.preparedById !== order.lines.find((l)=>l.id===lineId)?.preparedById) throw new Error('Позиция изменилась');
    if (line.preparedById !== actor.id && !['manager','admin'].includes(actor.staffRole??'')) throw new Error('Передать можно только свою позицию');
    const target=(await mockOrdersService.barTeam()).find((w)=>w.id===toUserId);
    if (!target || toUserId===line.preparedById || reason.trim().length<3) throw new Error('Проверьте получателя и причину');
    await replace({...full,lines:full.lines.map((l)=>l.id===lineId?{...l,preparedById:target.id,preparedByName:target.name}:l)});
    await log('bar_transferred',full.number,`${line.title} × ${line.preparingQty} · ${line.preparedByName} → ${target.name} · ${reason}`);
  },
  async floor(eventId) {
    await requireWork('orders:read'); const work=await readWork();
    const orders=await all(); return Object.values(work.tables).filter((t)=>orders.some((o)=>o.id===t.orderId&&o.eventId===eventId&&['paid','used'].includes(o.status)));
  },
  async updateTable(table,state,responsibleId) {
    await requireWork('orders:read'); const work=await readWork(),fresh=work.tables[table.orderId];
    const next:Record<string,string>={reserved:'arrived',arrived:'occupied',occupied:'released'};
    if (!fresh || fresh.serviceState!==table.serviceState || (state!==fresh.serviceState&&next[fresh.serviceState]!==state)) throw new Error('Обновите состояние столика');
    const worker=responsibleId===currentActor()?.id?currentActor(): (await mockOrdersService.barTeam()).find((w)=>w.id===responsibleId);
    if(responsibleId&&!worker)throw new Error('Сотрудник не найден');
    work.tables[table.orderId]={...fresh,serviceState:state,...(worker?{responsibleId:worker.id,responsibleName:worker.name}:{})}; await writeWork(work);
    await log('table_updated',table.orderNumber,`Стол: ${state} · ${worker?.name??''}`);
  },
  async tableBooking(id) { const order=await own(id),work=await readWork(); const table=work.tables[id]; return table?{...table,depositRemaining:['paid','used'].includes(order.status)?table.depositRemaining:0}:null; },
  async spendDeposit(id,barItemId,qty,requestId) {
    return serializeDeposit(async () => {
    const actor=currentActor();if(!actor||!canNow(actor.staffRole,!!(await mockStaffService.currentShift(actor)),'purchase'))throw new Error('Покупки недоступны на смене');
    const order=await own(id);requirePaid(order);
    const work=await readWork();
    if(work.depositRequests[requestId]) {const prior=work.depositRequests[requestId];if(work.owners[prior]!==actor.id||work.depositSources[requestId]!==id)throw new Error('Ключ уже использован');return find(prior);}
    const table=work.tables[id],item=(await mockCatalog.barMenu()).find((b)=>b.id===barItemId);
    if(!table||table.serviceState==='released'||!item?.available||!Number.isInteger(qty)||qty<1||qty>50)throw new Error('Проверьте стол и напиток');
    if(!work.visits.includes(`${currentActor()?.id}:${order.eventId}`))throw new Error('Сначала подтвердите вход');
    if(item.price*qty>table.depositRemaining)throw new Error('Недостаточно депозита');
    const stock=(await mockCatalog.stock()).find((r)=>r.barItemId===barItemId);if(!stock||stock.qty<qty)throw new Error('Напиток закончился');
    const number=makeOrderNumber(); const created:Order={id:number,number,createdAt:new Date().toISOString(),eventId:order.eventId,eventTitle:order.eventTitle,eventDate:order.eventDate,
      total:0,depositUsed:item.price*qty,pointsEarned:0,status:'paid',qrPayload:`APPRAVE|${number}|${currentActor()?.memberNo}|${order.eventId}`,
      lines:[{id:`${number}-0`,kind:'bar',refId:barItemId,title:item.name,price:item.price,qty,redeemed:0,barRequestedAt:new Date().toISOString()}]};
    await moveGoods(created,created.lines[0],-qty);await save([created,...await all()]);
    await replace({...order,depositCommitted:true});
    table.depositRemaining-=item.price*qty;work.owners[number]=currentActor()!.id;work.depositRequests[requestId]=number;work.depositSources[requestId]=id;await writeWork(work);return created;
    });
  },
  async timeline(number) {
    await requireWork('orders:read');const order=(await all()).find((o)=>o.number===number);if(!order)throw new Error('Заказ не найден');
    const actions=(await mockStaffService.actions(500)).filter((a)=>a.orderId===order.id);
    const invitations=(await readWork()).invites.filter((i)=>i.orderId===order.id).flatMap((i)=>[...(i.createdAt?[{id:`${i.id}-created`,kind:'invitation',title:`Приглашение: ${i.name}`,createdAt:i.createdAt}]:[]),...(i.admittedAt?[{id:`${i.id}-used`,kind:'invitation_used',title:`Друг прошёл: ${i.name}`,createdAt:i.admittedAt}]:[]),...(i.revokedAt?[{id:`${i.id}-revoked`,kind:'invitation_revoked',title:`Приглашение отозвано: ${i.name}`,createdAt:i.revokedAt}]:[])]);
    return {order,rows:[{id:'created',kind:'created',title:'Заказ создан',createdAt:order.createdAt},...invitations,...actions.map((a)=>({id:a.id,kind:a.kind,title:a.summary??a.kind,actorName:a.actorName,createdAt:a.createdAt}))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))};
  },
  byId: own,
  async requestBar(id) {
    const order = await own(id); requirePaid(order);
    const work = await readWork();
    if (!work.visits.includes(`${currentActor()?.id}:${order.eventId}`)) throw new Error('Сначала подтвердите вход у фейс-контроля');
    return replace({ ...order, lines: order.lines.map((l) => l.kind === 'bar' && redeemableOf(l) > 0 ? { ...l, barRequestedAt: l.barRequestedAt ?? new Date().toISOString() } : l) });
  },
  async prepareBar(order, lineId) {
    await requireWork('scan:bar');
    const fresh = await find(order.id); requirePaid(fresh);
    const line = fresh.lines.find((l) => l.id === lineId);
    if (!line || line.kind !== 'bar' || !line.barRequestedAt) throw new Error('Позиция не в очереди');
    const actor = currentActor()!;
    if (line.preparedById && line.preparedById !== actor.id) throw new Error('Позицию уже готовит другой бармен');
    if (line.preparedById) return scoped(fresh);
    const next = await replace({ ...fresh, lines: fresh.lines.map((l) => l.id === lineId ? { ...l, preparedById: actor.id, preparedByName: actor.name, preparingQty: redeemableOf(l), preparingStartedAt: new Date().toISOString() } : l) });
    await log('bar_started', fresh.number, `${line.title} × ${redeemableOf(line)}`);
    return scoped(next);
  },
  async readyBar(order, lineId, qty) {
    await requireWork('scan:bar');
    const fresh = await find(order.id); requirePaid(fresh);
    const line = fresh.lines.find((l) => l.id === lineId);
    if (line?.preparingQty !== order.lines.find((l) => l.id === lineId)?.preparingQty) throw new Error('Состояние изменилось — обновите очередь');
    if (!line || line.preparedById !== currentActor()?.id || !Number.isInteger(qty) || qty < 1 || qty > (line.preparingQty ?? 0)) throw new Error('Проверьте исполнителя и количество');
    const next = await replace({ ...fresh, lines: fresh.lines.map((l) => l.id === lineId ? { ...l, preparingQty: (l.preparingQty ?? 0) - qty, readyQty: (l.readyQty ?? 0) + qty, barReadyAt: new Date().toISOString() } : l) });
    await log('bar_ready', fresh.number, `${line.title} × ${qty}`);
    return scoped(next);
  },
  async invitations(id) { await own(id); return (await readWork()).invites.filter((i) => i.orderId === id); },
  async createInvitation(id, name, requestId) {
    const order = await own(id); requirePaid(order);
    const work = await readWork();
    const previous = work.invites.find((i) => i.id === requestId && i.orderId === id);
    if (previous) return previous;
    const line = order.lines.find((l) => entryAvailable(l) > 0);
    if (!line) throw new Error('Свободных проходов нет');
    const token = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const invite = { id: requestId, token, orderId: id, lineId: line.id, name, createdAt:new Date().toISOString() };
    await replace({ ...order, lines: order.lines.map((l) => l.id === line.id ? { ...l, entryReserved: (l.entryReserved ?? 0) + 1 } : l) });
    work.invites.push(invite); await writeWork(work); return invite;
  },
  async revokeInvitation(token) {
    const { work, invite, order } = await invitationOrder(token); await own(order.id);
    if (invite.admittedAt) throw new Error('Гость уже прошёл');
    if (invite.revokedAt) return;
    invite.revokedAt = new Date().toISOString();
    await replace({ ...order, lines: order.lines.map((l) => l.id === invite.lineId ? { ...l, entryReserved: Math.max(0, (l.entryReserved ?? 0) - 1) } : l) });
    await writeWork(work);
  },
  async invitation(token) {
    const { invite, order } = await invitationOrder(token);
    return { name: invite.name, eventTitle: order.eventTitle, eventDate: order.eventDate,
      status: invite.revokedAt || !['paid', 'used'].includes(order.status) ? 'revoked' : invite.admittedAt ? 'used' : invite.claimedById ? 'claimed' : 'available' };
  },
  async claimInvitation(token) {
    const { work, invite, order } = await invitationOrder(token); requirePaid(order);
    const actor = currentActor();
    if (!actor || invite.revokedAt || invite.admittedAt || (invite.claimedById && invite.claimedById !== actor.id)) throw new Error('Приглашение недоступно');
    invite.claimedById = actor.id; await writeWork(work);
    return { qrPayload: `APPRAVE-INV|${token}` };
  },
  async mine() {
    const work = await readWork();
    return (await all()).filter((order) => !work.owners[order.id] || work.owners[order.id] === currentActor()?.id);
  },

  async forStaff(eventId, queueOnly = false) {
    await requireWork();
    const orders = await all();
    return orders.filter((o) => (!eventId || o.eventId === eventId) && ['paid', 'used'].includes(o.status))
      .map(scoped).filter((o) => o.lines.length > 0 && (!queueOnly || o.lines.some((l) => l.kind === 'bar' && l.barRequestedAt && redeemableOf(l) > 0)));
  },

  async byNumber(number) {
    await requireWork();
    if (number.startsWith('invite:')) {
      await requireWork('scan:entry');
      const { invite, order } = await invitationOrder(number.slice(7)); requirePaid(order);
      if (invite.revokedAt || !invite.claimedById) throw new Error('Приглашение отозвано или ещё не принято');
      return { ...order, id: invite.id, number: `Приглашение: ${invite.name}`, invitationToken: invite.token, total: 0, pointsEarned: 0,
        lines: [{ id: invite.id, kind: 'ticket', refId: '', title: `Вход · ${invite.name}`, price: 0, qty: 1, redeemed: invite.admittedAt ? 1 : 0 }], qrPayload: `APPRAVE-INV|${invite.token}` };
    }
    const order = (await all()).find((o) => o.number === number);
    return order ? scoped(order) : null;
  },

  async checkout(items, events, user) {
    const tables = await mockCatalog.tables();
    // Один заказ на вечеринку: на входе сканируют один QR за одну ночь,
    // а не общий чек на несколько дат.
    const byEvent = new Map<string, CheckoutItem[]>();
    for (const item of items) {
      const key = item.eventId ?? 'no-event';
      byEvent.set(key, [...(byEvent.get(key) ?? []), item]);
    }

    const created: Order[] = [];

    for (const [eventId, lines] of byEvent) {
      const event = events.find((e) => e.id === eventId);
      const total = lines.reduce((sum, i) => sum + i.price * i.qty, 0);
      const number = makeOrderNumber();

      created.push({
        id: number,
        number,
        createdAt: new Date().toISOString(),
        eventId: event?.id,
        eventTitle: event?.title,
        eventDate: event?.date,
        lines: lines.map((line, index) => ({ ...toOrderLine(line, `${number}-${index}`), entryIncluded: line.kind === 'table' ? tables.find((t) => t.id === line.refId)?.includedEntries ?? 0 : 0 })),
        total,
        pointsEarned: pointsForPurchase(total, user.tier),
        status: 'paid',
        qrPayload: `APPRAVE|${number}|${user.memberNo}|${event?.id ?? '-'}`,
      });
    }

    await save([...created, ...(await all())]);
    const work = await readWork();
    for (const order of created) {
      work.owners[order.id] = user.id;
      const line=order.lines.find((l)=>l.kind==='table');
      if(line) work.tables[order.id]={id:`tb-${order.id}`,orderId:order.id,orderNumber:order.number,tableId:line.refId,label:line.title,guestName:user.name,guests:line.guests??[],serviceState:'reserved',depositInitial:line.price,depositRemaining:line.price};
    }
    await writeWork(work);

    // Склад и остаток билетов приводятся в соответствие сразу: иначе
    // инвентаризация показывала бы товар, который уже продан.
    for (const order of created) {
      for (const line of order.lines) {
        await moveGoods(order, line, -line.qty);
      }
    }

    return created;
  },

  async cancel(orderId) {
    const order = await own(orderId);
    if (order.depositCommitted || order.lines.some((l) => l.barRequestedAt || (l.entryRedeemed ?? 0) > 0)) throw new Error('Заказ уже обслуживается');

    // Заказ не удаляем, а помечаем отменённым: история продаж должна
    // сойтись, а сканер на входе — знать, почему код не пускает.
    for (const line of order.lines) {
      await moveGoods(order, line, redeemableOf(line));
    }

    const work = await readWork();
    for (const invite of work.invites) if (invite.orderId === orderId && !invite.admittedAt) invite.revokedAt ??= new Date().toISOString();
    await writeWork(work);
    return replace({ ...order, status: 'cancelled', lines: order.lines.map((l) => ({ ...l, entryReserved: 0, cancelled: l.qty - l.redeemed })) });
  },

  async cancelLine(orderId, lineId, count) {
    const order = await own(orderId);
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new Error('Позиция не найдена');
    if ((line.kind === 'table' && order.depositCommitted) || line.barRequestedAt || (line.entryRedeemed ?? 0) > 0) throw new Error('Позиция уже обслуживается');
    for (const invite of (await readWork()).invites.filter((i) => i.lineId === lineId && !i.revokedAt && !i.admittedAt)) await mockOrdersService.revokeInvitation(invite.token);

    const take = Math.min(count, redeemableOf(line));
    if (take <= 0) return order;

    // Возвращается только невыданное: если гость забрал два коктейля
    // из трёх, на склад уходит один.
    await moveGoods(order, line, take);

    return replace(
      withStatus({
        ...order,
        lines: order.lines.map((l) =>
          l.id === lineId ? { ...l, entryReserved: 0, cancelled: (l.cancelled ?? 0) + take } : l,
        ),
      }),
    );
  },

  async admit(order, manual = false, qty, ownerPresent = true) {
    await requireWork('scan:entry');
    if (order.invitationToken) {
      const { work, invite, order: full } = await invitationOrder(order.invitationToken); requirePaid(full);
      if (invite.revokedAt || invite.admittedAt || !invite.claimedById) throw new Error('Приглашение недействительно');
      invite.admittedAt = new Date().toISOString();
      work.visits.push(`${invite.claimedById}:${full.eventId}`);
      await replace(withStatus({ ...full, lines: full.lines.map((l) => l.id !== invite.lineId ? l : { ...l, entryReserved: Math.max(0, (l.entryReserved ?? 0) - 1),
        ...(l.kind === 'ticket' ? { redeemed: l.redeemed + 1 } : { entryRedeemed: (l.entryRedeemed ?? 0) + 1 }) }) }));
      if(work.tables[full.id]?.serviceState==='reserved') work.tables[full.id].serviceState='arrived';
      await writeWork(work); await log('entry_admitted', full.number, `1 гость · ${invite.name}`);
      return (await mockOrdersService.byNumber(`invite:${invite.token}`))!;
    }
    const fresh = await find(order.id);
    requirePaid(fresh);

    let admitted = 0;
    if (fresh.lines.reduce((n, l) => n + entryAvailable(l), 0) !== order.lines.reduce((n, l) => n + entryAvailable(l), 0)) throw new Error('Число проходов изменилось — обновите заказ');
    let remaining = qty ?? fresh.lines.reduce((n, l) => n + entryAvailable(l), 0);
    if (!Number.isInteger(remaining) || remaining < 1 || remaining > fresh.lines.reduce((n, l) => n + entryAvailable(l), 0)) throw new Error('Недостаточно проходов');
    const lines = fresh.lines.map((line) => {
      const left = Math.min(remaining, entryAvailable(line));
      if (!left) return line;
      admitted += left;
      remaining -= left;
      return line.kind === 'ticket' ? { ...line, redeemed: line.redeemed + left } : { ...line, entryRedeemed: (line.entryRedeemed ?? 0) + left };
    });

    // Журнал ведёт тот, кто исполняет действие. На сервере это делает
    // он сам, здесь — сервис: экрану журнал не доверяют ни там, ни тут.
    if (!admitted) throw new Error('Нет неиспользованных билетов на вход');
    if (ownerPresent) {
      const work = await readWork(); work.visits.push(`${work.owners[fresh.id] ?? currentActor()?.id}:${fresh.eventId}`); await writeWork(work);
    }
    const tableWork=await readWork();if(tableWork.tables[fresh.id]?.serviceState==='reserved'){tableWork.tables[fresh.id].serviceState='arrived';await writeWork(tableWork);}
    await log(manual ? 'entry_manual' : 'entry_admitted', fresh.number, `${admitted} гостей`);

    return scoped(await replace(withStatus({ ...fresh, lines })));
  },

  async issue(order, lineId, count) {
    await requireWork('scan:bar');
    const fresh = await find(order.id);
    requirePaid(fresh);
    const line = fresh.lines.find((l) => l.id === lineId);
    if (!line || line.kind !== 'bar') throw new Error('Позиция не найдена');
    if (line.redeemed !== order.lines.find((l) => l.id === lineId)?.redeemed) throw new Error('Позиция изменилась — проверьте остаток');
    if (!Number.isInteger(count) || count < 1 || count > redeemableOf(line)) throw new Error('Недопустимое количество');
    if (count > (line.readyQty ?? 0)) throw new Error('Напитки ещё не готовы');

    const take = Math.min(count, redeemableOf(line));
    if (take <= 0) return fresh;

    const lines = fresh.lines.map((l) =>
      l.id === lineId ? { ...l, redeemed: l.redeemed + take, readyQty: (l.readyQty ?? 0) - take } : l,
    );

    await log('bar_issued', fresh.number, `${line.title} × ${take} · Приготовил: ${line.preparedByName ?? '—'}`);

    return scoped(await replace(withStatus({ ...fresh, lines })));
  },
};

/** Запись в журнал от имени того, кто сейчас на смене. */
async function log(kind: 'entry_admitted' | 'entry_manual' | 'bar_issued' | 'bar_started' | 'bar_ready' | 'bar_transferred' | 'table_updated', orderId: string, summary: string) {
  const user = currentActor();
  if (!user) return;

  await logMock({ kind, user, orderId, summary });
}

/** Сколько заказов, гостей и денег затронет возврат по вечеринке. */
export async function refundSummary(eventId: string) {
  const orders = (await all()).filter(
    (o) => o.eventId === eventId && (o.status === 'paid' || o.status === 'used'),
  );

  return {
    orders: orders.length,
    // На телефоне все заказы принадлежат одному человеку, но считаем
    // так же, как на сервере: иначе числа в интерфейсе разошлись бы
    guests: orders.length === 0 ? 0 : 1,
    total: orders.reduce((sum, o) => sum + o.total, 0),
  };
}

/**
 * Возврат денег по отменённой вечеринке.
 *
 * Деньги возвращаются полностью, даже если гость успел получить напиток:
 * вечеринку отменил клуб. А на склад уходит только невыданное — иначе
 * появились бы бутылки, которых на полке нет.
 */
export async function mockRefund(eventId: string) {
  const orders = await all();
  const affected = orders.filter(
    (o) => o.eventId === eventId && (o.status === 'paid' || o.status === 'used'),
  );

  for (const order of affected) {
    for (const line of order.lines) {
      await moveGoods(order, line, redeemableOf(line));
    }
  }

  const refundedIds = new Set(affected.map((o) => o.id));
  const work = await readWork();
  for (const invite of work.invites) if (refundedIds.has(invite.orderId) && !invite.admittedAt) invite.revokedAt ??= new Date().toISOString();
  await writeWork(work);
  await save(
    (await all()).map((o) => (refundedIds.has(o.id) ? { ...o, status: 'refunded' as const,
      lines: o.lines.map((l) => ({ ...l, entryReserved: 0, preparingQty: 0, readyQty: 0, cancelled: l.qty - l.redeemed })) } : o)),
  );

  return {
    refunded: affected.length,
    guests: affected.length === 0 ? 0 : 1,
    total: affected.reduce((sum, o) => sum + o.total, 0),
  };
}

function withStatus(order: Order): Order {
  const status = deriveStatus(order);
  return status === order.status ? order : { ...order, status };
}

/**
 * Двигает товар: отрицательное количество — продажа, положительное — возврат.
 *
 * Стол не трогаем. Депозит — не складская позиция, а занятость считается
 * по живым заказам на дату и отдельно нигде не хранится.
 */
async function moveGoods(order: Order, line: OrderLine, delta: number): Promise<void> {
  if (delta === 0) return;

  if (line.kind === 'bar') {
    await mockCatalog.applyStockMove({
      barItemId: line.refId,
      kind: delta < 0 ? 'sale' : 'correction',
      delta,
      comment: delta > 0 ? `Возврат по заказу ${order.number}` : undefined,
      orderId: order.id,
    });
  }

  if (line.kind === 'ticket' && order.eventId) {
    // Положительное количество для каталога — продажа, поэтому знак обратный
    await mockCatalog.consumeTickets(order.eventId, line.refId, -delta);
  }
}

function toOrderLine(item: CheckoutItem, id: string): OrderLine {
  return {
    id,
    kind: item.kind,
    refId: item.refId,
    redeemed: 0,
    cancelled: 0,
    title: item.title,
    subtitle: item.subtitle,
    price: item.price,
    qty: item.qty,
    guests: item.guests,
  };
}

/** Номер вида ORD-8F3A — короткий, читается вслух на входе. */
function makeOrderNumber(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ORD-${tail}`;
}

/**
 * Приводит заказы, записанные прежними версиями, к текущей модели.
 *
 * В старых записях нет ни номера, ни идентификаторов строк, ни поля
 * redeemed — без подстановки расчёт остатка давал бы NaN. Заказ, когда-то
 * помеченный used, означает, что выдали по нему всё: иначе после
 * обновления по нему можно было бы пройти второй раз.
 */
function migrate(order: Order): Order {
  const wasUsed = order.status === 'used';

  return {
    ...order,
    number: order.number ?? order.id,
    lines: order.lines.map((line, index) => ({
      ...line,
      id: line.id ?? `${order.id}-${index}`,
      redeemed: line.redeemed ?? (wasUsed ? line.qty : 0),
      cancelled: line.cancelled ?? 0,
    })),
  };
}

/** Внутреннее чтение для отчёта смены; данные остаются в сервисе. */
export const mockOperationalOrders = all;
