import type { Order } from '@/src/services';

export interface DayBucket {
  /** Начало суток, ISO */
  date: string;
  revenue: number;
  orders: number;
}

export interface TopEntry {
  title: string;
  qty: number;
  revenue: number;
}

/** Отменённые заказы не участвуют нигде: деньги вернулись гостю. */
function paidOnly(orders: Order[]): Order[] {
  return orders.filter((o) => o.status !== 'cancelled');
}

/**
 * Выручка по дням за последние `days` суток.
 *
 * Возвращает и пустые дни тоже — без них график врёт: три продажи
 * за месяц выглядели бы как три дня подряд с ровной выручкой.
 */
export function revenueByDay(orders: Order[], days: number): DayBucket[] {
  const buckets = new Map<string, DayBucket>();

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(dayKey(d), { date: d.toISOString(), revenue: 0, orders: 0 });
  }

  for (const order of paidOnly(orders)) {
    const key = dayKey(new Date(order.createdAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;

    bucket.revenue += order.total;
    bucket.orders += 1;
  }

  return [...buckets.values()];
}

export function totalRevenue(orders: Order[]): number {
  return paidOnly(orders).reduce((sum, o) => sum + o.total, 0);
}

export function averageCheck(orders: Order[]): number {
  const paid = paidOnly(orders);
  if (paid.length === 0) return 0;
  return Math.round(totalRevenue(paid) / paid.length);
}

/** Топ позиций по выручке. Строки одного товара из разных заказов складываются. */
export function topLines(orders: Order[], kind: 'bar' | 'ticket', limit = 5): TopEntry[] {
  const map = new Map<string, TopEntry>();

  for (const order of paidOnly(orders)) {
    for (const line of order.lines) {
      if (line.kind !== kind) continue;

      const existing = map.get(line.title) ?? { title: line.title, qty: 0, revenue: 0 };
      existing.qty += line.qty;
      existing.revenue += line.price * line.qty;
      map.set(line.title, existing);
    }
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Доля отменённых заказов от всех, в процентах. */
export function cancelRate(orders: Order[]): number {
  if (orders.length === 0) return 0;
  const cancelled = orders.filter((o) => o.status === 'cancelled').length;
  return Math.round((cancelled / orders.length) * 100);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
