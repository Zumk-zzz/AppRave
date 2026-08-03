import { create } from 'zustand';

export type CartKind = 'ticket' | 'table' | 'bar';

export interface CartItem {
  /** Ключ строки. Одинаковый товар при повторном добавлении копит количество. */
  lineId: string;
  /**
   * Идентификатор товара внутри своего типа: тип билета, номер стола,
   * позиция бара. Хранится отдельно, хотя и входит в lineId: разбирать
   * составной ключ строками — верный способ однажды ошибиться.
   */
  refId: string;
  kind: CartKind;
  title: string;
  subtitle?: string;
  /** Цена за одну единицу */
  price: number;
  qty: number;
  /** К какому событию относится билет или бронь */
  eventId?: string;
  /** Гостевой список брони — имена, которые попадут на фейс-контроль */
  guests?: string[];
}

export interface AddInput {
  kind: CartKind;
  /** Идентификатор товара внутри своего типа: тип билета, номер стола, позиция бара */
  refId: string;
  title: string;
  subtitle?: string;
  price: number;
  eventId?: string;
  qty?: number;
  guests?: string[];
  /**
   * Товар в единственном экземпляре — стол нельзя забронировать дважды.
   * Повторное добавление не увеличивает количество, а обновляет строку.
   */
  unique?: boolean;
}

interface CartState {
  items: CartItem[];
  add: (input: AddInput) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  /** Убрать все строки одного типа — например, сменить забронированный стол */
  removeKind: (kind: CartKind) => void;
  clear: () => void;
}

/**
 * Ключ строки корзины. Экспортируется, потому что экранам нужно узнать
 * количество уже добавленного товара до того, как они его добавят —
 * иначе счётчики на карточках разъедутся с корзиной.
 */
export function buildLineId(kind: CartKind, refId: string, eventId?: string): string {
  return `${kind}:${eventId ?? '-'}:${refId}`;
}

function makeLineId({ kind, refId, eventId }: AddInput): string {
  return buildLineId(kind, refId, eventId);
}

export const useCartStore = create<CartState>((set) => ({
  items: [],

  add(input) {
    const lineId = makeLineId(input);
    const addQty = input.qty ?? 1;

    set((state) => {
      const existing = state.items.find((i) => i.lineId === lineId);

      if (existing) {
        return {
          items: state.items.map((i) =>
            i.lineId === lineId
              ? {
                  ...i,
                  qty: input.unique ? addQty : i.qty + addQty,
                  guests: input.guests ?? i.guests,
                }
              : i,
          ),
        };
      }

      const next: CartItem = {
        lineId,
        refId: input.refId,
        kind: input.kind,
        title: input.title,
        subtitle: input.subtitle,
        price: input.price,
        qty: addQty,
        eventId: input.eventId,
        guests: input.guests,
      };

      return { items: [...state.items, next] };
    });
  },

  setQty(lineId, qty) {
    set((state) => ({
      // Ноль означает «убрать», иначе в корзине копятся пустые строки
      items:
        qty <= 0
          ? state.items.filter((i) => i.lineId !== lineId)
          : state.items.map((i) => (i.lineId === lineId ? { ...i, qty } : i)),
    }));
  },

  remove(lineId) {
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) }));
  },

  removeKind(kind) {
    set((state) => ({ items: state.items.filter((i) => i.kind !== kind) }));
  },

  clear() {
    set({ items: [] });
  },
}));

/** Сумма заказа. Селектор, а не поле, чтобы не рассинхронизировалось с items. */
export function selectTotal(state: CartState): number {
  return state.items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

/** Общее количество единиц — для бейджа на иконке корзины. */
export function selectCount(state: CartState): number {
  return state.items.reduce((sum, i) => sum + i.qty, 0);
}

/** Сколько штук конкретного товара уже в корзине. */
export function selectQtyOf(state: CartState, lineId: string): number {
  return state.items.find((i) => i.lineId === lineId)?.qty ?? 0;
}
