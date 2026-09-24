import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requirePermission } from '../auth/guard.js';
import { db } from '../db.js';
import { conflict, notFound } from '../lib/http-error.js';
import { tierForPoints } from '../lib/money.js';

/**
 * Возврат денег за отменённую вечеринку.
 *
 * Единственное действие в системе, которое двигает деньги обратно, —
 * и единственное, где случайное нажатие стоит реальных денег и доверия.
 * Поэтому оно защищено не окном «вы уверены?», а условиями, каждое из
 * которых нужно выполнить отдельно и осознанно:
 *
 *  1. Право `payments:refund` — оно есть только у администратора.
 *     Управляющий может отменить вечеринку, но не вернуть за неё деньги:
 *     отмена — решение операционное, возврат — денежное.
 *  2. Вечеринка уже должна быть переведена в «отменена». Это отдельное
 *     действие на отдельном экране, то есть два намеренных шага, а не один.
 *  3. В запросе нужно повторить название вечеринки слово в слово.
 *     Проверяется на сервере, а не только в интерфейсе: иначе защита
 *     обходится случайным повтором запроса.
 *
 * Повторный вызов безопасен: уже возвращённые заказы пропускаются.
 */
export async function refundRoutes(app: FastifyInstance) {
  /** Что произойдёт: сколько заказов, на какую сумму, скольких гостей. */
  app.get('/admin/events/:id/refund', async (req) => {
    requirePermission(req, 'payments:refund');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const event = await db.event.findUnique({ where: { id } });
    if (!event) throw notFound('Событие не найдено');

    const orders = await refundable(id);

    return {
      eventId: event.id,
      title: event.title,
      status: event.status,
      /** Возврат возможен только по отменённой вечеринке */
      ready: event.status === 'cancelled',
      orders: orders.length,
      guests: new Set(orders.map((o) => o.userId)).size,
      totalKopecks: orders.reduce((sum, o) => sum + o.totalKopecks, 0),
    };
  });

  app.post('/admin/events/:id/refund', async (req) => {
    const auth = requirePermission(req, 'payments:refund');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { confirm } = z.object({ confirm: z.string() }).parse(req.body);

    const event = await db.event.findUnique({ where: { id } });
    if (!event) throw notFound('Событие не найдено');

    if (event.status !== 'cancelled') {
      throw conflict(
        'Сначала переведите вечеринку в «Отменена» — деньги возвращают только по отменённой',
        'event_not_cancelled',
      );
    }

    // Название повторяется слово в слово: набрать его случайно нельзя
    if (confirm.trim() !== event.title.trim()) {
      throw conflict('Название не совпадает — возврат не выполнен', 'confirm_mismatch');
    }

    const orders = await refundable(id);
    let refunded = 0;
    let totalKopecks = 0;

    for (const order of orders) {
      const amount = await refundOrder(order.id);
      if (amount === null) continue;

      refunded += 1;
      totalKopecks += amount;
    }

    await db.staffAction.create({
      data: {
        actorId: auth.sub,
        kind: 'refund_issued',
        details: { event: event.title, eventId: event.id, orders: refunded, totalKopecks },
      },
    });

    return { refunded, totalKopecks, guests: new Set(orders.map((o) => o.userId)).size };
  });
}

/** Заказы, по которым ещё есть что возвращать. */
async function refundable(eventId: string) {
  return db.order.findMany({
    where: { eventId, status: { in: ['paid', 'used'] } },
    select: { id: true, userId: true, totalKopecks: true },
  });
}

/**
 * Возврат по одному заказу. Возвращает сумму или null, если возвращать нечего.
 *
 * Деньги возвращаются полностью, даже если гость успел получить напиток
 * до отмены: вечеринку отменил клуб, и его убыток не перекладывается на
 * гостя. А вот на склад возвращается только невыданное — иначе появились
 * бы бутылки, которых на полке нет.
 */
async function refundOrder(orderId: string): Promise<number | null> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { lines: true, payments: true },
    });

    if (!order) return null;
    // Повторный вызов не должен вернуть деньги дважды
    if (order.status !== 'paid' && order.status !== 'used') return null;

    for (const line of order.lines) {
      const left = Math.max(0, line.qty - line.redeemed - line.cancelledQty);
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
            comment: 'Вечеринка отменена',
          },
        });
      }
    }

    await tx.tableBooking.updateMany({
      where: { orderId: order.id, status: { in: ['pending', 'paid'] } },
      data: { status: 'cancelled' },
    });

    // Платёж помечается так же, как это сделал бы настоящий шлюз:
    // при переходе на ЮKassa здесь появится вызов её API возврата,
    // а всё остальное останется прежним
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'succeeded' },
      data: { status: 'refunded' },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'refunded', expiresAt: null },
    });

    // Баллы снимаются вместе с деньгами: иначе отменённая вечеринка
    // становится способом их накрутить
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    const points = Math.max(0, user.points - order.pointsEarned);

    await tx.user.update({
      where: { id: user.id },
      data: { points, tier: tierForPoints(points) },
    });

    return order.totalKopecks;
  });
}
