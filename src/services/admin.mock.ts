import { useCatalogStore } from '@/src/store/catalog';
import type { AdminService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Операции записи в каталог.
 *
 * Отдельный сервис, а не методы в EventsService и BarService: чтение
 * доступно всем, запись — только администратору, и разделение на уровне
 * интерфейса делает это очевидным в коде, а не только в UI.
 */
export const mockAdminService: AdminService = {
  async saveEvent(event) {
    await delay(300);
    await useCatalogStore.getState().saveEvent(event);
  },

  async deleteEvent(id) {
    await delay(250);
    await useCatalogStore.getState().deleteEvent(id);
  },

  async saveBarItem(item, stock) {
    await delay(300);
    await useCatalogStore.getState().saveBarItem(item, stock);
  },

  async deleteBarItem(id) {
    await delay(250);
    await useCatalogStore.getState().deleteBarItem(id);
  },

  async saveTable(table) {
    await delay(250);
    const { taken, ...layout } = table;
    void taken; // занятость вычисляется на дату, в каталоге не хранится
    await useCatalogStore.getState().saveTable(layout);
  },

  async consumeTickets(eventId, ticketTypeId, qty) {
    await useCatalogStore.getState().consumeTickets(eventId, ticketTypeId, qty);
  },

  async resetCatalog() {
    await delay(300);
    await useCatalogStore.getState().reset();
  },
};
