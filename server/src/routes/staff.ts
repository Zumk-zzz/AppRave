import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { readAuth, requirePermission, requireStaff, requireUser, type Auth } from '../auth/guard.js';
import { db } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error.js';
import { parseContact } from '../lib/contact.js';
import { allocateMemberNo } from '../lib/ids.js';
import { entryLeft, ensureServing, recordVisit } from '../lib/fulfillment.js';
import { ASSIGNABLE_ROLES, canNow, type Permission, type UserRole } from '../lib/permissions.js';
import { leftOf, settleStatus, toLineDtos, toOrderDto } from './orders.js';

/** Контакт сотрудника: телефон или почта, роль выдаётся аккаунту. */
const contactSchema = z.string().min(3);

export async function staffRoutes(app: FastifyInstance) {
  /**
   * Разбор кода: что в заказе и что с ним может сделать именно этот сотрудник.
   *
   * Один код на заказ, а набор действий определяется правами сканирующего.
   * Отдельные коды на вход и на бар были бы хуже: гость показывал бы не тот,
   * а защиты это всё равно не даёт — её даёт право, а не вид кода.
   */
  /**
   * Действующий отказ по владельцу заказа.
   *
   * Ищем и по телефону, и по почте: отказ выносится человеку, а каким
   * каналом он завёл аккаунт — его дело. Поиск только по телефону
   * пропускал бы всех, кто вошёл по почте.
   */
  const banFor = async (user: { phone: string | null; email: string | null }) => {
    const contacts = [user.phone, user.email].filter(Boolean) as string[];
    if (contacts.length === 0) return null;

    return db.banEntry.findFirst({ where: { phone: { in: contacts }, liftedAt: null } });
  };

  app.get('/staff/scan/:number', async (req) => {
    const auth = requireUser(req);
    const may = (permission: Permission) => canNow(auth.staffRole, !!auth.shiftId, permission);

    if (!may('scan:entry') && !may('scan:bar')) {
      // Сотруднику без смены говорим прямо, чего не хватает
      throw forbidden(
        auth.staffRole
          ? 'Откройте смену: сканировать можно только на смене'
          : 'Сканирование недоступно для вашей роли',
      );
    }

    const { number } = z.object({ number: z.string() }).parse(req.params);

    const order = await db.order.findUnique({
      where: { number },
      include: { lines: true, event: true, bookings: true, user: true },
    });

    if (!order) throw notFound('Заказ не найден');

    const ban = may('scan:entry') ? await banFor(order.user) : null;

    return {
      order: toScanDto(order, auth),
      // Отказ во входе показывается сразу и крупно: фейсер не должен
      // искать эту информацию отдельно, когда очередь стоит
      ban: ban
        ? { id: ban.id, reason: ban.reason, name: ban.name, since: ban.createdAt.toISOString() }
        : null,
      allowed: {
        entry: may('scan:entry'),
        bar: may('scan:bar'),
      },
    };
  });

  /** Пропустить выбранное число гостей, исключая личные приглашения. */
  app.post('/staff/scan/:number/admit', async (req) => {
    const auth = requirePermission(req, 'scan:entry');
    const { number } = z.object({ number: z.string() }).parse(req.params);
    const { manual, qty, ownerPresent, expectedRemaining } = z.object({ manual: z.boolean().default(false),
      qty: z.number().int().positive().max(100).optional(), ownerPresent: z.boolean().default(true),
      expectedRemaining: z.number().int().nonnegative().optional() }).parse(req.body ?? {});

    const result = await db.$transaction(async (tx) => {
      // Все исполнения и отмены одного заказа выстраиваются в очередь.
      await tx.$queryRaw`SELECT id FROM orders WHERE number = ${number} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { number }, include: { lines: true, user: true, event: true } });
      if (!order) throw notFound('Заказ не найден');
      if (order.status === 'cancelled') throw conflict('Заказ отменён', 'order_cancelled');
      if (order.status !== 'paid' && order.status !== 'used') {
        throw conflict('Заказ не оплачен', 'not_paid');
      }

      const ban = await banFor(order.user);
      if (ban) throw conflict(`Отказ во входе: ${ban.reason}`, 'banned');
      ensureServing(order.event);

      let count = 0;
      const available = order.lines.reduce((n, l) => n + entryLeft(l), 0);
      if (expectedRemaining !== undefined && available !== expectedRemaining) throw conflict('Число проходов изменилось — обновите заказ', 'stale_entry');
      let remaining = qty ?? available;
      if (remaining > available) throw conflict('Столько свободных проходов нет', 'too_many_entries');

      for (const line of order.lines) {
        const left = Math.min(entryLeft(line), remaining);
        if (left <= 0) continue;

        await tx.orderLine.update({
          where: { id: line.id },
          data: line.kind === 'ticket' ? { redeemed: { increment: left } } : { entryRedeemed: { increment: left } },
        });
        count += left;
        remaining -= left;
      }

      if (count > 0) {
        if (ownerPresent) await recordVisit(tx, order.userId, order.eventId!);
        await tx.order.update({ where: { id: order.id }, data: { usedAt: new Date() } });
        // Заказ закрывается, когда выдавать больше нечего: пересчёт
        // держим в той же транзакции, что и саму выдачу
        await settleStatus(tx, order.id);
      }

      if (count === 0) throw conflict('Нет неиспользованных билетов на вход', 'nothing_to_admit');
      await tx.staffAction.create({ data: {
        actorId: auth.sub, shiftId: auth.shiftId, orderId: order.id,
        kind: manual ? 'entry_manual' : 'entry_admitted',
        details: { number, guests: count, ownerPresent },
      } });
      return count;
    });

    return { admitted: result, order: await loadScan(number, auth) };
  });

  /** Выдать напитки: по одной позиции, возможно частично. */
  app.post('/staff/scan/:number/issue', async (req) => {
    const auth = requirePermission(req, 'scan:bar');
    const { number } = z.object({ number: z.string() }).parse(req.params);
    const { lineId, qty, expectedRedeemed } = z
      .object({ lineId: z.string(), qty: z.number().int().min(1).max(50), expectedRedeemed: z.number().int().min(0).optional() })
      .parse(req.body);

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE number = ${number} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { number }, include: { lines: true, event: true } });
      if (!order) throw notFound('Заказ не найден');
      if (order.status === 'cancelled') throw conflict('Заказ отменён', 'order_cancelled');
      if (order.status !== 'paid' && order.status !== 'used') {
        throw conflict('Заказ не оплачен', 'not_paid');
      }
      ensureServing(order.event);

      const line = order.lines.find((l) => l.id === lineId);
      if (!line || line.kind !== 'bar') throw notFound('Позиция не найдена');

      const left = line.qty - line.redeemed - line.cancelledQty;
      if (left <= 0) throw conflict('По этой позиции уже всё выдано', 'nothing_to_issue');
      if (qty > left) throw badRequest(`Осталось выдать только ${left}`, 'too_many');
      if (expectedRedeemed !== undefined && line.redeemed !== expectedRedeemed) throw conflict('Позиция уже изменилась, проверьте остаток', 'stale_issue');
      if (qty > line.readyQty) throw conflict('Сначала дождитесь готовности напитков', 'not_ready');

      await tx.orderLine.update({
        where: { id: line.id },
        data: { redeemed: { increment: qty }, readyQty: { decrement: qty } },
      });
      await settleStatus(tx, order.id);
      await tx.staffAction.create({ data: {
        actorId: auth.sub, shiftId: auth.shiftId, orderId: order.id, kind: 'bar_issued',
        details: { number, item: line.title, lineId, qty, preparedBy: line.preparedByName },
      } });
    });

    return { issued: qty, order: await loadScan(number, auth) };
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

  /**
   * Открыть смену.
   *
   * Открытая смена и есть «я сейчас работаю»: от неё зависит, что человек
   * может, и она же запрещает ему покупать. Отдельного переключателя
   * в приложении нет — иначе он разошёлся бы со сменой, и было бы непонятно,
   * кто на самом деле на входе.
   */
  app.post('/staff/shift/open', async (req) => {
    const auth = requireStaff(req);

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

  /**
   * Смены команды: кто сейчас работает и кто работал раньше.
   *
   * Управляющему нужно не открывать смены, а видеть их: кто на входе
   * прямо сейчас, кто ушёл, и что каждый успел за ночь. Открытые
   * идут первыми — это то, на что смотрят в первую очередь.
   */
  app.get('/staff/shifts', async (req) => {
    requirePermission(req, 'orders:read');
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);

    const shifts = await db.shift.findMany({
      // Открытые первыми: в Postgres NULL при обычной сортировке уходят
      // в конец, а смотрят в первую очередь именно на тех, кто в зале
      orderBy: [{ closedAt: { sort: 'asc', nulls: 'first' } }, { openedAt: 'desc' }],
      take: limit,
      include: { user: { select: { name: true, role: true } } },
    });

    // Сколько действий в каждой смене — одним запросом, а не по одному
    // на смену: список открывают часто, и десяток лишних запросов здесь
    // превратился бы в заметную задержку
    const counts = await db.staffAction.groupBy({
      by: ['shiftId'],
      where: { shiftId: { in: shifts.map((s) => s.id) } },
      _count: true,
    });

    const byShift = new Map(counts.map((c) => [c.shiftId, c._count]));

    return shifts.map((shift) => ({
      ...toShiftDto(shift),
      staff: { name: shift.user.name, role: shift.user.role },
      actions: byShift.get(shift.id) ?? 0,
    }));
  });

  // --- Журнал ---

  /** История исполнения: сотруднику свои действия, управляющему — команды. */
  app.get('/staff/fulfillments', async (req) => {
    const auth = requireStaff(req);
    const { cursor, orderId } = z.object({
      cursor: z.string().optional(), orderId: z.string().optional(),
    }).parse(req.query);
    const all = canNow(auth.staffRole, !!auth.shiftId, 'orders:read');
    const kinds: Prisma.EnumStaffActionKindFilter['in'] = auth.role === 'bartender'
      ? ['bar_issued', 'bar_started', 'bar_ready'] : auth.role === 'doorman'
        ? ['entry_admitted', 'entry_manual'] : ['bar_issued', 'bar_started', 'bar_ready', 'entry_admitted', 'entry_manual'];
    const rows = await db.staffAction.findMany({
      where: { kind: { in: kinds }, ...(!all ? { actorId: auth.sub } : {}), ...(orderId ? { orderId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: 51,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    return {
      items: rows.slice(0, 50).map((a) => ({
        id: a.id, kind: a.kind, actor: a.actor, orderId: a.orderId,
        shiftId: a.shiftId, details: a.details, createdAt: a.createdAt.toISOString(),
      })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  });

  /** Журнал действий. Сотрудник видит свои, управляющий — все. */
  app.get('/staff/actions', async (req) => {
    const auth = requireUser(req);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);

    const seesAll = canNow(auth.staffRole, !!auth.shiftId, 'orders:read');

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
      // Смена нужна, чтобы собрать итоги ночи по её записям
      shiftId: a.shiftId,
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
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
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
    const parsed = z
      .object({
        contact: contactSchema,
        role: z.enum(ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]),
        name: z.string().min(1).max(80).default('Сотрудник'),
      })
      .parse(req.body);

    const { channel, value } = parseContact(parsed.contact);

    // Должность назначается аккаунту, а не строке контакта: сотрудник
    // мог ещё ни разу не заходить — тогда аккаунт заводится сейчас,
    // и роль он получит при первом входе любым каналом.
    const existing =
      channel === 'phone'
        ? await db.user.findUnique({ where: { phone: value } })
        : await db.user.findUnique({ where: { email: value } });

    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data: { role: parsed.role } })
      : await db.user.create({
          data: {
            phone: channel === 'phone' ? value : null,
            email: channel === 'email' ? value : null,
            name: parsed.name,
            role: parsed.role,
            memberNo: await freeMemberNo(value),
          },
        });

    await logAction(auth.sub, 'role_granted', {
      details: { contact: value, role: parsed.role, userId: user.id },
    });

    return { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
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
      details: { contact: user.phone ?? user.email, previousRole: user.role, userId: id },
    });

    return { ok: true };
  });

  // --- Стоп-лист ---

  app.get('/staff/bans', async (req) => {
    requirePermission(req, 'scan:entry');
    const { all } = z
      .object({ all: z.coerce.boolean().default(false) })
      .parse(req.query);

    // Снятые отказы тоже показываем, когда просят: «этого уже прощали»
    // — часть решения не меньшая, чем сам отказ
    const bans = await db.banEntry.findMany({
      where: all ? {} : { liftedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return bans.map(toBanDto);
  });

  app.post('/staff/bans', async (req) => {
    const auth = requirePermission(req, 'scan:entry');
    const parsed = z
      .object({
        phone: contactSchema,
        reason: z.string().min(3).max(300),
        name: z.string().max(80).optional(),
      })
      .parse(req.body);
    const phone = parseContact(parsed.phone).value;

    const ban = await db.banEntry.upsert({
      where: { phone },
      update: { reason: parsed.reason, name: parsed.name, liftedAt: null, createdBy: auth.sub },
      create: { phone, reason: parsed.reason, name: parsed.name, createdBy: auth.sub },
    });

    return toBanDto(ban);
  });

  app.delete('/staff/bans/:id', async (req) => {
    requirePermission(req, 'scan:entry');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    // Снимаем отметкой, а не удалением: история отказов не должна пропадать
    const ban = await db.banEntry.update({ where: { id }, data: { liftedAt: new Date() } });
    return toBanDto(ban);
  });

  // --- Списки на сегодня ---

  /** Состав и сумма ограничены рабочими правами сотрудника на сервере. */
  app.get('/staff/orders', async (req) => {
    const auth = requireUser(req);
    const may = (permission: Permission) => canNow(auth.staffRole, !!auth.shiftId, permission);

    if (!may('scan:entry') && !may('scan:bar') && !may('orders:read')) {
      throw forbidden('Список заказов недоступен для вашей роли');
    }

    const { eventId } = z.object({ eventId: z.string().optional() }).parse(req.query);

    const orders = await db.order.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        status: { in: ['paid', 'used'] },
      },
      include: { lines: true, event: true, bookings: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Контакт гостя видит тот, кому он нужен по работе: фейсер вносит
    // по нему отказ, управляющий разбирает спорную ситуацию. Бармену
    // для выдачи напитка достаточно имени.
    const seesContact = may('scan:entry') || may('orders:read');

    return orders.map((o) => staffOrder(o, auth)).filter((o) => o.lines.length > 0).map((o) => ({
      ...toOrderDto(o),
      guest: {
        name: o.user.name,
        contact: seesContact ? (o.user.phone ?? o.user.email) : null,
      },
    }));
  });
}

type OrderWithAll = Prisma.OrderGetPayload<{
  include: { lines: true; event: true; bookings: true; user: true };
}>;

function staffOrder(order: OrderWithAll, auth: Auth): OrderWithAll {
  if (canNow(auth.staffRole, !!auth.shiftId, 'orders:read')) return order;
  const kind = auth.role === 'doorman' ? 'ticket' : 'bar';
  const lines = order.lines.filter((line) => line.kind === kind || (kind === 'ticket' && line.kind === 'table' && line.entryIncluded > 0))
    .map((line) => line.kind === 'table' ? { ...line, kind: 'ticket' as const, title: `${line.title} · вход`, priceKopecks: 0,
      qty: line.entryIncluded, redeemed: line.entryRedeemed, cancelledQty: line.cancelledQty > 0 ? line.entryIncluded : 0, entryIncluded: 0, entryRedeemed: 0 } : line);
  return { ...order, lines, bookings: [], pointsEarned: 0,
    totalKopecks: lines.reduce((sum, line) => sum + line.priceKopecks * (line.qty - line.cancelledQty), 0),
  };
}

function toScanDto(fullOrder: OrderWithAll, auth: Auth) {
  const order = staffOrder(fullOrder, auth);
  const left = leftOf;

  return {
    number: order.number,
    status: order.status,
    guest: { name: order.user.name, contact: auth.role === 'bartender' ? null : (order.user.phone ?? order.user.email) },
    event: order.event
      ? { id: order.event.id, title: order.event.title, date: order.event.startsAt.toISOString() }
      : null,
    entry: {
      total: order.lines.reduce((n, l) => n + (l.kind === 'ticket' ? l.qty - l.cancelledQty : l.kind === 'table' && !l.cancelledQty ? l.entryIncluded : 0), 0),
      left: order.lines.reduce((n, l) => n + entryLeft(l), 0),
    },
    bar: order.lines
      .filter((l) => l.kind === 'bar')
      .map((l) => ({ lineId: l.id, title: l.title, qty: l.qty, redeemed: l.redeemed, left: left(l) })),
    table: order.bookings[0]
      ? { guests: order.bookings[0].guests }
      : null,
    // Та же форма DTO, но только доступные сотруднику позиции.
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    totalKopecks: order.totalKopecks,
    pointsEarned: order.pointsEarned,
    qrPayload: `APPRAVE|${order.number}|${order.userId}|${order.eventId ?? '-'}`,
    lines: toLineDtos(order),
  };
}

async function loadScan(number: string, auth: Auth) {
  const order = await db.order.findUnique({
    where: { number },
    include: { lines: true, event: true, bookings: true, user: true },
  });
  return order ? toScanDto(order, auth) : null;
}

function toBanDto(ban: {
  id: string;
  phone: string;
  name: string | null;
  reason: string;
  createdAt: Date;
  liftedAt: Date | null;
}) {
  return {
    id: ban.id,
    contact: ban.phone,
    name: ban.name,
    reason: ban.reason,
    createdAt: ban.createdAt.toISOString(),
    liftedAt: ban.liftedAt?.toISOString() ?? null,
  };
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

/** Свободный номер карты: проверку занятости делает база. */
async function freeMemberNo(contact: string): Promise<string> {
  return allocateMemberNo(
    async (candidate) => (await db.user.count({ where: { memberNo: candidate } })) > 0,
    contact,
  );
}
