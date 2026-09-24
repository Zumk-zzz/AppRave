import AsyncStorage from '@react-native-async-storage/async-storage';

import { MOCK_BAR_MENU } from '@/src/data/bar';
import { MOCK_EVENTS } from '@/src/data/events';
import { DEFAULT_TABLES } from '@/src/data/tables';
import type {
  BarItem,
  ClubEvent,
  ClubTable,
  StockItem,
  StockMove,
  StockMoveKind,
} from './types';

/**
 * Каталог клуба без сервера: афиша, меню, столы и склад.
 *
 * До появления админки это были константы в бандле. Теперь данные
 * изменяемые и переживают перезапуск, но живут на самом телефоне —
 * приложение должно открываться и работать, когда бэкенда нет вовсе.
 *
 * Раньше всё это лежало в zustand-сторе, и сервисы читали прямо оттуда.
 * Стор при этом был и хранилищем, и кэшем экрана — при подключении
 * сервера такую конструкцию пришлось бы разрезать по живому. Теперь
 * хранилище здесь, а стор остался только кэшем.
 */

const CATALOG_KEY = 'apprave.catalog';

/** Хранимая часть стола: занятость на дату вычисляется, а не лежит в базе. */
export type TableLayout = Omit<ClubTable, 'taken'>;

interface Snapshot {
  events: ClubEvent[];
  barMenu: BarItem[];
  tables: TableLayout[];
  stock: StockItem[];
  moves: StockMove[];
}

let cache: Snapshot | null = null;

async function read(): Promise<Snapshot> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Snapshot>;
      // Сливаем с посевом: если в сохранённом снимке не окажется поля
      // из новой версии приложения, каталог не развалится.
      cache = { ...seed(), ...saved };
      return cache;
    }
  } catch {
    // Повреждённый каталог лечится посевом — это не повод падать.
  }

  cache = seed();
  return cache;
}

async function write(next: Snapshot): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(next));
  } catch {
    // Не сохранилось — правки живут до перезапуска.
  }
}

async function patch(part: Partial<Snapshot>): Promise<void> {
  await write({ ...(await read()), ...part });
}

export const mockCatalog = {
  async events(): Promise<ClubEvent[]> {
    return (await read()).events;
  },

  async barMenu(): Promise<BarItem[]> {
    return (await read()).barMenu;
  },

  async tables(): Promise<TableLayout[]> {
    return (await read()).tables;
  },

  async stock(): Promise<StockItem[]> {
    return (await read()).stock;
  },

  async moves(barItemId?: string): Promise<StockMove[]> {
    const all = (await read()).moves;
    return barItemId ? all.filter((m) => m.barItemId === barItemId) : all;
  },

  async saveEvent(event: ClubEvent): Promise<void> {
    const events = await this.events();
    const previous = events.find((e) => e.id === event.id);

    // Выпущенное правит администратор, проданное считает система:
    // при правке тиража остаток пересчитывается, а не затирается.
    const merged: ClubEvent = {
      ...event,
      tickets: event.tickets.map((ticket) => {
        const before = previous?.tickets.find((t) => t.id === ticket.id);
        const sold = before ? quantityOf(before) - before.available : 0;
        const quantity = quantityOf(ticket);

        return { ...ticket, quantity, available: Math.max(0, quantity - sold) };
      }),
    };

    await patch({ events: upsertById(events, merged) });
  },

  async deleteEvent(id: string): Promise<void> {
    await patch({ events: (await this.events()).filter((e) => e.id !== id) });
  },

  async consumeTickets(eventId: string, ticketTypeId: string, qty: number): Promise<void> {
    const events = (await this.events()).map((event) =>
      event.id !== eventId
        ? event
        : {
            ...event,
            tickets: event.tickets.map((t) =>
              t.id === ticketTypeId ? { ...t, available: Math.max(0, t.available - qty) } : t,
            ),
          },
    );

    await patch({ events });
  },

  async saveBarItem(item: BarItem, stockPatch?: Partial<StockItem>): Promise<void> {
    const snapshot = await read();
    const existing = snapshot.stock.find((s) => s.barItemId === item.id);

    // У новой позиции склада ещё нет — заводим строку, иначе товар
    // появится в меню, но будет невидим для инвентаризации.
    const stock = existing
      ? snapshot.stock.map((s) => (s.barItemId === item.id ? { ...s, ...stockPatch } : s))
      : [
          ...snapshot.stock,
          { barItemId: item.id, qty: 0, unit: 'шт', lowThreshold: 5, ...stockPatch },
        ];

    await patch({ barMenu: upsertById(snapshot.barMenu, item), stock });
  },

  async deleteBarItem(id: string): Promise<void> {
    const snapshot = await read();
    await patch({
      barMenu: snapshot.barMenu.filter((i) => i.id !== id),
      stock: snapshot.stock.filter((s) => s.barItemId !== id),
      moves: snapshot.moves.filter((m) => m.barItemId !== id),
    });
  },

  async saveTable(table: TableLayout): Promise<void> {
    await patch({ tables: upsertById(await this.tables(), table) });
  },

  async applyStockMove(input: {
    barItemId: string;
    kind: StockMoveKind;
    delta: number;
    comment?: string;
    orderId?: string;
  }): Promise<void> {
    const snapshot = await read();

    const move: StockMove = {
      id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...input,
    };

    const stock = snapshot.stock.map((s) =>
      // Остаток не уходит в минус: отрицательный склад означал бы,
      // что списали больше, чем было, и цифре нельзя верить.
      s.barItemId === input.barItemId ? { ...s, qty: Math.max(0, s.qty + input.delta) } : s,
    );

    await patch({ stock, moves: [move, ...snapshot.moves] });
  },

  /** Вернуть демонстрационные данные. */
  async reset(): Promise<void> {
    await write(seed());
  },
};

/** Сколько всего выпущено. У старых записей поля нет — считаем по остатку. */
function quantityOf(ticket: { quantity?: number; available: number }): number {
  return ticket.quantity ?? ticket.available;
}

/** Демонстрационные данные — состояние каталога «из коробки». */
function seed(): Snapshot {
  return {
    events: MOCK_EVENTS.map((e) => ({
      ...e,
      tickets: e.tickets.map((t) => ({ ...t, quantity: t.quantity ?? t.available })),
    })),
    barMenu: MOCK_BAR_MENU.map((i) => ({ ...i })),
    tables: DEFAULT_TABLES.map((t) => ({ ...t, blocked: false })),
    stock: MOCK_BAR_MENU.map((item) => ({
      barItemId: item.id,
      qty: seedQty(item),
      unit: seedUnit(item),
      lowThreshold: item.category === 'champagne' || item.category === 'strong' ? 3 : 12,
    })),
    moves: [],
  };
}

/** Бутылок держат единицы, порционного — десятки. */
function seedQty(item: BarItem): number {
  if (item.category === 'champagne') return item.id === 'b_dp' ? 2 : 8;
  if (item.category === 'strong') return 12;
  if (item.category === 'soft') return 90;
  return 40;
}

function seedUnit(item: BarItem): string {
  return item.category === 'champagne' || item.category === 'strong' ? 'бут' : 'шт';
}

function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  const exists = list.some((i) => i.id === next.id);
  return exists ? list.map((i) => (i.id === next.id ? next : i)) : [...list, next];
}
