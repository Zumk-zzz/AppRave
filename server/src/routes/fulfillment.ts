import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { conflict, forbidden, notFound } from '../lib/http-error.js';
import { entryLeft, ensureServing, recordVisit } from '../lib/fulfillment.js';
import { lockShift, arrival, activity } from '../lib/operations.js';
import { isLive } from '../lib/events.js';
import { loadOrder, settleStatus } from './orders.js';

export async function fulfillmentRoutes(app: FastifyInstance) {
  app.post('/orders/:id/bar/request', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id }, include: { event: true, lines: true } });
      if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
      if (order.status !== 'paid') throw conflict('Заказ не готов к обслуживанию', 'not_paid');
      ensureServing(order.event);
      const visit = await tx.visit.findUnique({ where: { userId_eventId: { userId: auth.sub, eventId: order.eventId! } } });
      if (!visit) throw conflict('Сначала подтвердите свой вход у фейс-контроля', 'entry_required');
      for (const line of order.lines) {
        if (line.kind === 'bar' && !line.barRequestedAt && line.qty > line.redeemed + line.cancelledQty) {
          await tx.orderLine.update({ where: { id: line.id }, data: { barRequestedAt: new Date() } });
          await activity(tx, order.id, 'bar_requested', `${line.title} × ${line.qty - line.redeemed - line.cancelledQty}: передано в бар`);
        }
      }
    });
    return loadOrder(id);
  });

  app.post('/staff/bar/:lineId/prepare', async (req) => {
    const auth = requirePermission(req, 'scan:bar');
    const { lineId } = z.object({ lineId: z.string() }).parse(req.params);
    const initial = await db.orderLine.findUnique({ where: { id: lineId } });
    if (!initial) throw notFound('Позиция не найдена');
    await db.$transaction(async (tx) => {
      await lockShift(tx, auth);
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.orderId} FOR UPDATE`;
      const line = await tx.orderLine.findUniqueOrThrow({ where: { id: lineId }, include: { order: { include: { event: true } } } });
      ensureServing(line.order.event);
      if (line.kind !== 'bar' || line.order.status !== 'paid' || !line.barRequestedAt) throw conflict('Позиция не стоит в очереди', 'not_queued');
      if (line.preparedById) {
        if (line.preparedById === auth.sub) return;
        throw conflict(`Заказ готовит ${line.preparedByName}`, 'already_claimed');
      }
      const qty = line.qty - line.cancelledQty - line.redeemed;
      if (qty <= 0) throw conflict('Выдавать нечего', 'nothing_left');
      const actor = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } });
      await tx.orderLine.update({ where: { id: lineId }, data: { preparingQty: qty, preparingStartedAt: new Date(), preparedById: auth.sub, preparedByName: actor.name } });
      await tx.staffAction.create({ data: { actorId: auth.sub, shiftId: auth.shiftId, orderId: line.orderId,
        kind: 'bar_started', details: { number: line.order.number, lineId, item: line.title, qty } } });
    });
    return { ok: true };
  });

  app.post('/staff/bar/:lineId/ready', async (req) => {
    const auth = requirePermission(req, 'scan:bar');
    const { lineId } = z.object({ lineId: z.string() }).parse(req.params);
    const { qty, expectedPreparing } = z.object({ qty: z.number().int().positive().max(50), expectedPreparing: z.number().int().positive() }).parse(req.body);
    const initial = await db.orderLine.findUnique({ where: { id: lineId } });
    if (!initial) throw notFound('Позиция не найдена');
    await db.$transaction(async (tx) => {
      await lockShift(tx, auth);
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initial.orderId} FOR UPDATE`;
      const line = await tx.orderLine.findUniqueOrThrow({ where: { id: lineId }, include: { order: { include: { event: true } } } });
      ensureServing(line.order.event);
      if (line.preparedById !== auth.sub) throw forbidden('Готовность подтверждает бармен, принявший позицию');
      if (line.order.status !== 'paid' || line.preparingQty !== expectedPreparing || qty > line.preparingQty) {
        throw conflict('Состояние изменилось — обновите очередь', 'stale_preparation');
      }
      await tx.orderLine.update({ where: { id: lineId }, data: { preparingQty: { decrement: qty }, readyQty: { increment: qty }, barReadyAt: new Date() } });
      await tx.staffAction.create({ data: { actorId: auth.sub, shiftId: auth.shiftId, orderId: line.orderId,
        kind: 'bar_ready', details: { number: line.order.number, lineId, item: line.title, qty } } });
    });
    return { ok: true };
  });

  app.get('/orders/:id/invitations', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await db.order.findUnique({ where: { id } });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
    return db.entryInvitation.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' } });
  });

  app.post('/orders/:id/invitations', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    // Идентификатор попытки задаёт клиент: повтор после обрыва не резервирует второе место.
    const { name, requestId } = z.object({ name: z.string().trim().min(1).max(80), requestId: z.string().min(16).max(100) }).parse(req.body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id }, include: { lines: true, event: true } });
      if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
      const existing = await tx.entryInvitation.findUnique({ where: { id: requestId } });
      if (existing) {
        if (existing.orderId !== id) throw conflict('Повторите создание приглашения', 'key_used');
        return existing;
      }
      if (order.status !== 'paid') throw conflict('Заказ не оплачен или закрыт', 'not_paid');
      ensureServing(order.event);
      const line = order.lines.find((l) => entryLeft(l) > 0);
      if (!line) throw conflict('Свободных проходов нет', 'no_entries');
      await tx.orderLine.update({ where: { id: line.id }, data: { entryReserved: { increment: 1 } } });
      return tx.entryInvitation.create({ data: { id: requestId, token: randomBytes(32).toString('hex'), orderId: id, lineId: line.id, name } });
    });
  });

  app.post('/invitations/:token/revoke', async (req) => {
    const auth = requireUser(req);
    const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
    const invite = await db.entryInvitation.findUnique({ where: { token } });
    if (!invite) throw notFound('Приглашение не найдено');
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${invite.orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({ where: { id: invite.orderId } });
      if (order.userId !== auth.sub) throw notFound('Приглашение не найдено');
      const fresh = await tx.entryInvitation.findUniqueOrThrow({ where: { token } });
      if (fresh.admittedAt) throw conflict('Гость уже прошёл', 'already_admitted');
      if (fresh.revokedAt) return;
      await tx.entryInvitation.update({ where: { token }, data: { revokedAt: new Date() } });
      await tx.orderLine.update({ where: { id: invite.lineId }, data: { entryReserved: { decrement: 1 } } });
    });
    return { ok: true };
  });

  app.get('/invitations/:token', async (req) => {
    const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
    const invite = await db.entryInvitation.findUnique({ where: { token } });
    if (!invite) throw notFound('Приглашение не найдено');
    const order = await db.order.findUniqueOrThrow({ where: { id: invite.orderId }, include: { event: true } });
    const active = !invite.revokedAt && ['paid', 'used'].includes(order.status) && order.event?.status === 'published' && isLive(order.event.startsAt);
    return { name: invite.name, eventTitle: order.event?.title, eventDate: order.event?.startsAt,
      status: !active ? 'revoked' : invite.admittedAt ? 'used' : invite.claimedById ? 'claimed' : 'available' };
  });

  app.post('/invitations/:token/claim', async (req) => {
    const auth = requireUser(req);
    const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
    const invite = await db.entryInvitation.findUnique({ where: { token } });
    if (!invite) throw notFound('Приглашение не найдено');
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${invite.orderId} FOR UPDATE`;
      const fresh = await tx.entryInvitation.findUniqueOrThrow({ where: { token } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: invite.orderId }, include: { event: true } });
      ensureServing(order.event);
      if (fresh.revokedAt || fresh.admittedAt || !['paid', 'used'].includes(order.status)) throw conflict('Приглашение недействительно', 'invite_inactive');
      if (fresh.claimedById && fresh.claimedById !== auth.sub) throw conflict('Приглашение уже принято другим гостем', 'invite_claimed');
      if (!fresh.claimedById) { const guest = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } }); await activity(tx, order.id, 'invitation_claimed', `Приглашение принято: ${fresh.name}`, guest.name); }
      await tx.entryInvitation.update({ where: { token }, data: { claimedById: auth.sub } });
    });
    return { qrPayload: `APPRAVE-INV|${token}` };
  });

  app.get('/staff/invitations/:token', async (req) => {
    requirePermission(req, 'scan:entry');
    const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
    const invite = await db.entryInvitation.findUnique({ where: { token } });
    if (!invite) throw notFound('Приглашение не найдено');
    const order = await db.order.findUniqueOrThrow({ where: { id: invite.orderId }, include: { event: true } });
    ensureServing(order.event);
    if (invite.revokedAt || !['paid', 'used'].includes(order.status)) throw conflict('Приглашение недействительно', 'invite_inactive');
    if (!invite.claimedById) throw conflict('Гость должен принять приглашение в приложении', 'invite_not_claimed');
    return { order: { id: invite.id, number: `Приглашение: ${invite.name}`, invitationToken: token,
      createdAt: invite.createdAt.toISOString(), totalKopecks: 0, pointsEarned: 0,
      status: invite.admittedAt ? 'used' : 'paid', event: { id: order.eventId, title: order.event!.title, date: order.event!.startsAt.toISOString() },
      qrPayload: `APPRAVE-INV|${token}`,
      lines: [{ id: invite.id, kind: 'ticket', refId: '', title: `Вход · ${invite.name}`, priceKopecks: 0, qty: 1, redeemed: invite.admittedAt ? 1 : 0, cancelledQty: 0 }] } };
  });

  app.post('/staff/invitations/:token/admit', async (req) => {
    const auth = requirePermission(req, 'scan:entry');
    const { token } = z.object({ token: z.string().length(64) }).parse(req.params);
    const invite = await db.entryInvitation.findUnique({ where: { token } });
    if (!invite) throw notFound('Приглашение не найдено');
    await db.$transaction(async (tx) => {
      await lockShift(tx, auth);
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${invite.orderId} FOR UPDATE`;
      const fresh = await tx.entryInvitation.findUniqueOrThrow({ where: { token } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: invite.orderId }, include: { event: true } });
      ensureServing(order.event);
      if (fresh.revokedAt || fresh.admittedAt || !fresh.claimedById || !['paid', 'used'].includes(order.status)) throw conflict('Приглашение уже использовано или недействительно', 'invite_inactive');
      const guest = await tx.user.findUniqueOrThrow({ where: { id: fresh.claimedById } });
      const contacts = [guest.phone, guest.email].filter((v): v is string => !!v);
      const ban = await tx.banEntry.findFirst({ where: { phone: { in: contacts }, liftedAt: null } });
      if (ban) throw conflict(`Отказ во входе: ${ban.reason}`, 'banned');
      const line = await tx.orderLine.findUniqueOrThrow({ where: { id: invite.lineId } });
      if (line.entryReserved < 1 || line.cancelledQty === line.qty) throw conflict('Проход отменён', 'invite_inactive');
      await tx.orderLine.update({ where: { id: line.id }, data: { entryReserved: { decrement: 1 },
        ...(line.kind === 'ticket' ? { redeemed: { increment: 1 } } : { entryRedeemed: { increment: 1 } }) } });
      await tx.entryInvitation.update({ where: { token }, data: { admittedAt: new Date() } });
      await recordVisit(tx, fresh.claimedById, order.eventId!);
      await arrival(tx, order.id);
      await settleStatus(tx, order.id);
      await tx.staffAction.create({ data: { actorId: auth.sub, shiftId: auth.shiftId, orderId: order.id, kind: 'entry_admitted', details: { number: order.number, guests: 1, invitation: invite.id, guest: guest.name } } });
    });
    return { admitted: 1 };
  });
}
