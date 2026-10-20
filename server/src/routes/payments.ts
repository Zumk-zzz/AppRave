import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { readAuth, requireCustomer, requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { conflict, forbidden, notFound } from '../lib/http-error.js';
import { pointsForPurchase, tierForPoints } from '../lib/money.js';
import { activity } from '../lib/operations.js';
import { isLive } from '../lib/events.js';
import { paymentCart } from '../lib/payment-cart.js';
import { alfaClient } from '../lib/alfa.js';
import { loadOrder } from './orders.js';

function bank() {
  if (!env.ALFA_USER_NAME || !env.ALFA_PASSWORD || !env.PAYMENT_RETURN_BASE_URL) throw conflict('Нужны тестовые реквизиты банка и адрес возврата', 'bank_not_configured');
  return alfaClient({ baseUrl: env.ALFA_API_BASE, userName: env.ALFA_USER_NAME, password: env.ALFA_PASSWORD, returnBaseUrl: env.PAYMENT_RETURN_BASE_URL, callbackUrl: env.ALFA_CALLBACK_URL });
}
type PaymentRaw = { confirmationUrl?: string; needsReview?: boolean; cart?: ReturnType<typeof paymentCart>; receiptEmail?: string | null };

/** Только проверенный сервером результат. Блокировки сериализуют повторы и отмену. */
async function complete(providerId: string, success: boolean) {
  return db.$transaction(async (tx) => {
    const initial = await tx.payment.findUniqueOrThrow({ where: { providerId } });
    await tx.$queryRaw`SELECT id FROM orders WHERE id=${initial.orderId} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { providerId } });
    if (['succeeded', 'refunded'].includes(payment.status)) return { alreadyProcessed: true, orderId: payment.orderId };
    if (!success) { await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed' } }); return { orderId: payment.orderId }; }
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { event: true, lines: true } });
    const cartChanged = order.status === 'pending' && paymentCart(order.lines).amountKopecks !== payment.amountKopecks;
    if (cartChanged && payment.provider === 'stub') throw conflict('Состав заказа изменился — обновите платёж', 'payment_cart_changed');
    if (cartChanged || order.status !== 'pending' || (order.expiresAt && order.expiresAt.getTime() <= Date.now()) || (order.event?.status !== 'published' || !isLive(order.event.startsAt))) {
      // Поздняя банковская оплата сохраняется, но освобождённый товар не выдаётся.
      if (payment.provider !== 'stub') {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded', raw: { ...(payment.raw as PaymentRaw), needsReview: true } as Prisma.InputJsonValue } });
        await activity(tx, order.id, 'payment_review', 'Банк подтвердил оплату после завершения резерва. Нужна сверка и решение администратора');
      }
      return { orderId: order.id, needsReview: true };
    }
    await tx.$queryRaw`SELECT id FROM users WHERE id=${order.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    const earned = pointsForPurchase(payment.amountKopecks, user.tier), nextPoints = user.points + earned;
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded' } });
    await tx.promoUse.updateMany({where:{orderId:order.id,state:'reserved'},data:{state:'used'}});
    await tx.order.update({ where: { id: order.id }, data: { status: 'paid', totalKopecks: payment.amountKopecks, paidAt: new Date(), expiresAt: null, pointsEarned: earned } });
    await tx.tableBooking.updateMany({ where: { orderId: order.id, status: 'pending' }, data: { status: 'paid' } });
    await tx.user.update({ where: { id: user.id }, data: { points: nextPoints, tier: tierForPoints(nextPoints) } });
    return { orderId: order.id };
  });
}
async function synchronize(providerId: string, gateway: typeof bank) {
  const payment = await db.payment.findUnique({ where: { providerId } });
  if (!payment || payment.provider !== 'alfa_test') throw notFound('Платёж не найден');
  if (payment.status === 'succeeded' || payment.status === 'refunded') return;
  const state = await gateway().status(providerId, { id: payment.orderId, amountKopecks: payment.amountKopecks });
  if (state.paid) await complete(providerId, true);
  else if (state.failed) await complete(providerId, false);
}

export function createPaymentRoutes(gateway: typeof bank = bank) {
return async function routes(app: FastifyInstance) {
  app.get('/payments/config', async () => ({ provider: env.PAYMENT_PROVIDER, testMode: true, fiscalization: 'not_configured' }));
  app.post('/payments', async (req) => {
    const auth = requireCustomer(req);
    const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true, event: true } });
      if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
      if (order.status !== 'pending') throw conflict('Заказ не ожидает оплаты', 'not_pending');
      if (!order.expiresAt || order.expiresAt.getTime() <= Date.now()) throw conflict('Время резерва истекло', 'reservation_expired');
      if (!order.event || order.event.status !== 'published' || !isLive(order.event.startsAt)) throw conflict('Вечеринка больше не доступна для оплаты', 'event_unavailable');
      const cart = paymentCart(order.lines);
      if (await tx.payment.count({ where: { orderId, provider: { not: env.PAYMENT_PROVIDER }, status: { in: ['created','succeeded'] } } })) throw conflict('У заказа уже есть платёж другого провайдера — нужна сверка', 'payment_provider_changed');
      const prior = await tx.payment.findFirst({ where: { orderId, provider: env.PAYMENT_PROVIDER, status: { in: ['created', 'succeeded'] } }, orderBy: { createdAt: 'desc' } });
      if (prior && prior.amountKopecks !== cart.amountKopecks && prior.provider !== 'stub') throw conflict('Состав платежа изменился', 'payment_cart_changed');
      let payment = prior;
      if (!payment) {
        if (env.PAYMENT_PROVIDER === 'alfa_test' && !order.receiptEmail) throw conflict('Укажите email для чека', 'receipt_email_required');
        const registered = env.PAYMENT_PROVIDER === 'stub' ? { providerId: `stub_${order.id}`, confirmationUrl: null } : await gateway().register({ id: order.id, number: order.number, amountKopecks: cart.amountKopecks, email: order.receiptEmail!, expiresAt: order.expiresAt });
        const raw = { cart, receiptEmail: order.receiptEmail, confirmationUrl: registered.confirmationUrl };
        payment = await tx.payment.upsert({ where: { providerId: registered.providerId }, update: { amountKopecks: cart.amountKopecks, status: 'created', raw }, create: { orderId, provider: env.PAYMENT_PROVIDER, providerId: registered.providerId, status: 'created', amountKopecks: cart.amountKopecks, raw } });
      } else if (payment.provider === 'stub' && payment.amountKopecks !== cart.amountKopecks) {
        payment = await tx.payment.update({ where: { id: payment.id }, data: { amountKopecks: cart.amountKopecks, raw: { cart, receiptEmail: order.receiptEmail } } });
      }
      await tx.order.update({ where: { id: order.id }, data: { totalKopecks: cart.amountKopecks } });
      return { paymentId: payment.id, provider: payment.provider, providerId: payment.providerId, amountKopecks: payment.amountKopecks, confirmationUrl: (payment.raw as PaymentRaw)?.confirmationUrl ?? null,
        expiresAt: order.expiresAt.toISOString(), receiptEmail: order.receiptEmail, cart, fiscalReceipt: { status: 'not_configured', url: null }, testMode: true };
    }, { timeout: 20000 });
  });

  // Демо-подтверждение никогда не работает для банковского платежа.
  app.post('/webhooks/payment', async (req) => {
    const { providerId, status } = z.object({ providerId: z.string(), status: z.enum(['succeeded', 'failed']) }).parse(req.body);
    const payment = await db.payment.findUnique({ where: { providerId }, include: { order: { select: { userId: true } } } });
    if (!payment) throw notFound('Платёж не найден');
    if (env.PAYMENT_PROVIDER !== 'stub' || payment.provider !== 'stub') throw forbidden('Банковскую оплату подтверждает только банк');
    if (await db.payment.count({ where: { orderId: payment.orderId, provider: { not: 'stub' }, status: { in: ['created','succeeded'] } } })) throw forbidden('У заказа есть банковский платёж — демонстрационное подтверждение недоступно');
    if (env.PUBLIC_ACCESS) { const auth = readAuth(req); if (!auth || auth.sub !== payment.order.userId) throw forbidden('Подтвердить оплату может только владелец заказа'); }
    return { ok: true, ...await complete(providerId, status === 'succeeded') };
  });

  // Callback — только сигнал перечитать состояние по авторизованному API банка.
  // Поля status/amount из входящего уведомления не подтверждают оплату.
  const checking = new Map<string, number>();
  const callback = async (req: import('fastify').FastifyRequest) => {
    const { mdOrder } = z.object({ mdOrder: z.string().min(1).max(100) }).parse(req.method === 'GET' ? req.query : req.body);
    if (env.PAYMENT_PROVIDER !== 'alfa_test') throw forbidden('Банковские уведомления не включены');
    const existing = await db.payment.findUnique({ where: { providerId: mdOrder } });
    if (!existing || existing.provider !== 'alfa_test') throw notFound('Платёж не найден');
    const now = Date.now();
    if (now - (checking.get(mdOrder) ?? 0) < 5000) return { ok: true };
    checking.set(mdOrder, now);
    for (const [key, time] of checking) if (now - time > 60000) checking.delete(key);
    try { await synchronize(mdOrder, gateway); } catch (error) { checking.delete(mdOrder); throw error; }
    return { ok: true };
  };
  app.get('/webhooks/alfa', callback);
  app.post('/webhooks/alfa', callback);

  app.get('/orders/:id/payment', async (req) => {
    const auth = requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await db.order.findUnique({ where: { id } });
    if (!order || order.userId !== auth.sub) throw notFound('Заказ не найден');
    const payment = await db.payment.findFirst({ where: { orderId: id }, orderBy: { createdAt: 'desc' } });
    if (!payment) return null;
    const raw = payment.raw as PaymentRaw | null;
    return { provider: payment.provider, providerId: payment.providerId, amountKopecks: payment.amountKopecks,
      confirmationUrl: raw?.confirmationUrl ?? null, expiresAt: order.expiresAt?.toISOString() ?? null,
      receiptEmail: raw?.receiptEmail ?? order.receiptEmail, cart: raw?.cart ?? { currency: 'RUB', amountKopecks: payment.amountKopecks, items: [] },
      fiscalReceipt: { status: 'not_configured', url: null }, testMode: true };
  });

  app.get('/payments/:providerId', async (req) => {
    const auth = requireUser(req);
    const { providerId } = z.object({ providerId: z.string() }).parse(req.params);
    const before = await db.payment.findUnique({ where: { providerId }, include: { order: true } });
    if (!before || before.order.userId !== auth.sub) throw notFound('Платёж не найден');
    if (before.provider === 'alfa_test') await synchronize(providerId, gateway);
    const payment = await db.payment.findUniqueOrThrow({ where: { providerId } });
    return { status: payment.status, needsReview: (payment.raw as PaymentRaw)?.needsReview ?? false, order: await loadOrder(payment.orderId), fiscalReceipt: { status: 'not_configured', url: null } };
  });
}

}
export const paymentRoutes = createPaymentRoutes();
