import { create } from 'zustand';

import { isLineClosed, redeemableOf } from '@/src/lib/order-status';
import { forgetReminder, rememberReminder } from '@/src/lib/reminders';
import { ordersService, type ClubEvent, type Order, type User } from '@/src/services';
import type { CartItem } from './cart';

/**
 * Заказы на экране.
 *
 * Стор — кэш, а не источник правды: считает и меняет заказы сервис,
 * здесь только то, что уже показано. Раньше вся логика выдачи и отмены
 * жила прямо тут, и при переносе на сервер её пришлось бы держать в двух
 * местах сразу — списания неизбежно разошлись бы между базой и телефоном.
 */
interface OrdersState {
  /** Мои покупки */
  orders: Order[];
  /** Заказы смены: список на входе, очередь бара, сводка администратора */
  staffOrders: Order[];
  loaded: boolean;
  /** Идёт загрузка списка смены — экраны показывают это состояние */
  loadingStaff: boolean;

  load: () => Promise<void>;
  loadStaff: (eventId?: string) => Promise<void>;

  /** Превратить корзину в заказы — по одному на каждую вечеринку. */
  checkout: (items: CartItem[], events: ClubEvent[], user: User) => Promise<Order[]>;

  /** Отмена заказа гостем: билет перестаёт пускать на вход. */
  cancel: (orderId: string) => Promise<void>;
  /** Отменить ещё не выданные единицы одной позиции. */
  cancelLine: (orderId: string, lineId: string, count: number) => Promise<void>;

  /** Заказ по номеру из QR. Для сканера: чужого заказа в кэше нет. */
  byNumber: (number: string) => Promise<Order | null>;
  /** Отметить проход: гасит все билетные строки разом. */
  admit: (order: Order, manual?: boolean) => Promise<Order>;
  /** Выдать единицы позиции бара. */
  issue: (order: Order, lineId: string, count: number) => Promise<Order>;

  /** Забыть загруженное: при выходе чужие заказы на экране остаться не должны. */
  clear: () => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  staffOrders: [],
  loaded: false,
  loadingStaff: false,

  async load() {
    try {
      set({ orders: await ordersService.mine(), loaded: true });
    } catch {
      // Сервер недоступен — история пуста, но покупать это не мешает
      set({ loaded: true });
    }
  },

  async loadStaff(eventId) {
    set({ loadingStaff: true });
    try {
      set({ staffOrders: await ordersService.forStaff(eventId) });
    } catch {
      set({ staffOrders: [] });
    } finally {
      set({ loadingStaff: false });
    }
  },

  async checkout(items, events, user) {
    const created = await ordersService.checkout(items.map(toCheckoutItem), events, user);

    // Напоминание ставится после создания заказа: до этого у него нет id
    for (const order of created) {
      await rememberReminder(order);
    }

    set({ orders: [...created, ...get().orders] });
    return created;
  },

  async cancel(orderId) {
    // Снимаем напоминание: получить «ваша вечеринка через три часа»
    // по отменённому билету — худший вид уведомления.
    await forgetReminder(orderId);

    merge(set, get, await ordersService.cancel(orderId));
  },

  async cancelLine(orderId, lineId, count) {
    merge(set, get, await ordersService.cancelLine(orderId, lineId, count));
  },

  async byNumber(number) {
    // Свои заказы уже загружены — лишний запрос за ними не нужен
    const known = get().orders.find((o) => o.number === number);
    if (known) return known;

    return ordersService.byNumber(number);
  },

  clear() {
    set({ orders: [], staffOrders: [], loaded: false });
  },

  async admit(order, manual) {
    const fresh = await ordersService.admit(order, manual);
    merge(set, get, fresh);
    return fresh;
  },

  async issue(order, lineId, count) {
    const fresh = await ordersService.issue(order, lineId, count);
    merge(set, get, fresh);
    return fresh;
  },
}));

/**
 * Обновляет заказ в обоих списках.
 *
 * Один и тот же заказ сотрудник видит в списке смены, а его владелец —
 * среди своих покупок. Обновлять только один список означало бы, что
 * после выдачи напитка экран рядом продолжает показывать старое.
 */
function merge(
  set: (partial: Partial<OrdersState>) => void,
  get: () => OrdersState,
  next: Order,
): void {
  const swap = (list: Order[]) => list.map((o) => (o.id === next.id ? next : o));

  set({ orders: swap(get().orders), staffOrders: swap(get().staffOrders) });
}

function toCheckoutItem(item: CartItem) {
  return {
    kind: item.kind,
    refId: item.refId,
    title: item.title,
    subtitle: item.subtitle,
    price: item.price,
    qty: item.qty,
    eventId: item.eventId,
    guests: item.guests,
  };
}

export function selectOrderById(state: OrdersState, id: string): Order | undefined {
  return state.orders.find((o) => o.id === id);
}

// Реэкспорт: экраны берут эти помощники отсюда исторически,
// а живут они в чистом модуле, который можно прогнать тестом.
export { isLineClosed, redeemableOf };
