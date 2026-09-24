import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireCustomer, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { isLive } from '../lib/events.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';
import { orderNumber } from '../lib/ids.js';
import { pointsForPurchase, tierForPoints } from '../lib/money.js';

const createSchema = z.object({
  eventId: z.string().min(1),
  tickets: z
    .array(z.object({ ticketTypeId: z.string().min(1), qty: z.number().int().min(1).max(10) }))
    .default([]),
  table: z
    .object({ tableId: z.string().min(1), guests: z.array(z.string().min(1)).max(20).default([]) })
    .optional(),
  bar: z
    .array(z.object({ barItemId: z.string().min(1), qty: z.number().int().min(1).max(50) }))
    .default([]),
});

export async function orderRoutes(app: FastifyInstance) {
  /**
   * Создание заказа.
   *
   * Цены берутся из базы, а не из тела запроса: клиент присылает только
   * что и сколько. Иначе достаточно подменить одно число, чтобы купить
   * VIP за рубль.
   */
  app.post('/orders', async (req, reply) => {
    const auth = requireCustomer(req);
    const body = createSchema.parse(req.body);

    if (body.tickets.length === 0 && !body.table && body.bar.length === 0) {
      throw badRequest('Пустой заказ', 'empty_order');
    }

    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      throw badRequest('Нужен заголовок Idempotency-Key', 'missing_idempotency_key');
    }

    // Повтор того же запроса возвращает исходный заказ, а не создаёт второй.
    // Спасает от двойного тапа по кнопке и от ретрая после обрыва сети.
    const existing = await db.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existing) {
      const order = await loadOrder(existing.orderId);
      if (order) return reply.code(200).send(order);
    }

    const event = await db.event.findUnique({ where: { id: body.eventId } });
    if (!event || event.status !== 'published') throw notFound('Событие недоступно');

    // Прошедшую вечеринку нельзя купить задним числом. Проверка здесь,
    // а не только в афише: афиша прячет, но прямой запрос с id проходил
    // бы мимо, и в отчётах появились бы продажи после закрытия.
    if (!isLive(event.startsAt)) {
      throw conflict('Эта вечеринка уже прошла', 'event_finished');
    }

    const expiresAt = new Date(Date.now() + env.RESERVATION_MINUTES * 60_000);

    try {
      const orderId = await db.$transaction(async (tx) => {
        const lines: Prisma.OrderLineCreateManyOrderInput[] = [];
        let total = 0;

        // --- Билеты ---
        for (const item of body.tickets) {
          const type = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
          if (!type || type.eventId !== event.id) throw notFound('Тип билета не найден');

          // Условный UPDATE вместо «прочитать-проверить-записать»:
          // между этими шагами и возникает гонка за последний билет.
          const affected = await tx.$executeRaw`
            UPDATE ticket_types
               SET sold = sold + ${item.qty}
             WHERE id = ${item.ticketTypeId}
               AND sold + ${item.qty} <= quantity
          `;

          if (affected === 0) {
            throw conflict(`Билетов «${type.name}» не осталось`, 'tickets_sold_out');
          }

          total += type.priceKopecks * item.qty;
          lines.push({
            kind: 'ticket',
            ticketTypeId: type.id,
            title: `${event.title} · ${type.name}`,
            subtitle: type.description,
            priceKopecks: type.priceKopecks,
            qty: item.qty,
          });
        }

        // --- Бар ---
        for (const item of body.bar) {
          const barItem = await tx.barItem.findUnique({ where: { id: item.barItemId } });
          if (!barItem) throw notFound('Позиция бара не найдена');
          if (!barItem.available) throw conflict(`«${barItem.name}» снята с продажи`, 'bar_unavailable');

          const affected = await tx.$executeRaw`
            UPDATE stock
               SET qty = qty - ${item.qty}
             WHERE bar_item_id = ${item.barItemId}
               AND qty >= ${item.qty}
          `;

          if (affected === 0) {
            throw conflict(`«${barItem.name}» закончилась на складе`, 'out_of_stock');
          }

          total += barItem.priceKopecks * item.qty;
          lines.push({
            kind: 'bar',
            barItemId: barItem.id,
            title: barItem.name,
            subtitle: barItem.volume,
            priceKopecks: barItem.priceKopecks,
            qty: item.qty,
          });
        }

        // --- Стол ---
        let tableToBook: { id: string; depositKopecks: number; label: string } | null = null;
        if (body.table) {
          const table = await tx.clubTable.findUnique({ where: { id: body.table.tableId } });
          if (!table) throw notFound('Стол не найден');
          if (table.blocked) throw conflict('Стол снят с продажи', 'table_blocked');

          total += table.depositKopecks;
          tableToBook = table;
          lines.push({
            kind: 'table',
            tableId: table.id,
            title: `Стол ${table.label}`,
            subtitle: event.title,
            priceKopecks: table.depositKopecks,
            qty: 1,
          });
        }

        const user = await tx.user.findUniqueOrThrow({ where: { id: auth.sub } });

        const order = await tx.order.create({
          data: {
            number: orderNumber(),
            userId: user.id,
            eventId: event.id,
            status: 'pending',
            totalKopecks: total,
            pointsEarned: pointsForPurchase(total, user.tier),
            expiresAt,
            lines: { createMany: { data: lines } },
          },
        });

        if (tableToBook && body.table) {
          // Двойную бронь ловит частичный уникальный индекс в базе.
          // Проверять «свободен ли стол» заранее бессмысленно: между
          // проверкой и вставкой его успеют занять.
          await tx.tableBooking.create({
            data: {
              orderId: order.id,
              eventId: event.id,
              tableId: tableToBook.id,
              guests: body.table.guests,
              status: 'pending',
            },
          });
        }

        // Движения склада пишем после создания заказа — нужен его id
        for (const item of body.bar) {
          await tx.stockMove.create({
            data: {
              barItemId: item.barItemId,
              kind: 'sale',
              delta: -item.qty,
              orderId: order.id,
            },
          });
        }

        await tx.idempotencyKey.create({
          data: { key: idempotencyKey, userId: user.id, orderId: order.id },
        });

        return order.id;
      });

      const created = await loadOrder(orderId);
      return reply.code(201).send(created);
    } catch (e) {
      // P2002 — нарушение уникальности, здесь это всегда занятый стол
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('Этот стол уже забронирован', 'table_taken');
      }
      throw e;
    }
  });

  /** Мои заказы. */
  app.get('/orders', async (req) => {
    const auth = requireUser(req);

    const orders = await db.order.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: 'desc' },
      include: { lines: true, event: true, bookings: true },
    });

    return orders.map(toOrderDto);
  });

  app.get('/orders/:id', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const order = await db.order.findUnique({
      where: { id },
      include: { lines: true, event: true, bookings: true },
    });

    // Чужой заказ для пользователя не существует
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');

    return toOrderDto(order);
  });

  /** Отмена с возвратом товара в продажу. */
  app.post('/orders/:id/cancel', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const order = await db.order.findUnique({
      where: { id },
      include: { lines: true, event: true },
    });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');

    if (order.status !== 'pending' && order.status !== 'paid') {
      throw conflict('Этот заказ уже нельзя отменить', 'not_cancellable');
    }

    ensureCancellable(order.event?.startsAt);

    await releaseOrder(order.id, 'cancelled');
    return loadOrder(order.id);
  });

  /**
   * Отмена части заказа: гость передумал брать один коктейль из трёх.
   *
   * Возвращается только невыданное. Количество проверяется тем же
   * условным UPDATE, что и продажа: две отмены одной строки, пришедшие
   * одновременно, не должны вернуть на склад вдвое больше, чем куплено.
   */
  app.post('/orders/:id/lines/:lineId/cancel', async (req) => {
    const auth = requireUser(req);
    const { id, lineId } = z
      .object({ id: z.string(), lineId: z.string() })
      .parse(req.params);
    const { qty } = z
      .object({ qty: z.number().int().min(1).max(50) })
      .parse(req.body ?? {});

    const order = await db.order.findUnique({
      where: { id },
      include: { lines: true, event: true },
    });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');

    if (order.status !== 'pending' && order.status !== 'paid') {
      throw conflict('Этот заказ уже нельзя менять', 'not_cancellable');
    }

    ensureCancellable(order.event?.startsAt);

    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw notFound('Позиция не найдена');

    if (leftOf(line) < qty) {
      throw conflict(`Отменить можно только ${leftOf(line)}`, 'too_many');
    }

    await db.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE order_lines
           SET cancelled_qty = cancelled_qty + ${qty}
         WHERE id = ${lineId}
           AND qty - redeemed - cancelled_qty >= ${qty}
      `;

      if (affected === 0) throw conflict('Позицию уже отменили', 'too_many');

      if (line.kind === 'ticket' && line.ticketTypeId) {
        await tx.$executeRaw`
          UPDATE ticket_types
             SET sold = GREATEST(0, sold - ${qty})
           WHERE id = ${line.ticketTypeId}
        `;
      }

      if (line.kind === 'bar' && line.barItemId) {
        await tx.$executeRaw`
          UPDATE stock SET qty = qty + ${qty} WHERE bar_item_id = ${line.barItemId}
        `;
        await tx.stockMove.create({
          data: {
            barItemId: line.barItemId,
            kind: 'refund',
            delta: qty,
            orderId: order.id,
            comment: 'Отмена позиции',
          },
        });
      }

      if (line.kind === 'table' && line.tableId) {
        // Стол освобождается сразу: частичной брони не бывает
        await tx.tableBooking.updateMany({
          where: { orderId: order.id, tableId: line.tableId, status: { in: ['pending', 'paid'] } },
          data: { status: 'cancelled' },
        });
      }

      await settleStatus(tx, order.id);
    });

    return loadOrder(order.id);
  });
}

/**
 * Приводит статус заказа в соответствие со строками.
 *
 * Статус выводится, а не хранится сам по себе: иначе он неизбежно
 * разъедется с содержимым. Важно различать две причины, по которым
 * выдавать больше нечего: всё выдали (заказ состоялся) или всё отменили
 * (заказ не состоялся). Без этой развилки полностью отменённый заказ
 * числился бы использованным.
 *
 * Стол не в счёт: его не выдают, и на закрытие заказа он не влияет.
 */
async function settleStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) return;
  if (order.status !== 'pending' && order.status !== 'paid') return;

  const relevant = order.lines.filter((l) => l.kind !== 'table');
  if (relevant.length === 0 || !relevant.every((l) => leftOf(l) === 0)) return;

  const used = relevant.some((l) => l.redeemed > 0);

  await tx.order.update({
    where: { id: order.id },
    data: {
      status: used ? 'used' : 'cancelled',
      usedAt: used ? (order.usedAt ?? new Date()) : null,
      expiresAt: null,
    },
  });

  if (!used) {
    await tx.tableBooking.updateMany({
      where: { orderId: order.id, status: { in: ['pending', 'paid'] } },
      data: { status: 'cancelled' },
    });
  }
}

export { settleStatus };

/**
 * За сколько часов до начала закрывается отмена.
 *
 * К этому моменту клуб уже закупил алкоголь и вывел персонал, поэтому
 * поздний возврат — его прямой убыток. Правило проверяется на сервере,
 * а не только кнопкой в приложении: кнопку можно обойти запросом.
 */
export const REFUND_CUTOFF_HOURS = 24;

function ensureCancellable(startsAt: Date | null | undefined): void {
  if (!startsAt) return;

  const hoursLeft = (startsAt.getTime() - Date.now()) / 3_600_000;

  if (hoursLeft <= 0) throw conflict('Вечеринка уже прошла', 'event_started');
  if (hoursLeft < REFUND_CUTOFF_HOURS) {
    throw conflict(
      `Отмена закрывается за ${REFUND_CUTOFF_HOURS} часа до начала`,
      'too_late_to_cancel',
    );
  }
}

/**
 * Возвращает товар заказа в продажу и переводит заказ в конечный статус.
 *
 * Одна функция на отмену и на истечение резерва: расходятся они только
 * итоговым статусом, а разъехавшиеся копии этой логики означали бы, что
 * склад однажды перестанет сходиться.
 */
export async function releaseOrder(orderId: string, status: 'cancelled' | 'expired') {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) return;
    if (order.status !== 'pending' && order.status !== 'paid') return;

    for (const line of order.lines) {
      // Возвращается только невыданное. Если гость успел забрать один
      // коктейль из трёх, на склад уходят два: вернуть все три значило бы
      // поставить на полку бутылку, которую уже выпили.
      const left = leftOf(line);
      if (left === 0) continue;

      if (line.kind === 'ticket' && line.ticketTypeId) {
        await tx.$executeRaw`
          UPDATE ticket_types
             SET sold = GREATEST(0, sold - ${left})
           WHERE id = ${line.ticketTypeId}
        `;
      }

      if (line.kind === 'bar' && line.barItemId) {
        await tx.$executeRaw`
          UPDATE stock SET qty = qty + ${left} WHERE bar_item_id = ${line.barItemId}
        `;
        await tx.stockMove.create({
          data: {
            barItemId: line.barItemId,
            kind: 'refund',
            delta: left,
            orderId: order.id,
            comment: status === 'expired' ? 'Резерв истёк' : 'Отмена заказа',
          },
        });
      }

      // Отмеченное отменённым прямо в строке: иначе по составу заказа
      // не видно, что именно вернулось, а что гость успел получить
      await tx.orderLine.update({
        where: { id: line.id },
        data: { cancelledQty: line.cancelledQty + left },
      });
    }

    await tx.tableBooking.updateMany({
      where: { orderId: order.id, status: { in: ['pending', 'paid'] } },
      data: { status: status === 'expired' ? 'expired' : 'cancelled' },
    });

    await tx.order.update({ where: { id: order.id }, data: { status, expiresAt: null } });

    // Баллы уходят вместе с покупкой. Иначе отмена превращается
    // в способ их накрутить: купил, получил начисление, отменил.
    // Начисляются они при оплате, поэтому у истёкшего резерва снимать
    // нечего — там pointsEarned ещё не попал на счёт.
    if (order.paidAt && order.pointsEarned > 0) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
      const points = Math.max(0, user.points - order.pointsEarned);

      await tx.user.update({
        where: { id: user.id },
        data: { points, tier: tierForPoints(points) },
      });
    }
  });
}

export async function loadOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: { lines: true, event: true, bookings: true },
  });
  return order ? toOrderDto(order) : null;
}

type OrderRow = Prisma.OrderGetPayload<{
  include: { lines: true; event: true; bookings: true };
}>;

type LineRow = OrderRow['lines'][number];

/** Сколько единиц строки ещё можно выдать: не выдано и не отменено. */
export function leftOf(line: { qty: number; redeemed: number; cancelledQty: number }): number {
  return Math.max(0, line.qty - line.redeemed - line.cancelledQty);
}

/**
 * Строки заказа в виде, одинаковом для гостя и для сканера.
 *
 * Один маппер на оба ответа: если состав строки где-то разойдётся,
 * приложение начнёт показывать гостю одно, а сотруднику другое.
 */
export function toLineDtos(order: OrderRow) {
  return order.lines.map((l: LineRow) => ({
    id: l.id,
    kind: l.kind,
    refId: l.ticketTypeId ?? l.barItemId ?? l.tableId ?? '',
    title: l.title,
    subtitle: l.subtitle,
    priceKopecks: l.priceKopecks,
    qty: l.qty,
    redeemed: l.redeemed,
    cancelledQty: l.cancelledQty,
    // Список гостей живёт у брони, но показывается в строке стола
    guests:
      l.kind === 'table'
        ? (order.bookings.find((b) => b.tableId === l.tableId)?.guests ?? [])
        : undefined,
  }));
}

export function toOrderDto(order: OrderRow) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    totalKopecks: order.totalKopecks,
    pointsEarned: order.pointsEarned,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    event: order.event
      ? { id: order.event.id, title: order.event.title, date: order.event.startsAt.toISOString() }
      : null,
    lines: toLineDtos(order),
    guests: order.bookings.flatMap((b) => b.guests),
    // QR собираем здесь, чтобы формат жил в одном месте
    qrPayload: `APPRAVE|${order.number}|${order.userId}|${order.eventId ?? '-'}`,
  };
}
