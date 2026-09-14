import type { FastifyBaseLogger } from 'fastify';

import { db } from '../db.js';
import { releaseOrder } from '../routes/orders.js';

const INTERVAL_MS = 60_000;

/**
 * Возвращает в продажу товар заказов, у которых истёк резерв.
 *
 * Без этой задачи неоплаченный заказ держал бы билет вечно: гость
 * дошёл до формы оплаты, закрыл приложение — и место потеряно навсегда.
 *
 * Простой интервал в процессе, а не очередь: раз в минуту пройтись по
 * нескольким строкам дешевле, чем заводить Redis и воркер ради этого.
 * Когда серверов станет больше одного, задачу нужно будет вынести —
 * иначе каждый экземпляр начнёт делать одну и ту же работу.
 */
export function startExpirationJob(log: FastifyBaseLogger): () => void {
  let running = false;

  const tick = async () => {
    // Защита от наложения: если прошлый проход ещё идёт, пропускаем
    if (running) return;
    running = true;

    try {
      const stale = await db.order.findMany({
        where: { status: 'pending', expiresAt: { lt: new Date() } },
        select: { id: true, number: true },
        take: 100,
      });

      for (const order of stale) {
        await releaseOrder(order.id, 'expired');
        log.info({ order: order.number }, 'резерв истёк, товар возвращён в продажу');
      }
    } catch (err) {
      // Сбой одного прохода не должен останавливать задачу навсегда
      log.error({ err }, 'ошибка при возврате просроченных резервов');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, INTERVAL_MS);
  // Таймер не должен удерживать процесс при остановке сервиса
  timer.unref();

  void tick();

  return () => clearInterval(timer);
}
