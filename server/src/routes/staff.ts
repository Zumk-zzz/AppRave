import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { readAuth, requirePermission, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error.js';
import { memberNoFor } from '../lib/ids.js';
import { ASSIGNABLE_ROLES, can, type UserRole } from '../lib/permissions.js';

const phoneSchema = z
  .string()
  .transform((raw) => `+7${raw.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10)}`)
  .refine((v) => /^\+7\d{10}$/.test(v), 'Некорректный номер телефона');

export async function staffRoutes(app: FastifyInstance) {
  /**
   * Разбор кода: что в заказе и что с ним может сделать именно этот сотрудник.
   *
   * Один код на заказ, а набор действий определяется правами сканирующего.
   * Отдельные коды на вход и на бар были бы хуже: гость показывал бы не тот,
   * а защиты это всё равно не даёт — её даёт право, а не вид кода.
   */
  app.get('/staff/scan/:number', async (req) => {
    const auth = requireUser(req);
    if (!can(auth.role, 'scan:entry') && !can(auth.role, 'scan:bar')) {
      throw forbidden('Сканирование недоступно для вашей роли');
    }

    const { number } = z.object({ number: z.string() }).parse(req.params);

    const order = await db.order.findUnique({
      where: { number },
      include: { lines: true, event: true, bookings: true, user: true },
    });

    if (!order) throw notFound('Заказ не найден');

    const ban = await db.banEntry.findFirst({
      where: { phone: order.user.phone, liftedAt: null },
    });

    return {
      order: toScanDto(order),
      // Отказ во входе показывается сразу и крупно: фейсер не должен
      // искать эту информацию отдельно, когда очередь стоит
      ban: ban ? { reason: ban.reason, since: ban.createdAt.toISOString() } : null,
      allowed: {
        entry: can(auth.role, 'scan:entry'),
        bar: can(auth.role, 'scan:bar'),
      },
    };
  });

  /** Пропустить гостей: гасит все билетные строки заказа. */
  app.post('/staff/scan/:number/admit', async (req) => {
    const auth = requirePermission(req, 'scan:entry');
    const { number } = z.object({ number: z.string() }).parse(req.params);
    const { manual } = z.object({ manual: z.boolean().default(false) }).parse(req.body ?? {});

    const order = await db.order.findUnique({ where: { number }, include: { lines: true, user: true } });
    if (!order) throw notFound('Заказ не найден');
    if (order.status === 'cancelled') throw conflict('Заказ отменён', 'order_cancelled');
    if (order.status !== 'paid' && order.status !== 'used') {
      throw conflict('Заказ не оплачен', 'not_paid');
    }

    const ban = await db.banEntry.findFirst({ where: { phone: order.user.phone, liftedAt: null } });
    if (ban) throw conflict(`Отказ во входе: ${ban.reason}`, 'banned');

    const admitted = await db.$transaction(async (tx) => {
      let count = 0;

      for (const line of order.lines) {
        if (line.kind !== 'ticket') continue;
        const left = line.qty - line.redeemed - line.cancelledQty;
        if (left <= 0) continue;

        await tx.orderLine.update({
          where: { id: line.id },
          data: { redeemed: line.redeemed + left },
        });
        count += left;
      }

      if (count > 0) {
        await tx.order.update({ where: { id: order.id }, data: { usedAt: new Date() } });
      }

      return count;
    });

    if (admitted === 0) throw conflict('По этому заказу уже прошли', 'nothing_to_admit');

    await logAction(auth.sub, manual ? 'entry_manual' : 'entry_admitted', {
      orderId: order.id,
      details: { number: order.number, guests: admitted },
    });

    return { admitted, order: await loadScan(order.number) };
  });

  /** Выдать напитки: по одной позиции, возможно частично. */
  app.post('/staff/scan/:number/issue', async (req) => {
    const auth = requirePermission(req, 'scan:bar');
    const { number } = z.object({ number: z.string() }).parse(req.params);
    const { lineId, qty } = z
      .object({ lineId: z.string(), qty: z.number().int().min(1).max(50) })
      .parse(req.body);

    const order = await db.order.findUnique({ where: { number }, include: { lines: true } });
    if (!order) throw notFound('Заказ не найден');
    if (order.status === 'cancelled') throw conflict('Заказ отменён', 'order_cancelled');

    const line = order.lines.find((l) => l.id === lineId);
    if (!line || line.kind !== 'bar') throw notFound('Позиция не найдена');

    const left = line.qty - line.redeemed - line.cancelledQty;
    if (left <= 0) throw conflict('По этой позиции уже всё выдано', 'nothing_to_issue');
    if (qty > left) throw badRequest(`Осталось выдать только ${left}`, 'too_many');

    await db.orderLine.update({
      where: { id: line.id },
      data: { redeemed: line.redeemed + qty },
    });

    await logAction(auth.sub, 'bar_issued', {
      orderId: order.id,
      details: { number: order.number, item: line.title, qty },
    });

    return { issued: qty, order: await loadScan(order.number) };
  });

  // --- Смены ---

  /** Текущая открытая смена сотрудника. */
  app.get('/staff/shift', async (req) => {
    const auth = requireUser(req);
    const shift = await db.shift.findFirst({
      where: { userId: auth.sub, closedAt: null },
      orderBy: { openedAt: 'desc' },
    });

    return shift ? toShiftDto(shift) : null;
  });

  app.post('/staff/shift/open', async (req) => {
    const auth = requireUser(req);

    const open = await db.shift.findFirst({ where: { userId: auth.sub, closedAt: null } });
    if (open) throw conflict('Смена уже открыта', 'shift_open');

    const shift = await db.shift.create({ data: { userId: auth.sub } });
    await logAction(auth.sub, 'shift_opened', { shiftId: shift.id });

    return toShiftDto(shift);
  });

  app.post('/staff/shift/close', async (req) => {
    const auth = requireUser(req);
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {});

    const open = await db.shift.findFirst({ where: { userId: auth.sub, closedAt: null } });
    if (!open) throw conflict('Открытой смены нет', 'no_shift');

    const shift = await db.shift.update({
      where: { id: open.id },
      data: { closedAt: new Date(), note },
    });

    await logAction(auth.sub, 'shift_closed', { shiftId: shift.id });

    // Итоги смены: что сотрудник успел за ночь
    const actions = await db.staffAction.groupBy({
      by: ['kind'],
      where: { actorId: auth.sub, createdAt: { gte: shift.openedAt } },
      _count: true,
    });

    return {
      ...toShiftDto(shift),
      summary: Object.fromEntries(actions.map((a) => [a.kind, a._count])),
    };
  });

  // --- Журнал ---

  /** Журнал действий. Сотрудник видит свои, управляющий — все. */
  app.get('/staff/actions', async (req) => {
    const auth = requireUser(req);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);

    const seesAll = can(auth.role, 'orders:read');

    const actions = await db.staffAction.findMany({
      where: seesAll ? {} : { actorId: auth.sub },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { name: true, phone: true, role: true } } },
    });

    return actions.map((a) => ({
      id: a.id,
      kind: a.kind,
      actor: { name: a.actor.name, role: a.actor.role },
      orderId: a.orderId,
      details: a.details,
      createdAt: a.createdAt.toISOString(),
    }));
  });

  // --- Сотрудники ---

  app.get('/staff/members', async (req) => {
    requirePermission(req, 'staff:manage');

    const members = await db.user.findMany({
      where: { role: { not: 'guest' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, phone: true, role: true, createdAt: true },
    });

    return members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  });

  /**
   * Выдать роль по номеру телефона.
   *
   * Именно по номеру, а не по существующему пользователю: бармен мог
   * ещё ни разу не заходить в приложение. Он войдёт и сразу получит роль.
   */
  app.post('/staff/members', async (req) => {
    const auth = requirePermission(req, 'staff:manage');
    const { phone, role, name } = z
      .object({
        phone: phoneSchema,
        role: z.enum(ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]),
        name: z.string().min(1).max(80).default('Сотрудник'),
      })
      .parse(req.body);

    const user = await db.user.upsert({
      where: { phone },
      update: { role },
      create: { phone, name, role, memberNo: memberNoFor(phone) },
    });

    await logAction(auth.sub, 'role_granted', {
      details: { phone, role, userId: user.id },
    });

    return { id: user.id, name: user.name, phone: user.phone, role: user.role };
  });

  /** Отозвать роль: сотрудник становится обычным гостем. */
  app.delete('/staff/members/:id', async (req) => {
    const auth = requirePermission(req, 'staff:manage');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    if (id === auth.sub) {
      // Иначе последний администратор разжалует себя и выдать роли
      // станет некому — восстановить можно будет только через базу.
      throw badRequest('Нельзя снять роль с самого себя', 'self_revoke');
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw notFound('Сотрудник не найден');

    await db.user.update({ where: { id }, data: { role: 'guest' } });
    await logAction(auth.sub, 'role_revoked', {
      details: { phone: user.phone, previousRole: user.role, userId: id },
    });

    return { ok: true };
  });

  // --- Стоп-лист ---

  app.get('/staff/bans', async (req) => {
    requirePermission(req, 'scan:entry');

    const bans = await db.banEntry.findMany({
      where: { liftedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return bans.map((b) => ({
      id: b.id,
      phone: b.phone,
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
    }));
  });

  app.post('/staff/bans', async (req) => {
    const auth = requirePermission(req, 'scan:entry');
    const { phone, reason } = z
      .object({ phone: phoneSchema, reason: z.string().min(3).max(300) })
      .parse(req.body);

    const ban = await db.banEntry.upsert({
      where: { phone },
      update: { reason, liftedAt: null, createdBy: auth.sub },
      create: { phone, reason, createdBy: auth.sub },
    });

    return { id: ban.id, phone: ban.phone, reason: ban.reason };
  });

  app.delete('/staff/bans/:id', async (req) => {
    requirePermission(req, 'scan:entry');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    // Снимаем отметкой, а не удалением: история отказов не должна пропадать
    await db.banEntry.update({ where: { id }, data: { liftedAt: new Date() } });
    return { ok: true };
  });

  // --- Списки на сегодня ---

  /**
   * Гости на событие: кого ждём на входе.
   * Нужен, когда у гостя сел телефон и код показать нечем.
   */
  app.get('/staff/guest-list/:eventId', async (req) => {
    requirePermission(req, 'scan:entry');
    const { eventId } = z.object({ eventId: z.string() }).parse(req.params);

    const orders = await db.order.findMany({
      where: { eventId, status: { in: ['paid', 'used'] } },
      include: { lines: true, user: true, bookings: { include: { table: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => {
      const tickets = o.lines.filter((l) => l.kind === 'ticket');
      return {
        number: o.number,
        name: o.user.name,
        phone: o.user.phone,
        tickets: tickets.reduce((n, l) => n + l.qty, 0),
        admitted: tickets.reduce((n, l) => n + l.redeemed, 0),
        table: o.bookings[0]?.table.label ?? null,
        guests: o.bookings.flatMap((b) => b.guests),
      };
    });
  });

  /** Предзаказы бара, которые ещё не выданы: бармен готовит заранее. */
  app.get('/staff/bar-queue/:eventId', async (req) => {
    requirePermission(req, 'scan:bar');
    const { eventId } = z.object({ eventId: z.string() }).parse(req.params);

    const orders = await db.order.findMany({
      where: { eventId, status: { in: ['paid', 'used'] } },
      include: { lines: true, user: true, bookings: { include: { table: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return orders
      .map((o) => ({
        number: o.number,
        name: o.user.name,
        table: o.bookings[0]?.table.label ?? null,
        items: o.lines
          .filter((l) => l.kind === 'bar' && l.qty - l.redeemed - l.cancelledQty > 0)
          .map((l) => ({
            lineId: l.id,
            title: l.title,
            left: l.qty - l.redeemed - l.cancelledQty,
            qty: l.qty,
          })),
      }))
      .filter((o) => o.items.length > 0);
  });
}

type OrderWithAll = Prisma.OrderGetPayload<{
  include: { lines: true; event: true; bookings: true; user: true };
}>;

function toScanDto(order: OrderWithAll) {
  const left = (l: (typeof order.lines)[number]) => l.qty - l.redeemed - l.cancelledQty;

  return {
    number: order.number,
    status: order.status,
    guest: { name: order.user.name, phone: order.user.phone },
    event: order.event
      ? { id: order.event.id, title: order.event.title, date: order.event.startsAt.toISOString() }
      : null,
    entry: {
      total: order.lines.filter((l) => l.kind === 'ticket').reduce((n, l) => n + l.qty, 0),
      left: order.lines.filter((l) => l.kind === 'ticket').reduce((n, l) => n + left(l), 0),
    },
    bar: order.lines
      .filter((l) => l.kind === 'bar')
      .map((l) => ({ lineId: l.id, title: l.title, qty: l.qty, redeemed: l.redeemed, left: left(l) })),
    table: order.bookings[0]
      ? { guests: order.bookings[0].guests }
      : null,
  };
}

async function loadScan(number: string) {
  const order = await db.order.findUnique({
    where: { number },
    include: { lines: true, event: true, bookings: true, user: true },
  });
  return order ? toScanDto(order) : null;
}

function toShiftDto(shift: { id: string; openedAt: Date; closedAt: Date | null; note: string | null }) {
  return {
    id: shift.id,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    note: shift.note,
  };
}

/**
 * Запись в журнал.
 *
 * Сбой журнала не должен отменять само действие: гость уже прошёл или
 * получил напиток, и откатывать это из-за проблемы с логом неправильно.
 */
async function logAction(
  actorId: string,
  kind: Prisma.StaffActionCreateInput['kind'],
  extra: { orderId?: string; shiftId?: string; details?: Prisma.InputJsonValue } = {},
) {
  try {
    const shift =
      extra.shiftId ??
      (await db.shift.findFirst({
        where: { userId: actorId, closedAt: null },
        select: { id: true },
      }))?.id;

    await db.staffAction.create({
      data: {
        actorId,
        kind,
        orderId: extra.orderId,
        shiftId: shift,
        details: extra.details,
      },
    });
  } catch {
    // Молча: действие уже выполнено, и ронять ответ из-за журнала нельзя
  }
}
