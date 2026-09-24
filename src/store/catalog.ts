import { create } from 'zustand';

import {
  adminService,
  barService,
  eventsService,
  inventoryService,
  type BarItem,
  type ClubEvent,
  type StockItem,
  type StockMove,
  type TableLayout,
} from '@/src/services';

export type { TableLayout };

/**
 * Каталог на экране: афиша, меню, столы и склад.
 *
 * Как и заказы, это кэш, а не хранилище. Данные приходят из сервисов —
 * из базы или из файла на телефоне, экраны об этом не знают. Правки
 * тоже идут через сервис, а потом список перечитывается: местная копия,
 * поправленная «заодно», рано или поздно разошлась бы с настоящей.
 */
interface CatalogState {
  events: ClubEvent[];
  barMenu: BarItem[];
  tables: TableLayout[];
  stock: StockItem[];
  moves: StockMove[];
  loaded: boolean;
  /** Читалась ли служебная часть: от этого зависит, что обновлять дальше */
  staffLoaded: boolean;

  /**
   * Прочитать каталог заново.
   *
   * Склад и схема зала — часть служебная: гостю она не нужна, и сервер
   * её не отдаст. Поэтому читается только тогда, когда есть кому смотреть.
   */
  load: (staff?: boolean) => Promise<void>;

  saveEvent: (event: ClubEvent, isNew: boolean) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  saveBarItem: (item: BarItem, isNew: boolean, stock?: Partial<StockItem>) => Promise<void>;
  deleteBarItem: (id: string) => Promise<void>;

  saveTable: (table: TableLayout, isNew: boolean) => Promise<void>;

  applyStockMove: (input: {
    barItemId: string;
    kind: 'receipt' | 'writeoff' | 'correction';
    delta: number;
    comment?: string;
  }) => Promise<void>;

  reset: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  events: [],
  barMenu: [],
  tables: [],
  stock: [],
  moves: [],
  loaded: false,
  staffLoaded: false,

  async load(staff = get().staffLoaded) {
    // Сбой одной части не должен оставить остальные незагруженными:
    // без склада админка работает, без афиши приложение пустое.
    const [events, barMenu, tables, stock, moves] = await Promise.all([
      // Тому, кто правит каталог, нужен полный список — с черновиками
      // и прошедшими. Остальным хватает афиши.
      (staff ? adminService.events() : eventsService.list()).catch(() => get().events),
      barService.menu().catch(() => get().barMenu),
      staff ? adminService.tables().catch(() => get().tables) : get().tables,
      staff ? inventoryService.stock().catch(() => get().stock) : get().stock,
      staff ? inventoryService.moves().catch(() => get().moves) : get().moves,
    ]);

    set({ events, barMenu, tables, stock, moves, loaded: true, staffLoaded: staff });
  },

  async saveEvent(event, isNew) {
    await (isNew ? adminService.createEvent(event) : adminService.updateEvent(event));
    await get().load();
  },

  async deleteEvent(id) {
    await adminService.deleteEvent(id);
    await get().load();
  },

  async saveBarItem(item, isNew, stock) {
    await (isNew
      ? adminService.createBarItem(item, stock)
      : adminService.updateBarItem(item, stock));
    await get().load();
  },

  async deleteBarItem(id) {
    await adminService.deleteBarItem(id);
    await get().load();
  },

  async saveTable(table, isNew) {
    await (isNew ? adminService.createTable(table) : adminService.updateTable(table));
    await get().load();
  },

  async applyStockMove(input) {
    await inventoryService.apply(input);
    await get().load();
  },

  async reset() {
    await adminService.resetCatalog();
    await get().load();
  },
}));
