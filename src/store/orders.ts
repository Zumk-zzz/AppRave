import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { pointsForPurchase } from '@/src/lib/loyalty';
import { cancelReminder, scheduleReminder } from '@/src/lib/reminders';
import type { ClubEvent, LoyaltyTier, Order, OrderLine } from '@/src/services';
import type { CartItem } from './cart';

// Заказы не секретны, поэтому AsyncStorage, а не secure-store:
// у последнего практический лимит около 2 КБ, а история растёт.
const ORDERS_KEY = 'apprave.orders';

interface OrdersState {
  orders: Order[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Превратить корзину в заказы — по одному на каждую вечеринку. */
  checkout: (
    items: CartItem[],
    events: ClubEvent[],
    memberNo: string,
    tier: LoyaltyTier,
  ) => Promise<Order[]>;
  markUsed: (orderId: string) => void;
  /** Отмена заказа гостем: билет перестаёт пускать на вход. */
  cancel: (orderId: string) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  loaded: false,

  async load() {
    try {
      const raw = await AsyncStorage.getItem(ORDERS_KEY);
      set({ orders: raw ? (JSON.parse(raw) as Order[]) : [], loaded: true });
    } catch {
      // Повреждённая история не должна мешать покупать дальше.
      set({ orders: [], loaded: true });
    }
  },

  async checkout(items, events, memberNo, tier) {
    // Один заказ на вечеринку: на входе сканируют один QR за одну ночь,
    // а не общий чек на несколько дат.
    const byEvent = new Map<string, CartItem[]>();
    for (const item of items) {
      const key = item.eventId ?? 'no-event';
      byEvent.set(key, [...(byEvent.get(key) ?? []), item]);
    }

    const created: Order[] = [];

    for (const [eventId, lines] of byEvent) {
      const event = events.find((e) => e.id === eventId);
      const total = lines.reduce((sum, i) => sum + i.price * i.qty, 0);
      const id = makeOrderId();

      created.push({
        id,
        createdAt: new Date().toISOString(),
        eventId: event?.id,
        eventTitle: event?.title,
        eventDate: event?.date,
        lines: lines.map(toOrderLine),
        total,
        pointsEarned: pointsForPurchase(total, tier),
        status: 'paid',
        qrPayload: `APPRAVE|${id}|${memberNo}|${event?.id ?? '-'}`,
      });
    }

    // Напоминание ставится после создания заказа, чтобы у него уже был id
    for (const order of created) {
      const reminderId = await scheduleReminder(order);
      if (reminderId) order.reminderId = reminderId;
    }

    const next = [...created, ...get().orders];
    set({ orders: next });
    await persist(next);

    return created;
  },

  markUsed(orderId) {
    const next = get().orders.map((o) => (o.id === orderId ? { ...o, status: 'used' as const } : o));
    set({ orders: next });
    void persist(next);
  },

  async cancel(orderId) {
    // Снимаем напоминание: получить «ваша вечеринка через три часа»
    // по отменённому билету — худший вид уведомления.
    await cancelReminder(get().orders.find((o) => o.id === orderId)?.reminderId);

    // Заказ не удаляем, а помечаем отменённым: история продаж должна
    // сойтись, а сканер на входе — знать, почему код не пускает.
    const next = get().orders.map((o) =>
      o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
    );
    set({ orders: next });
    await persist(next);
  },
}));

function toOrderLine(item: CartItem): OrderLine {
  return {
    kind: item.kind,
    refId: item.refId,
    title: item.title,
    subtitle: item.subtitle,
    price: item.price,
    qty: item.qty,
    guests: item.guests,
  };
}

/** Номер вида ORD-8F3A — короткий, читается вслух на входе. */
function makeOrderId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `ORD-${tail}`;
}

async function persist(orders: Order[]) {
  try {
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // Не сохранилось — заказ всё равно есть в памяти до перезапуска.
  }
}

export function selectOrderById(state: OrdersState, id: string): Order | undefined {
  return state.orders.find((o) => o.id === id);
}
