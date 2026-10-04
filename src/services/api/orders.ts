import type { CheckoutItem, Order, OrdersService, OperationalTable } from '@/src/services/types';
import { entryAvailable } from '@/src/lib/fulfillment';
import { cached } from './cache';
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
  barTeam: () => request('/staff/bar/team'),
  async transferBar(order, lineId, toUserId, reason) {
    await request(`/staff/bar/${lineId}/transfer`, { method: 'POST', body: { toUserId, reason, expectedAssignee: order.lines.find((l) => l.id === lineId)?.preparedById } });
  },
  async floor(eventId) { return (await request<ApiOperationalTable[]>(`/staff/tables?eventId=${encodeURIComponent(eventId)}`)).map(mapOperationalTable); },
  async updateTable(table, state, responsibleId) { await request(`/staff/tables/${table.id}/state`, { method: 'POST', body: { state, responsibleId, expectedState: table.serviceState, confirmRemainingKopecks: Math.round(table.depositRemaining*100) } }); },
  async tableBooking(id) { const booking = await request<ApiOperationalTable | null>(`/orders/${id}/table`); return booking ? mapOperationalTable(booking) : null; },
  async spendDeposit(id, barItemId, qty, requestId) { return mapOrder(await request<ApiOrder>(`/orders/${id}/deposit/order`, { method: 'POST', body: { barItemId, qty, requestId } })); },
  async timeline(number) { const data = await request<{ order: ApiOrder; rows: import('../types').OrderActivity[] }>(`/staff/orders/${encodeURIComponent(number)}/timeline`); return { order: mapOrder(data.order), rows: data.rows }; },
  async byId(id) { return mapOrder(await request<ApiOrder>(`/orders/${id}`)); },
  async requestBar(id) { return mapOrder(await request<ApiOrder>(`/orders/${id}/bar/request`, { method: 'POST', body: {} })); },
  async prepareBar(order, lineId) {
    await request(`/staff/bar/${lineId}/prepare`, { method: 'POST', body: {} });
    return (await apiOrdersService.byNumber(order.number))!;
  },
  async readyBar(order, lineId, qty) {
    await request(`/staff/bar/${lineId}/ready`, { method: 'POST', body: { qty, expectedPreparing: order.lines.find((l) => l.id === lineId)?.preparingQty ?? 0 } });
    return (await apiOrdersService.byNumber(order.number))!;
  },
  invitations: (id) => request(`/orders/${id}/invitations`),
  createInvitation: (id, name, requestId) => request(`/orders/${id}/invitations`, { method: 'POST', body: { name, requestId } }),
  async revokeInvitation(token) { await request(`/invitations/${token}/revoke`, { method: 'POST', body: {} }); },
  invitation: (token) => request(`/invitations/${token}`),
  claimInvitation: (token) => request(`/invitations/${token}/claim`, { method: 'POST', body: {} }),
  async mine() {
    // Единственное место, где офлайн-копия по-настоящему нужна:
    // в клубе плохая связь, а гостю показывать QR на входе
    return cached('orders', async () => {
      const orders = await request<ApiOrder[]>('/orders');
      return orders.map(mapOrder);
    });
  },

  async forStaff(eventId, queueOnly = false) {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}${queueOnly ? '&queueOnly=true' : ''}` : '';
    const orders = await request<ApiOrder[]>(`/staff/orders${query}`);
    return orders.map(mapOrder);
  },

  async byNumber(number) {
    try {
      const path = number.startsWith('invite:') ? `/staff/invitations/${encodeURIComponent(number.slice(7))}` : `/staff/scan/${encodeURIComponent(number)}`;
      const res = await request<{ order: ApiOrder }>(path);
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

  async admit(order, manual = false, qty, ownerPresent = true) {
    if (order.invitationToken) {
      await request(`/staff/invitations/${order.invitationToken}/admit`, { method: 'POST', body: {} });
      return (await apiOrdersService.byNumber(`invite:${order.invitationToken}`))!;
    }
    const res = await request<{ order: ApiOrder }>(
      `/staff/scan/${encodeURIComponent(order.number)}/admit`,
      { method: 'POST', body: { manual, qty, ownerPresent, expectedRemaining: order.lines.reduce((n, l) => n + entryAvailable(l), 0) } },
    );
    return mapOrder(res.order);
  },

  async issue(order, lineId, count) {
    const res = await request<{ order: ApiOrder }>(
      `/staff/scan/${encodeURIComponent(order.number)}/issue`,
      { method: 'POST', body: { lineId, qty: count, expectedRedeemed: order.lines.find((l) => l.id === lineId)?.redeemed } },
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

  // Токен нужен, когда сервер открыт наружу: там подтвердить оплату
  // может только владелец заказа. В своей сети он просто не мешает.
  await request<{ ok: boolean }>('/webhooks/payment', {
    method: 'POST',
    body: { providerId: payment.providerId, status: 'succeeded' },
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

interface ApiOperationalTable {
  id: string; orderId: string; tableId: string; guests: string[]; serviceStatus: OperationalTable['serviceState'];
  responsibleId?: string | null; responsibleName?: string | null; depositInitialKopecks: number; depositRemainingKopecks: number;
  table?: { label: string }; order?: { number: string; user?: { name: string } };
}
function mapOperationalTable(t: ApiOperationalTable): OperationalTable {
  return { id:t.id, orderId:t.orderId, tableId:t.tableId, label:t.table?.label ?? 'Стол', orderNumber:t.order?.number ?? '', guestName:t.order?.user?.name ?? '', guests:t.guests,
    serviceState:t.serviceStatus, responsibleId:t.responsibleId ?? undefined, responsibleName:t.responsibleName ?? undefined, depositInitial:t.depositInitialKopecks/100, depositRemaining:t.depositRemainingKopecks/100 };
}
