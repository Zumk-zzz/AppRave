import type { Order } from '@/src/services';

/** Префикс в QR — отсекает посторонние коды до поиска по базе. */
const PREFIX = 'APPRAVE';

export interface ParsedTicket {
  orderId: string;
  memberNo: string;
  eventId: string;
}

/**
 * Разбирает содержимое QR-кода билета.
 * Возвращает null для любого чужого кода — на входе люди подносят
 * к сканеру что угодно, от штрихкода с бутылки до чужого проездного.
 */
export function parseQrPayload(raw: string): ParsedTicket | null {
  const parts = raw.split('|');

  if (parts.length !== 4 || parts[0] !== PREFIX) return null;

  const [, orderId, memberNo, eventId] = parts;
  if (!orderId) return null;

  return { orderId, memberNo, eventId };
}

export type ScanVerdict = 'ok' | 'already-used' | 'cancelled' | 'wrong-event' | 'not-found' | 'foreign';

export interface ScanResult {
  verdict: ScanVerdict;
  order?: Order;
}

/**
 * Решение по отсканированному коду.
 *
 * Дата события не проверяется намеренно: вечеринка идёт после полуночи,
 * и сравнение с «сегодня» отсекало бы гостей, пришедших в 00:30.
 * Сверку с нужным событием делает администратор, выбрав его в сканере.
 */
export function judgeScan(raw: string, orders: Order[], expectedEventId?: string): ScanResult {
  const parsed = parseQrPayload(raw);
  if (!parsed) return { verdict: 'foreign' };

  const order = orders.find((o) => o.id === parsed.orderId);
  if (!order) return { verdict: 'not-found' };

  if (order.status === 'cancelled') return { verdict: 'cancelled', order };
  if (order.status === 'used') return { verdict: 'already-used', order };

  if (expectedEventId && order.eventId !== expectedEventId) {
    return { verdict: 'wrong-event', order };
  }

  return { verdict: 'ok', order };
}

export const VERDICT_TITLE: Record<ScanVerdict, string> = {
  ok: 'Проходите',
  'already-used': 'Уже использован',
  cancelled: 'Заказ отменён',
  'wrong-event': 'Другая вечеринка',
  'not-found': 'Билет не найден',
  foreign: 'Это не билет AppRave',
};

export const VERDICT_HINT: Record<ScanVerdict, string> = {
  ok: 'Отметьте проход, чтобы билет нельзя было использовать дважды',
  'already-used': 'По этому коду уже проходили',
  cancelled: 'Билет вернули, вход по нему закрыт',
  'wrong-event': 'Код действителен, но на другую дату',
  'not-found': 'Код наш, но такого заказа нет',
  foreign: 'Посторонний код — попросите открыть билет в приложении',
};
