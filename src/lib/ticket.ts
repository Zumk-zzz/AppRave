import type { Order, OrderLine } from '@/src/services';
import { redeemableOf } from '@/src/store/orders';

/** Префикс в QR — отсекает посторонние коды до поиска по базе. */
const PREFIX = 'APPRAVE';

export interface ParsedTicket {
  /** Короткий номер заказа: по нему заказ и ищется */
  number: string;
  /** Признак владельца кода: номер карты в моках, идентификатор на сервере */
  holder: string;
  eventId: string;
}

/**
 * Разбирает содержимое QR-кода.
 * Возвращает null для любого чужого кода — на входе к сканеру подносят
 * что угодно, от штрихкода с бутылки до чужого проездного.
 */
export function parseQrPayload(raw: string): ParsedTicket | null {
  const parts = raw.split('|');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;

  const [, number, holder, eventId] = parts;
  if (!number) return null;

  return { number, holder, eventId };
}

export type ScanVerdict =
  | 'ok'
  | 'nothing-left'
  | 'cancelled'
  | 'unpaid'
  | 'wrong-event'
  | 'not-found'
  | 'foreign';

export interface BarPosition {
  /** Идентификатор строки: по нему сервер понимает, что выдавать */
  lineId: string;
  title: string;
  subtitle?: string;
  qty: number;
  redeemed: number;
  left: number;
}

export interface ScanSummary {
  verdict: ScanVerdict;
  order?: Order;
  /** Проход: сколько всего билетов и сколько ещё не использовано */
  entry: { total: number; left: number };
  /** Позиции бара, которые ещё можно выдать или уже выданы */
  bar: BarPosition[];
  table?: { title: string; guests: string[] };
}

const EMPTY: Omit<ScanSummary, 'verdict' | 'order'> = { entry: { total: 0, left: 0 }, bar: [] };

/**
 * Разбор отсканированного кода.
 *
 * Возвращает не один вердикт «пускать или нет», а состав заказа: вход,
 * напитки и стол по отдельности. Один заказ может содержать всё сразу,
 * и гасятся эти части в разные моменты — на входе и потом у бара.
 *
 * Дата события намеренно не проверяется по «сегодня»: вечеринка идёт
 * после полуночи, и такая сверка отсекала бы гостей, пришедших в 00:30.
 * Совпадение с нужной вечеринкой проверяется по выбранному событию.
 */
export function judgeScan(raw: string, orders: Order[], expectedEventId?: string): ScanSummary {
  const parsed = parseQrPayload(raw);
  if (!parsed) return { verdict: 'foreign', ...EMPTY };

  return judgeOrder(orders.find((o) => o.number === parsed.number) ?? null, expectedEventId);
}

/**
 * Вердикт по уже найденному заказу.
 *
 * Отдельно от разбора кода, потому что искать заказ приходится на
 * сервере: чужая покупка на телефоне сотрудника взяться не может.
 */
export function judgeOrder(order: Order | null, expectedEventId?: string): ScanSummary {
  if (!order) return { verdict: 'not-found', ...EMPTY };

  const summary = describe(order);

  if (order.status === 'cancelled' || order.status === 'expired') {
    return { ...summary, verdict: 'cancelled', order };
  }

  // Неоплаченный резерв внутрь не пускает: деньги за него не пришли
  if (order.status === 'pending') return { ...summary, verdict: 'unpaid', order };

  if (expectedEventId && order.eventId !== expectedEventId) {
    return { ...summary, verdict: 'wrong-event', order };
  }

  const hasSomething = summary.entry.left > 0 || summary.bar.some((b) => b.left > 0);
  return { ...summary, verdict: hasSomething ? 'ok' : 'nothing-left', order };
}

/** Раскладывает заказ на вход, бар и стол. */
export function describe(order: Order): Omit<ScanSummary, 'verdict' | 'order'> {
  const tickets = order.lines.filter((l) => l.kind === 'ticket');
  const tableLine = order.lines.find((l) => l.kind === 'table');

  const bar: BarPosition[] = order.lines
    .filter((line) => line.kind === 'bar')
    .map((line) => ({
      lineId: line.id,
      title: line.title,
      subtitle: line.subtitle,
      qty: line.qty,
      redeemed: line.redeemed,
      left: redeemableOf(line),
    }));

  return {
    entry: {
      total: tickets.reduce((n, l) => n + l.qty, 0),
      left: tickets.reduce((n, l) => n + redeemableOf(l), 0),
    },
    bar,
    table: tableLine ? { title: tableLine.title, guests: tableLine.guests ?? [] } : undefined,
  };
}

/** Что показать крупным шрифтом сразу после сканирования. */
export const VERDICT_TITLE: Record<ScanVerdict, string> = {
  ok: 'Код действителен',
  'nothing-left': 'Всё уже выдано',
  cancelled: 'Заказ отменён',
  unpaid: 'Заказ не оплачен',
  'wrong-event': 'Другая вечеринка',
  'not-found': 'Заказ не найден',
  foreign: 'Это не код AppRave',
};

export const VERDICT_HINT: Record<ScanVerdict, string> = {
  ok: 'Отметьте, что именно выдали',
  'nothing-left': 'По этому заказу проход отмечен и напитки выданы',
  cancelled: 'Заказ вернули, обслуживать по нему нечего',
  unpaid: 'Бронь есть, оплата не прошла — пусть оплатит в приложении',
  'wrong-event': 'Код настоящий, но оформлен на другую дату',
  'not-found': 'Код наш, но такого заказа нет',
  foreign: 'Посторонний код — попросите открыть билет в приложении',
};

/** Успешен ли вердикт: от этого зависит цвет карточки и вибрация. */
export function isPositive(verdict: ScanVerdict): boolean {
  return verdict === 'ok';
}

export function lineLeft(line: OrderLine): number {
  return redeemableOf(line);
}
