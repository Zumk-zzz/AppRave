import { adminService, inventoryService, type Order, type OrderLine } from '@/src/services';
import { redeemableOf } from '@/src/store/orders';

/**
 * Возвращает в продажу единицы одной строки заказа.
 *
 * Возвращается только то, что ещё не выдано: если гость уже забрал два
 * коктейля из трёх, на склад уходит один. Иначе списания и возвраты
 * разошлись бы с тем, что реально ушло за барную стойку.
 */
export async function restoreLine(order: Order, line: OrderLine, units?: number): Promise<number> {
  const count = Math.min(units ?? redeemableOf(line), redeemableOf(line));
  if (count <= 0) return 0;

  if (line.kind === 'bar' && line.refId) {
    await inventoryService.apply({
      barItemId: line.refId,
      kind: 'correction',
      delta: count,
      comment: `Возврат по заказу ${order.id}`,
      orderId: order.id,
    });
  }

  if (line.kind === 'ticket' && line.refId && order.eventId) {
    // Отрицательное количество — возврат билетов в продажу
    await adminService.consumeTickets(order.eventId, line.refId, -count);
  }

  // Стол возвращать некуда: занятость считается по живым броням заказа,
  // и снимается она сменой статуса самого заказа.
  return count;
}

/** Возвращает всё невыданное по заказу целиком. */
export async function restoreOrder(order: Order): Promise<void> {
  for (const line of order.lines) {
    await restoreLine(order, line);
  }
}

/** Можно ли ещё отменить эту строку. */
export function isLineCancellable(order: Order, line: OrderLine): boolean {
  return order.status !== 'cancelled' && redeemableOf(line) > 0;
}
