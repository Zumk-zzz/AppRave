import type { Order, OrderLine, OrderStatus } from '@/src/services/types';

/**
 * Чистая логика состояния заказа.
 *
 * Вынесена из стора отдельным модулем без зависимостей от React Native,
 * чтобы её можно было прогнать тестом в обычном node. Ошибка здесь стоит
 * дорого: она напрямую решает, пустят гостя внутрь или нет.
 */

/** Сколько единиц строки ещё можно выдать: не выдано и не отменено. */
export function redeemableOf(line: OrderLine): number {
  return Math.max(0, line.qty - line.redeemed - (line.cancelled ?? 0));
}

/** Строка закрыта, когда выдавать больше нечего. */
export function isLineClosed(line: OrderLine): boolean {
  return redeemableOf(line) === 0;
}

/**
 * Статус заказа выводится из строк, а не хранится отдельно:
 * отдельное поле неизбежно разъехалось бы с содержимым.
 *
 * Важное различение: «выдавать больше нечего» бывает по двум причинам —
 * всё выдали или всё отменили. Без этой развилки заказ, у которого гость
 * отменил все позиции, помечался как использованный, и в списке значился
 * как состоявшийся.
 */
export function deriveStatus(order: Order): OrderStatus {
  if (order.status === 'cancelled') return 'cancelled';

  // Стол не выдают — он либо есть, либо нет, и на закрытие заказа не влияет
  const relevant = order.lines.filter((l) => l.kind !== 'table');
  if (relevant.length === 0) return order.status;

  if (!relevant.every(isLineClosed)) return 'paid';

  // Всё закрыто. Если хоть что-то успели получить — заказ состоялся,
  // иначе это полная отмена.
  return relevant.some((l) => l.redeemed > 0) ? 'used' : 'cancelled';
}

export function withDerivedStatus(order: Order): Order {
  const status = deriveStatus(order);
  return status === order.status ? order : { ...order, status };
}
