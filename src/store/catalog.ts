import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

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
} from '@/src/services/types';

const CATALOG_KEY = 'apprave.catalog';

/** Хранимая часть стола: занятость на дату вычисляется, а не лежит в базе. */
export type TableLayout = Omit<ClubTable, 'taken'>;

interface CatalogSnapshot {
  events: ClubEvent[];
  barMenu: BarItem[];
  tables: TableLayout[];
  stock: StockItem[];
  moves: StockMove[];
}

interface CatalogState extends CatalogSnapshot {
  loaded: boolean;

  load: () => Promise<void>;
  reset: () => Promise<void>;

  saveEvent: (event: ClubEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  consumeTickets: (eventId: string, ticketTypeId: string, qty: number) => Promise<void>;

  saveBarItem: (item: BarItem, stock?: Partial<StockItem>) => Promise<void>;
  deleteBarItem: (id: string) => Promise<void>;

  saveTable: (table: TableLayout) => Promise<void>;

  applyStockMove: (input: {
    barItemId: string;
    kind: StockMoveKind;
    delta: number;
    comment?: string;
    orderId?: string;
  }) => Promise<void>;
}

/**
 * Каталог клуба: афиша, меню, столы и склад.
 *
 * До появления админки это были константы в бандле. Теперь данные
 * изменяемые и переживают перезапуск, но экраны об этом не знают —
 * они по-прежнему ходят только через src/services.
 */
export const useCatalogStore = create<CatalogState>((set, get) => ({
  ...seed(),
  loaded: false,

  async load() {
    try {
      const raw = await AsyncStorage.getItem(CATALOG_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<CatalogSnapshot>;
        // Сливаем с посевом: если в сохранённом снимке не окажется поля
        // из новой версии приложения, каталог не развалится.
        set({ ...seed(), ...saved, loaded: true });
        return;
      }
    } catch {
      // Повреждённый каталог лечится посевом — это не повод падать.
    }
    set({ ...seed(), loaded: true });
  },

  async reset() {
    const fresh = seed();
    set({ ...fresh, loaded: true });
    await persist(fresh);
  },

  async saveEvent(event) {
    const events = upsertById(get().events, event);
    set({ events });
    await persistFrom(get);
  },

  async deleteEvent(id) {
    set({ events: get().events.filter((e) => e.id !== id) });
    await persistFrom(get);
  },

  async consumeTickets(eventId, ticketTypeId, qty) {
    const events = get().events.map((event) =>
      event.id !== eventId
        ? event
        : {
            ...event,
            tickets: event.tickets.map((t) =>
              t.id === ticketTypeId ? { ...t, available: Math.max(0, t.available - qty) } : t,
            ),
          },
    );

    set({ events });
    await persistFrom(get);
  },

  async saveBarItem(item, stockPatch) {
    const barMenu = upsertById(get().barMenu, item);

    // У новой позиции склада ещё нет — заводим строку, иначе товар
    // появится в меню, но будет невидим для инвентаризации.
    const existing = get().stock.find((s) => s.barItemId === item.id);
    const stock = existing
      ? get().stock.map((s) => (s.barItemId === item.id ? { ...s, ...stockPatch } : s))
      : [
          ...get().stock,
          {
            barItemId: item.id,
            qty: 0,
            unit: 'шт',
            lowThreshold: 5,
            ...stockPatch,
          },
        ];

    set({ barMenu, stock });
    await persistFrom(get);
  },

  async deleteBarItem(id) {
    set({
      barMenu: get().barMenu.filter((i) => i.id !== id),
      stock: get().stock.filter((s) => s.barItemId !== id),
      moves: get().moves.filter((m) => m.barItemId !== id),
    });
    await persistFrom(get);
  },

  async saveTable(table) {
    set({ tables: upsertById(get().tables, table) });
    await persistFrom(get);
  },

  async applyStockMove({ barItemId, kind, delta, comment, orderId }) {
    const move: StockMove = {
      id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      barItemId,
      kind,
      delta,
      comment,
      orderId,
      createdAt: new Date().toISOString(),
    };

    const stock = get().stock.map((s) =>
      // Остаток не уходит в минус: отрицательный склад означал бы,
      // что списали больше, чем было, и цифре нельзя верить.
      s.barItemId === barItemId ? { ...s, qty: Math.max(0, s.qty + delta) } : s,
    );

    set({ stock, moves: [move, ...get().moves] });
    await persistFrom(get);
  },
}));

/** Демонстрационные данные — состояние каталога «из коробки». */
function seed(): CatalogSnapshot {
  return {
    events: MOCK_EVENTS.map((e) => ({ ...e, tickets: e.tickets.map((t) => ({ ...t })) })),
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

async function persistFrom(get: () => CatalogState) {
  const { events, barMenu, tables, stock, moves } = get();
  await persist({ events, barMenu, tables, stock, moves });
}

async function persist(snapshot: CatalogSnapshot) {
  try {
    await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(snapshot));
  } catch {
    // Не сохранилось — правки живут до перезапуска.
  }
}
