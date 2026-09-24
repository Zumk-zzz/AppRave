import type {
  AdminService,
  BarItem,
  ClubEvent,
  InventoryService,
  StockItem,
  TableLayout,
} from '@/src/services/types';
import { request } from './client';
import {
  mapEvent,
  mapStockItem,
  mapStockMove,
  mapTableLayout,
  toKopecks,
  toRubles,
} from './mappers';
import type { ApiEvent, ApiStockItem, ApiStockMove, ApiTableLayout } from './mappers';

/**
 * Правка каталога и склада на сервере.
 *
 * Цены приложение считает в рублях, сервер хранит в копейках — перевод
 * идёт здесь и в мапперах, по одной границе на обе стороны.
 */

export const apiAdminService: AdminService = {
  async events() {
    const events = await request<ApiEvent[]>('/admin/events');
    return events.map(mapEvent);
  },

  async createEvent(event) {
    await request('/admin/events', { method: 'POST', body: toEventBody(event, true) });
  },

  async updateEvent(event) {
    await request(`/admin/events/${event.id}`, {
      method: 'PUT',
      body: toEventBody(event, false),
    });
  },

  async deleteEvent(id) {
    await request(`/admin/events/${id}`, { method: 'DELETE' });
  },

  async createBarItem(item, stock) {
    await request('/admin/bar', { method: 'POST', body: toBarBody(item, stock) });
  },

  async updateBarItem(item, stock) {
    await request(`/admin/bar/${item.id}`, { method: 'PUT', body: toBarBody(item, stock) });
  },

  async deleteBarItem(id) {
    await request(`/admin/bar/${id}`, { method: 'DELETE' });
  },

  async tables() {
    const tables = await request<ApiTableLayout[]>('/admin/tables');
    return tables.map(mapTableLayout);
  },

  async createTable(table) {
    await request('/admin/tables', { method: 'POST', body: toTableBody(table) });
  },

  async updateTable(table) {
    await request(`/admin/tables/${table.id}`, { method: 'PUT', body: toTableBody(table) });
  },

  async refundPreview(eventId) {
    const res = await request<{
      ready: boolean;
      status: 'draft' | 'published' | 'cancelled';
      orders: number;
      guests: number;
      totalKopecks: number;
    }>(`/admin/events/${eventId}/refund`);

    return {
      ready: res.ready,
      status: res.status,
      orders: res.orders,
      guests: res.guests,
      total: toRubles(res.totalKopecks),
    };
  },

  async refundEvent(eventId, confirm) {
    const res = await request<{ refunded: number; guests: number; totalKopecks: number }>(
      `/admin/events/${eventId}/refund`,
      { method: 'POST', body: { confirm } },
    );

    return { refunded: res.refunded, guests: res.guests, total: toRubles(res.totalKopecks) };
  },

  async resetCatalog() {
    // Сервер такого не умеет намеренно: сброс стёр бы проданное вместе
    // с историей. Кнопка в интерфейсе при работе с сервером не показывается.
    throw new Error('Сброс каталога доступен только в автономном режиме');
  },
};

export const apiInventoryService: InventoryService = {
  async stock() {
    const stock = await request<ApiStockItem[]>('/stock');
    return stock.map(mapStockItem);
  },

  async moves(barItemId) {
    const query = barItemId ? `?barItemId=${encodeURIComponent(barItemId)}` : '';
    const moves = await request<ApiStockMove[]>(`/stock/moves${query}`);
    return moves.map(mapStockMove);
  },

  async apply(input) {
    await request('/stock/moves', { method: 'POST', body: input });
  },
};

function toEventBody(event: ClubEvent, isNew: boolean) {
  return {
    title: event.title,
    subtitle: event.subtitle,
    date: new Date(event.date).toISOString(),
    genre: event.genre,
    ageLimit: event.ageLimit,
    lineup: event.lineup,
    description: event.description,
    cover: event.cover,
    status: event.status ?? 'published',
    tickets: event.tickets.map((t) => ({
      // У нового события идентификаторы типов придуманы телефоном —
      // сервер выдаст свои, поэтому их не отправляем
      id: isNew ? undefined : t.id,
      name: t.name,
      description: t.description,
      priceKopecks: toKopecks(t.price),
      quantity: t.quantity ?? t.available,
    })),
  };
}

function toBarBody(item: BarItem, stock?: Partial<StockItem>) {
  return {
    name: item.name,
    description: item.description,
    priceKopecks: toKopecks(item.price),
    category: item.category,
    volume: item.volume,
    popular: item.popular ?? false,
    available: item.available,
    stock: stock
      ? { qty: stock.qty, unit: stock.unit, lowThreshold: stock.lowThreshold }
      : undefined,
  };
}

function toTableBody(table: TableLayout) {
  return {
    label: table.label,
    zone: table.zone,
    seats: table.seats,
    depositKopecks: toKopecks(table.deposit),
    blocked: table.blocked,
    x: table.x,
    y: table.y,
    w: table.w,
    h: table.h,
  };
}
