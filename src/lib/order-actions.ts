import type { BadgeTone } from '@/src/components';
import { redeemableOf } from '@/src/lib/order-status';
import type { Order, OrderLine, OrderStatus } from '@/src/services';

/**
 * Что показать про состояние заказа.
 *
 * Раньше рядом с этим жили функции возврата товара на склад. Теперь
 * возврат делает сервис заказов — в режиме сервера одной транзакцией,
 * в моках вручную. Повторять его в экранах нельзя: два места, где
 * списывается один и тот же товар, однажды разойдутся.
 */

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачено',
  used: 'Использован',
  cancelled: 'Отменён',
  expired: 'Резерв сгорел',
  refunded: 'Деньги возвращены',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'gold',
  paid: 'success',
  used: 'neutral',
  cancelled: 'danger',
  expired: 'danger',
  refunded: 'gold',
};

/** Можно ли ещё отменить эту строку. */
export function isLineCancellable(order: Order, line: OrderLine): boolean {
  return (order.status === 'paid' || order.status === 'pending') && redeemableOf(line) > 0;
}
