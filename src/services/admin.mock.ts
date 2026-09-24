import { mockCatalog } from './catalog.mock';
import { mockRefund, refundSummary } from './orders.mock';
import type { AdminService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Правка каталога без сервера.
 *
 * Отдельный сервис, а не методы в EventsService и BarService: читать
 * может кто угодно, править — только по праву, и разделение на уровне
 * интерфейса делает это очевидным в коде, а не только в интерфейсе.
 *
 * Создание и обновление здесь делают одно и то же: в файле на телефоне
 * различать их незачем. На сервере это разные операции.
 */
export const mockAdminService: AdminService = {
  async events() {
    await delay(200);
    return mockCatalog.events();
  },

  async createEvent(event) {
    await delay(300);
    await mockCatalog.saveEvent(event);
  },

  async updateEvent(event) {
    await delay(300);
    await mockCatalog.saveEvent(event);
  },

  async deleteEvent(id) {
    await delay(250);
    await mockCatalog.deleteEvent(id);
  },

  async createBarItem(item, stock) {
    await delay(300);
    await mockCatalog.saveBarItem(item, stock);
  },

  async updateBarItem(item, stock) {
    await delay(300);
    await mockCatalog.saveBarItem(item, stock);
  },

  async deleteBarItem(id) {
    await delay(250);
    await mockCatalog.deleteBarItem(id);
  },

  async tables() {
    await delay(200);
    return mockCatalog.tables();
  },

  async createTable(table) {
    await delay(250);
    await mockCatalog.saveTable(table);
  },

  async updateTable(table) {
    await delay(250);
    await mockCatalog.saveTable(table);
  },

  async refundPreview(eventId) {
    const events = await mockCatalog.events();
    const status = events.find((e) => e.id === eventId)?.status ?? 'published';
    const summary = await refundSummary(eventId);

    return { ready: status === 'cancelled', status, ...summary };
  },

  async refundEvent(eventId, confirm) {
    const events = await mockCatalog.events();
    const event = events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    // Те же две проверки, что и на сервере: без них автономный режим
    // вёл бы себя иначе, и проверить сценарий на нём было бы нельзя
    if ((event.status ?? 'published') !== 'cancelled') {
      throw new Error('Сначала переведите вечеринку в «Отменена»');
    }
    if (confirm.trim() !== event.title.trim()) {
      throw new Error('Название не совпадает — возврат не выполнен');
    }

    return mockRefund(eventId);
  },

  async resetCatalog() {
    await delay(300);
    await mockCatalog.reset();
  },
};
