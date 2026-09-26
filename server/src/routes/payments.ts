import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { readAuth, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { conflict, forbidden, notFound } from '../lib/http-error.js';
import { pointsForPurchase, tierForPoints } from '../lib/money.js';
import { loadOrder } from './orders.js';

/**
 * Оплата — заглушка.
 *
 * Форма сохранена та же, что будет у настоящего шлюза: клиент создаёт
 * платёж и получает ссылку, подтверждение приходит отдельным вызовом.
 * При подключении ЮKassa меняется только реализация этих двух ручек,
 * а порядок работы клиента остаётся прежним.
 *
 * Два правила, которые нельзя нарушать при замене на реальный шлюз:
 *  - заказ становится paid только по вебхуку, никогда по слову клиента;
 *  - обработчик идемпотентен: шлюзы шлют один вебхук по нескольку раз.
 */
export async function paymentRoutes(app: FastifyInstance) {
  /** Создать платёж по заказу. Возвращает то, что отдал бы шлюз. */
  app.post('/payments', async (req) => {
    const auth = requireUser(req);
    const { orderId } = z.object({ orderId: z.string() }).parse(req.body);

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
    if (order.status !== 'pending') throw conflict('Заказ не ожидает оплаты', 'not_pending');

    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      throw conflict('Время резерва истекло', 'reservation_expired');
    }

    const providerId = `stub_${order.id}`;

    const payment = await db.payment.upsert({
      where: { providerId },
      update: {},
      create: {
        orderId: order.id,
        provider: 'stub',
        providerId,
        status: 'created',
        amountKopecks: order.totalKopecks,
      },
    });

    return {
      paymentId: payment.id,
      providerId,
      amountKopecks: payment.amountKopecks,
      // У настоящего шлюза здесь будет ссылка на его форму оплаты
      confirmationUrl: null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
    };
  });

  /**
   * Подтверждение платежа.
   *
   * В заглушке вызывается вручную и играет роль вебхука. У реального
   * шлюза этот обработчик будет принимать его запрос и проверять подпись,
   * а не доверять клиенту.
   *
   * Пока подписи нет, единственная защита — адрес сервера. В своей сети
   * этого достаточно, а наружу — нет: зная номер заказа, подтвердить
   * чужую оплату смог бы кто угодно. Поэтому при открытом доступе
   * требуется токен владельца заказа. Настоящий шлюз токеном не
   * располагает, и когда он появится, здесь будет проверка подписи —
   * ровно в этом месте.
   */
  app.post('/webhooks/payment', async (req) => {
    const { providerId, status } = z
      .object({ providerId: z.string(), status: z.enum(['succeeded', 'failed']) })
      .parse(req.body);

    const payment = await db.payment.findUnique({
      where: { providerId },
      include: { order: { select: { userId: true } } },
    });
    if (!payment) throw notFound('Платёж не найден');

    if (env.PUBLIC_ACCESS) {
      const auth = readAuth(req);
      if (!auth || auth.sub !== payment.order.userId) {
        throw forbidden('Подтвердить оплату может только владелец заказа');
      }
    }

    // Повторная доставка того же события не должна менять состояние дважды
    if (payment.status === 'succeeded') {
      return { ok: true, alreadyProcessed: true, orderId: payment.orderId };
    }

    if (status === 'failed') {
      await db.payment.update({ where: { providerId }, data: { status: 'failed' } });
      return { ok: true, orderId: payment.orderId };
    }

    await db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.status !== 'pending') return;

      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
      const earned = pointsForPurchase(order.totalKopecks, user.tier);
      const nextPoints = user.points + earned;

      await tx.payment.update({ where: { providerId }, data: { status: 'succeeded' } });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          // Резерв больше не нужен: заказ оплачен и истечь не может
          expiresAt: null,
          pointsEarned: earned,
        },
      });

      await tx.tableBooking.updateMany({
        where: { orderId: order.id, status: 'pending' },
        data: { status: 'paid' },
      });

      // Уровень пересчитывается сразу, иначе следующая покупка пойдёт
      // по старой ставке начисления
      await tx.user.update({
        where: { id: user.id },
        data: { points: nextPoints, tier: tierForPoints(nextPoints) },
      });
    });

    return { ok: true, orderId: payment.orderId };
  });

  /** Состояние оплаты — клиент опрашивает после возврата из шлюза. */
  app.get('/payments/:providerId', async (req) => {
    const auth = requireUser(req);
    const { providerId } = z.object({ providerId: z.string() }).parse(req.params);

    const payment = await db.payment.findUnique({
      where: { providerId },
      include: { order: true },
    });

    if (!payment || payment.order.userId !== auth.sub) throw notFound('Платёж не найден');

    return { status: payment.status, order: await loadOrder(payment.orderId) };
  });
}
