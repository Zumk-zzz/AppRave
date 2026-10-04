import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission, requireStaff, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { conflict, forbidden, notFound } from '../lib/http-error.js';
import { activity, lockShift, shiftReport } from '../lib/operations.js';
import { ensureServing } from '../lib/fulfillment.js';
import { canNow } from '../lib/permissions.js';
import { loadOrder } from './orders.js';
import { orderNumber } from '../lib/ids.js';

export async function operationsRoutes(app: FastifyInstance) {
  app.get('/staff/bar/team', async (req) => {
    const auth = requireStaff(req);
    if (!canNow(auth.staffRole, true, 'scan:bar')) throw forbidden('Раздел доступен бару');
    const shifts = await db.shift.findMany({ where: { closedAt: null, user: { role: { in: ['bartender','manager','admin'] } } }, include: { user: true } });
    return shifts.map((s) => ({ id: s.userId, name: s.user.name, shiftId: s.id }));
  });

  app.post('/staff/bar/:lineId/transfer', async (req) => {
    const auth = requireStaff(req);
    const manager = canNow(auth.staffRole, !!auth.shiftId, 'orders:read');
    if (!manager) requirePermission(req, 'scan:bar');
    const { lineId } = z.object({ lineId: z.string() }).parse(req.params);
    const { toUserId, expectedAssignee, reason } = z.object({ toUserId: z.string(), expectedAssignee: z.string(), reason: z.string().trim().min(3).max(300) }).parse(req.body);
    const initial = await db.orderLine.findUnique({ where: { id: lineId } });
    if (!initial) throw notFound('Позиция не найдена');
    await db.$transaction(async (tx) => {
      const target = await tx.shift.findFirst({ where: { userId: toUserId, closedAt: null } });
      if (!target) throw conflict('Получатель должен открыть смену', 'target_off_shift');
      const ids = [...new Set([target.id, ...(auth.shiftId ? [auth.shiftId] : [])])].sort();
      for (const id of ids) await tx.$queryRaw`SELECT id FROM shifts WHERE id=${id} FOR UPDATE`;
      if (!manager) await lockShift(tx, auth);
      const active = await tx.shift.findUniqueOrThrow({ where: { id: target.id }, include: { user: true } });
      if (active.closedAt || !canNow(active.user.role === 'guest' ? undefined : active.user.role, true, 'scan:bar')) throw conflict('Получатель не работает в баре', 'invalid_target');
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.orderId} FOR UPDATE`;
      const line = await tx.orderLine.findUniqueOrThrow({ where: { id: lineId }, include: { order: { include: { event: true } } } });
      ensureServing(line.order.event);
      if (line.kind !== 'bar' || line.order.status !== 'paid' || line.preparingQty <= 0 || line.preparedById !== expectedAssignee) throw conflict('Позиция изменилась — обновите очередь', 'stale_transfer');
      if (!manager && line.preparedById !== auth.sub) throw forbidden('Передать можно только свою позицию');
      if (toUserId === line.preparedById) throw conflict('Позиция уже у этого бармена', 'same_assignee');
      const actor = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } });
      await tx.orderLine.update({ where: { id: lineId }, data: { preparedById: toUserId, preparedByName: active.user.name } });
      await tx.staffAction.create({ data: { actorId: auth.sub, shiftId: auth.shiftId, orderId: line.orderId, kind: 'bar_transferred', details: { number: line.order.number, item: line.title, qty: line.preparingQty, from: line.preparedByName, to: active.user.name, toUserId, reason } } });
      await activity(tx, line.orderId, 'bar_transferred', `${line.title}: ${line.preparedByName} → ${active.user.name}. ${reason}`, actor.name);
    });
    return { ok: true };
  });

  app.get('/staff/my-shifts', async (req) => {
    const auth = requireStaff(req);
    return db.shift.findMany({ where: { userId: auth.sub }, orderBy: { openedAt: 'desc' }, take: 50, select: { id: true, openedAt: true, closedAt: true, note: true } });
  });
  app.get('/staff/shifts/:id/report', async (req) => {
    const auth = requireStaff(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const shift = await db.shift.findUnique({ where: { id } });
    if (!shift || (shift.userId !== auth.sub && !canNow(auth.staffRole, !!auth.shiftId, 'orders:read'))) throw notFound('Смена не найдена');
    if (shift.report) return shift.report;
    const owner = await db.user.findUniqueOrThrow({ where: { id: shift.userId } });
    return db.$transaction((tx) => shiftReport(tx, shift, owner.role === 'guest' ? undefined : owner.role));
  });

  app.get('/staff/tables', async (req) => {
    requirePermission(req, 'orders:read');
    const { eventId } = z.object({ eventId: z.string() }).parse(req.query);
    return db.tableBooking.findMany({ where: { eventId, status: 'paid', order: { status: { in: ['paid','used'] } } }, include: { table: true, order: { select: { number: true, user: { select: { name: true } } } } }, orderBy: { tableId: 'asc' } });
  });
  app.post('/staff/tables/:id/state', async (req) => {
    const auth = requirePermission(req, 'orders:read');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ state: z.enum(['reserved','arrived','occupied','released']), expectedState: z.string(), responsibleId: z.string().optional(), confirmRemainingKopecks: z.number().int().nonnegative().optional() }).parse(req.body);
    await db.$transaction(async (tx) => {
      const initial = await tx.tableBooking.findUnique({ where: { id } });
      if (!initial) throw notFound('Бронь не найдена');
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.orderId} FOR UPDATE`;
      const booking = await tx.tableBooking.findUniqueOrThrow({ where: { id }, include: { event: true, order: true } });
      ensureServing(booking.event);
      if (booking.status !== 'paid' || !['paid','used'].includes(booking.order.status) || booking.serviceStatus !== body.expectedState) throw conflict('Состояние столика изменилось', 'stale_table');
      if (body.state === 'released' && booking.depositRemainingKopecks > 0 && body.confirmRemainingKopecks !== booking.depositRemainingKopecks) throw conflict('Подтвердите неиспользованный остаток депозита', 'confirm_deposit');
      const next: Record<string,string> = { reserved: 'arrived', arrived: 'occupied', occupied: 'released' };
      if (body.state !== booking.serviceStatus && next[booking.serviceStatus] !== body.state) throw conflict('Сначала подтвердите предыдущий этап', 'invalid_table_transition');
      const responsible = body.responsibleId ? await tx.user.findUnique({ where: { id: body.responsibleId } }) : null;
      if (body.responsibleId && (!responsible || responsible.role === 'guest')) throw conflict('Ответственный должен быть сотрудником', 'invalid_responsible');
      const actor = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } });
      const changed = body.state !== booking.serviceStatus;
      await tx.tableBooking.update({ where: { id }, data: { serviceStatus: body.state, ...(responsible ? { responsibleId: responsible.id, responsibleName: responsible.name } : {}),
        ...(changed && body.state === 'arrived' ? { arrivedAt: new Date() } : {}), ...(changed && body.state === 'occupied' ? { occupiedAt: new Date() } : {}), ...(changed && body.state === 'released' ? { releasedAt: new Date() } : {}) } });
      await tx.staffAction.create({ data: { actorId: auth.sub, shiftId: auth.shiftId, orderId: booking.orderId, kind: 'table_updated', details: { number: booking.order.number, state: body.state, responsible: responsible?.name ?? booking.responsibleName } } });
      await activity(tx, booking.orderId, 'table_updated', `Стол: ${{reserved:'Забронирован',arrived:'Гости пришли',occupied:'Занят',released:'Освобождён'}[body.state]}${responsible ? ` · ${responsible.name}` : ''}`, actor.name);
    });
    return { ok: true };
  });
  app.get('/orders/:id/table', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await db.order.findUnique({ where: { id } });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
    return db.tableBooking.findFirst({ where: { orderId: id }, include: { table: true, order: { select: { number: true } } } });
  });
  app.post('/orders/:id/deposit/order', async (req, reply) => {
    const auth = requirePermission(req, 'purchase');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { barItemId, qty, requestId } = z.object({ barItemId: z.string(), qty: z.number().int().min(1).max(50), requestId: z.string().min(16).max(100) }).parse(req.body);
    const orderId = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR UPDATE`;
      const original = await tx.order.findUnique({ where: { id }, include: { event: true, bookings: true } });
      if (!original || original.userId !== auth.sub) throw notFound('Заказ не найден');
      const prior = await tx.idempotencyKey.findUnique({ where: { key: requestId } });
      if (prior) { const existing=await tx.order.findUniqueOrThrow({where:{id:prior.orderId}}); if (prior.userId !== auth.sub || existing.depositBookingId !== original.bookings[0]?.id) throw conflict('Повторите заказ', 'key_used'); return prior.orderId; }
      ensureServing(original.event);
      const booking = original.bookings[0];
      if (!booking || booking.status !== 'paid' || booking.serviceStatus === 'released' || !['paid','used'].includes(original.status)) throw conflict('Депозит недоступен', 'deposit_inactive');
      const visit = await tx.visit.findUnique({ where: { userId_eventId: { userId: auth.sub, eventId: original.eventId! } } });
      if (!visit) throw conflict('Сначала подтвердите вход', 'entry_required');
      const item = await tx.barItem.findUnique({ where: { id: barItemId } });
      if (!item?.available) throw notFound('Напиток недоступен');
      const amount = item.priceKopecks * qty;
      if (amount <= 0 || amount > booking.depositRemainingKopecks) throw conflict('Недостаточно остатка депозита', 'insufficient_deposit');
      const reserved = await tx.$executeRaw`UPDATE stock SET qty=qty-${qty} WHERE bar_item_id=${barItemId} AND qty>=${qty}`;
      if (reserved !== 1) throw conflict('Напиток закончился', 'out_of_stock');
      await tx.tableBooking.update({ where: { id: booking.id }, data: { depositRemainingKopecks: { decrement: amount } } });
      const order = await tx.order.create({ data: { number: orderNumber(), userId: auth.sub, eventId: original.eventId, status: 'paid', paidAt: new Date(), totalKopecks: 0, pointsEarned: 0, depositBookingId: booking.id, depositUsedKopecks: amount,
        lines: { create: { kind: 'bar', barItemId, title: item.name, subtitle: item.volume, priceKopecks: item.priceKopecks, qty, barRequestedAt: new Date() } } } });
      await tx.stockMove.create({ data: { barItemId, kind: 'sale', delta: -qty, orderId: order.id, comment: `Из депозита ${original.number}` } });
      await tx.idempotencyKey.create({ data: { key: requestId, userId: auth.sub, orderId: order.id } });
      await activity(tx, original.id, 'deposit_spent', `${item.name} × ${qty} · ${amount/100} ₽ · ${order.number}`);
      await activity(tx, order.id, 'deposit_paid', `Оплачено из депозита ${original.number}: ${amount/100} ₽`);
      return order.id;
    });
    return reply.code(201).send(await loadOrder(orderId));
  });
  app.get('/staff/orders/:number/timeline', async (req) => {
    requirePermission(req, 'orders:read');
    const { number } = z.object({ number: z.string() }).parse(req.params);
    const order = await db.order.findUnique({ where: { number }, include: { payments: true, invitations: true, activities: true, bookings: true } });
    if (!order) throw notFound('Заказ не найден');
    const actions = await db.staffAction.findMany({ where: { orderId: order.id }, include: { actor: { select: { name: true } } } });
    const rows = [{ id: 'created', kind: 'created', title: 'Заказ создан', createdAt: order.createdAt.toISOString(), actorName: null as string | null },
      ...order.activities.map((a) => ({ id:a.id, kind:a.kind, title:a.title, createdAt:a.createdAt.toISOString(), actorName:a.actorName })),
      ...actions.filter((a) => !['bar_transferred','table_updated'].includes(a.kind)).map((a) => { const d=a.details as Record<string,unknown>|null; return { id:a.id, kind:a.kind, title: `${({bar_started:'Приготовление начато',bar_ready:'Напитки готовы',bar_issued:'Напитки выданы',entry_admitted:'Вход по QR',entry_manual:'Ручной вход',refund_issued:'Возврат'} as Record<string,string>)[a.kind] ?? 'Действие сотрудника'}${d?.item ? ` · ${d.item}` : ''}${d?.qty ? ` × ${d.qty}` : ''}${d?.guests ? ` · гостей: ${d.guests}` : ''}`, createdAt:a.createdAt.toISOString(), actorName:a.actor.name }; }),
      ...order.payments.filter((p) => p.status === 'succeeded' || p.status === 'refunded').map((p) => ({ id:p.id, kind:p.status === 'refunded' ? 'refunded' : 'paid', title:p.status === 'refunded' ? 'Оплата возвращена' : 'Оплата подтверждена (демо)', createdAt:(p.status === 'refunded' ? p.updatedAt : order.paidAt ?? p.updatedAt).toISOString(), actorName:null })),
      ...order.invitations.flatMap((i) => [{ id:`${i.id}-created`, kind:'invitation', title:`Приглашение: ${i.name}`, createdAt:i.createdAt.toISOString(), actorName:null }, ...(i.admittedAt ? [{ id:`${i.id}-used`, kind:'invitation_used', title:`Друг прошёл: ${i.name}`, createdAt:i.admittedAt.toISOString(), actorName:null }] : []), ...(i.revokedAt ? [{ id:`${i.id}-revoked`, kind:'invitation_revoked', title:`Приглашение отозвано: ${i.name}`, createdAt:i.revokedAt.toISOString(), actorName:null }] : [])])];
    return { order: await loadOrder(order.id), rows: rows.sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) };
  });
}
