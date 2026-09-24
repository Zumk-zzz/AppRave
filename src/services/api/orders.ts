import type { CheckoutItem, Order, OrdersService } from '@/src/services/types';
import { ApiError, request } from './client';
import { mapOrder, type ApiOrder } from './mappers';

/**
 * Заказы на сервере.
 *
 * Оплата идёт в три шага, как у настоящего шлюза: заказ резервирует
 * товар, платёж создаётся отдельно, и только подтверждение переводит
 * заказ в оплаченный. Сейчас подтверждение шлёт само приложение — это
 * заглушка. При подключении ЮKassa третий шаг придёт с её стороны,
 * а первые два останутся прежними.
 */

interface CreateBody {
  eventId: string;
  tickets: { ticketTypeId: string; qty: number }[];
  bar: { barItemId: string; qty: number }[];
  table?: { tableId: string; guests: string[] };
}

export const apiOrdersService: OrdersService = {
  async mine() {
    const orders = await request<ApiOrder[]>('/orders');
    return orders.map(mapOrder);
  },

  async forStaff(eventId) {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    const orders = await request<ApiOrder[]>(`/staff/orders${query}`);
    return orders.map(mapOrder);
  },

  async byNumber(number) {
    try {
      const res = await request<{ order: ApiOrder }>(`/staff/scan/${encodeURIComponent(number)}`);
      return mapOrder(res.order);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  async checkout(items) {
    const created: Order[] = [];

    for (const [eventId, lines] of groupByEvent(items)) {
      // Заказ без события сервер не примет: билет, стол и напиток
      // всегда относятся к конкретной ночи
      if (!eventId) continue;

      const order = await request<ApiOrder>('/orders', {
        method: 'POST',
        body: toCreateBody(eventId, lines),
        // Двойной тап по кнопке оплаты не создаст второй заказ
        idempotencyKey: makeIdempotencyKey(),
      });

      created.push(mapOrder(await pay(order)));
    }

    return created;
  },

  async cancel(orderId) {
    return mapOrder(await request<ApiOrder>(`/orders/${orderId}/cancel`, { method: 'POST' }));
  },

  async cancelLine(orderId, lineId, count) {
    const order = await request<ApiOrder>(`/orders/${orderId}/lines/${lineId}/cancel`, {
      method: 'POST',
      body: { qty: count },
    });
    return mapOrder(order);
  },

  async admit(order, manual = false) {
    const res = await request<{ order: ApiOrder }>(
      `/staff/scan/${encodeURIComponent(order.number)}/admit`,
      { method: 'POST', body: { manual } },
    );
    return mapOrder(res.order);
  },

  async issue(order, lineId, count) {
    const res = await request<{ order: ApiOrder }>(
      `/staff/scan/${encodeURIComponent(order.number)}/issue`,
      { method: 'POST', body: { lineId, qty: count } },
    );
    return mapOrder(res.order);
  },
};

/**
 * Оплата-заглушка: создаём платёж и сами же подтверждаем его.
 *
 * Подтверждение заказа приходит отдельным вызовом, а не в ответе на
 * создание, именно потому, что у настоящего шлюза так и будет: его
 * вебхук придёт на сервер, а не через телефон. Форма клиента при замене
 * не изменится — исчезнет только вторая строка.
 */
async function pay(order: ApiOrder): Promise<ApiOrder> {
  const payment = await request<{ providerId: string }>('/payments', {
    method: 'POST',
    body: { orderId: order.id },
  });

  await request<{ ok: boolean }>('/webhooks/payment', {
    method: 'POST',
    body: { providerId: payment.providerId, status: 'succeeded' },
    anonymous: true,
  });

  return request<ApiOrder>(`/orders/${order.id}`);
}

function groupByEvent(items: CheckoutItem[]): [string | undefined, CheckoutItem[]][] {
  const map = new Map<string | undefined, CheckoutItem[]>();
  for (const item of items) {
    map.set(item.eventId, [...(map.get(item.eventId) ?? []), item]);
  }
  return [...map.entries()];
}

function toCreateBody(eventId: string, items: CheckoutItem[]): CreateBody {
  const body: CreateBody = { eventId, tickets: [], bar: [] };

  for (const item of items) {
    if (item.kind === 'ticket') body.tickets.push({ ticketTypeId: item.refId, qty: item.qty });
    if (item.kind === 'bar') body.bar.push({ barItemId: item.refId, qty: item.qty });
    // Стол в заказе один: в корзине он лежит уникальной строкой
    if (item.kind === 'table') body.table = { tableId: item.refId, guests: item.guests ?? [] };
  }

  return body;
}

/** Ключ идемпотентности: живёт ровно одну попытку оформления. */
function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
