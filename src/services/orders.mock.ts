import AsyncStorage from '@react-native-async-storage/async-storage';

import { pointsForPurchase } from '@/src/lib/loyalty';
import { deriveStatus, redeemableOf } from '@/src/lib/order-status';
import { useCatalogStore } from '@/src/store/catalog';
import type { CheckoutItem, Order, OrderLine, OrdersService } from './types';

/**
 * Заказы без сервера.
 *
 * Живут на самом телефоне: приложение должно открываться и работать,
 * когда бэкенда нет вовсе. Возврат товара при отмене делается тут же,
 * руками — на сервере то же самое делает одна транзакция.
 *
 * Все заказы здесь «мои»: списка чужих покупок на устройстве взяться
 * неоткуда, поэтому сотрудник в этом режиме видит только то, что куплено
 * на этом же телефоне. Для демонстрации сценария этого хватает.
 */

// Заказы не секретны, поэтому AsyncStorage, а не secure-store:
// у последнего практический лимит около 2 КБ, а история растёт.
const ORDERS_KEY = 'apprave.orders';

let cache: Order[] | null = null;

async function all(): Promise<Order[]> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Order[]) : [];
    cache = parsed.map(migrate);
  } catch {
    // Повреждённая история не должна мешать покупать дальше.
    cache = [];
  }

  return cache;
}

async function save(next: Order[]): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  } catch {
    // Не сохранилось — заказ всё равно есть в памяти до перезапуска.
  }
}

/** Заменяет один заказ и возвращает его же — так же, как ответ сервера. */
async function replace(next: Order): Promise<Order> {
  const orders = await all();
  await save(orders.map((o) => (o.id === next.id ? next : o)));
  return next;
}

async function find(orderId: string): Promise<Order> {
  const order = (await all()).find((o) => o.id === orderId);
  if (!order) throw new Error('Заказ не найден');
  return order;
}

export const mockOrdersService: OrdersService = {
  async mine() {
    return all();
  },

  async forStaff(eventId) {
    const orders = await all();
    return eventId ? orders.filter((o) => o.eventId === eventId) : orders;
  },

  async byNumber(number) {
    return (await all()).find((o) => o.number === number) ?? null;
  },

  async checkout(items, events, user) {
    // Один заказ на вечеринку: на входе сканируют один QR за одну ночь,
    // а не общий чек на несколько дат.
    const byEvent = new Map<string, CheckoutItem[]>();
    for (const item of items) {
      const key = item.eventId ?? 'no-event';
      byEvent.set(key, [...(byEvent.get(key) ?? []), item]);
    }

    const created: Order[] = [];

    for (const [eventId, lines] of byEvent) {
      const event = events.find((e) => e.id === eventId);
      const total = lines.reduce((sum, i) => sum + i.price * i.qty, 0);
      const number = makeOrderNumber();

      created.push({
        id: number,
        number,
        createdAt: new Date().toISOString(),
        eventId: event?.id,
        eventTitle: event?.title,
        eventDate: event?.date,
        lines: lines.map((line, index) => toOrderLine(line, `${number}-${index}`)),
        total,
        pointsEarned: pointsForPurchase(total, user.tier),
        status: 'paid',
        qrPayload: `APPRAVE|${number}|${user.memberNo}|${event?.id ?? '-'}`,
      });
    }

    await save([...created, ...(await all())]);

    // Склад и остаток билетов приводятся в соответствие сразу: иначе
    // инвентаризация показывала бы товар, который уже продан.
    for (const order of created) {
      for (const line of order.lines) {
        await moveGoods(order, line, -line.qty);
      }
    }

    return created;
  },

  async cancel(orderId) {
    const order = await find(orderId);

    // Заказ не удаляем, а помечаем отменённым: история продаж должна
    // сойтись, а сканер на входе — знать, почему код не пускает.
    for (const line of order.lines) {
      await moveGoods(order, line, redeemableOf(line));
    }

    return replace({ ...order, status: 'cancelled' });
  },

  async cancelLine(orderId, lineId, count) {
    const order = await find(orderId);
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new Error('Позиция не найдена');

    const take = Math.min(count, redeemableOf(line));
    if (take <= 0) return order;

    // Возвращается только невыданное: если гость забрал два коктейля
    // из трёх, на склад уходит один.
    await moveGoods(order, line, take);

    return replace(
      withStatus({
        ...order,
        lines: order.lines.map((l) =>
          l.id === lineId ? { ...l, cancelled: (l.cancelled ?? 0) + take } : l,
        ),
      }),
    );
  },

  async admit(order) {
    const fresh = await find(order.id);

    const lines = fresh.lines.map((line) =>
      line.kind === 'ticket' ? { ...line, redeemed: line.redeemed + redeemableOf(line) } : line,
    );

    return replace(withStatus({ ...fresh, lines }));
  },

  async issue(order, lineId, count) {
    const fresh = await find(order.id);
    const line = fresh.lines.find((l) => l.id === lineId);
    if (!line) throw new Error('Позиция не найдена');

    const take = Math.min(count, redeemableOf(line));
    if (take <= 0) return fresh;

    const lines = fresh.lines.map((l) =>
      l.id === lineId ? { ...l, redeemed: l.redeemed + take } : l,
    );

    return replace(withStatus({ ...fresh, lines }));
  },
};

function withStatus(order: Order): Order {
  const status = deriveStatus(order);
  return status === order.status ? order : { ...order, status };
}

/**
 * Двигает товар: отрицательное количество — продажа, положительное — возврат.
 *
 * Стол не трогаем. Депозит — не складская позиция, а занятость считается
 * по живым заказам на дату и отдельно нигде не хранится.
 */
async function moveGoods(order: Order, line: OrderLine, delta: number): Promise<void> {
  if (delta === 0) return;

  const catalog = useCatalogStore.getState();

  if (line.kind === 'bar') {
    await catalog.applyStockMove({
      barItemId: line.refId,
      kind: delta < 0 ? 'sale' : 'correction',
      delta,
      comment: delta > 0 ? `Возврат по заказу ${order.number}` : undefined,
      orderId: order.id,
    });
  }

  if (line.kind === 'ticket' && order.eventId) {
    // Положительное количество для каталога — продажа, поэтому знак обратный
    await catalog.consumeTickets(order.eventId, line.refId, -delta);
  }
}

function toOrderLine(item: CheckoutItem, id: string): OrderLine {
  return {
    id,
    kind: item.kind,
    refId: item.refId,
    redeemed: 0,
    cancelled: 0,
    title: item.title,
    subtitle: item.subtitle,
    price: item.price,
    qty: item.qty,
    guests: item.guests,
  };
}

/** Номер вида ORD-8F3A — короткий, читается вслух на входе. */
function makeOrderNumber(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ORD-${tail}`;
}

/**
 * Приводит заказы, записанные прежними версиями, к текущей модели.
 *
 * В старых записях нет ни номера, ни идентификаторов строк, ни поля
 * redeemed — без подстановки расчёт остатка давал бы NaN. Заказ, когда-то
 * помеченный used, означает, что выдали по нему всё: иначе после
 * обновления по нему можно было бы пройти второй раз.
 */
function migrate(order: Order): Order {
  const wasUsed = order.status === 'used';

  return {
    ...order,
    number: order.number ?? order.id,
    lines: order.lines.map((line, index) => ({
      ...line,
      id: line.id ?? `${order.id}-${index}`,
      redeemed: line.redeemed ?? (wasUsed ? line.qty : 0),
      cancelled: line.cancelled ?? 0,
    })),
  };
}
