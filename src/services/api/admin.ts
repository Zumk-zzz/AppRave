import type {
  AdminService,
  BarItem,
  ClubEvent,
  InventoryService,
  StockItem,
  TableLayout,
} from '@/src/services/types';
import { request } from './client';
import { mapStockItem, mapStockMove, mapTableLayout, toKopecks } from './mappers';
import type { ApiStockItem, ApiStockMove, ApiTableLayout } from './mappers';

/**
 * Правка каталога и склада на сервере.
 *
 * Цены приложение считает в рублях, сервер хранит в копейках — перевод
 * идёт здесь и в мапперах, по одной границе на обе стороны.
 */

export const apiAdminService: AdminService = {
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
