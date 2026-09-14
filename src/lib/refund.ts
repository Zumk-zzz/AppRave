import type { Order } from '@/src/services';

/**
 * За сколько часов до вечеринки закрывается отмена.
 *
 * Клуб к этому моменту уже закупил алкоголь и вывел персонал, поэтому
 * возврат в последний момент — это его убыток, а не бухгалтерская формальность.
 */
export const REFUND_CUTOFF_HOURS = 24;

/** Часов до начала события. Отрицательное значение — вечеринка уже прошла. */
export function hoursUntil(eventDate: string): number {
  return (new Date(eventDate).getTime() - Date.now()) / 3_600_000;
}

export type CancelBlockReason = 'status' | 'too-late' | 'past';

export interface CancelCheck {
  allowed: boolean;
  reason?: CancelBlockReason;
}

export function canCancel(order: Order): CancelCheck {
  if (order.status !== 'paid') return { allowed: false, reason: 'status' };
  if (!order.eventDate) return { allowed: true };

  const hours = hoursUntil(order.eventDate);
  if (hours <= 0) return { allowed: false, reason: 'past' };
  if (hours < REFUND_CUTOFF_HOURS) return { allowed: false, reason: 'too-late' };

  return { allowed: true };
}

export const CANCEL_BLOCK_TEXT: Record<CancelBlockReason, string> = {
  status: 'Этот заказ уже нельзя отменить',
  'too-late': `Отмена закрывается за ${REFUND_CUTOFF_HOURS} часа до начала`,
  past: 'Вечеринка уже прошла',
};
