import type { ClubTable, TableZone } from '@/src/services/types';

export const ZONE_LABEL: Record<TableZone, string> = {
  vip: 'VIP у сцены',
  lounge: 'Лаундж',
  bar: 'Высокие столы',
};

/** Неподвижные элементы схемы: сцена, танцпол, барная стойка. */
export const FLOOR_FIXTURES = [
  { id: 'stage', label: 'Сцена', x: 0.22, y: 0.03, w: 0.56, h: 0.1 },
  { id: 'dancefloor', label: 'Танцпол', x: 0.24, y: 0.19, w: 0.52, h: 0.28 },
  { id: 'barcounter', label: 'Бар', x: 0.06, y: 0.9, w: 0.88, h: 0.07 },
] as const;

/**
 * Схема зала. Координаты — доли ширины и высоты контейнера,
 * поэтому один и тот же макет корректно ложится на любой размер экрана.
 */
export const DEFAULT_TABLES: Omit<ClubTable, 'taken' | 'blocked'>[] = [
  // VIP по бокам от сцены
  { id: 't_v1', label: 'V1', zone: 'vip', seats: 6, deposit: 25000, x: 0.03, y: 0.16, w: 0.17, h: 0.11 },
  { id: 't_v2', label: 'V2', zone: 'vip', seats: 6, deposit: 25000, x: 0.03, y: 0.31, w: 0.17, h: 0.11 },
  { id: 't_v3', label: 'V3', zone: 'vip', seats: 8, deposit: 40000, x: 0.8, y: 0.16, w: 0.17, h: 0.11 },
  { id: 't_v4', label: 'V4', zone: 'vip', seats: 8, deposit: 40000, x: 0.8, y: 0.31, w: 0.17, h: 0.11 },

  // Лаундж за танцполом
  { id: 't_l1', label: 'L1', zone: 'lounge', seats: 4, deposit: 12000, x: 0.05, y: 0.56, w: 0.2, h: 0.11 },
  { id: 't_l2', label: 'L2', zone: 'lounge', seats: 4, deposit: 12000, x: 0.28, y: 0.56, w: 0.2, h: 0.11 },
  { id: 't_l3', label: 'L3', zone: 'lounge', seats: 6, deposit: 18000, x: 0.51, y: 0.56, w: 0.2, h: 0.11 },
  { id: 't_l4', label: 'L4', zone: 'lounge', seats: 6, deposit: 18000, x: 0.74, y: 0.56, w: 0.2, h: 0.11 },

  // Высокие столы у бара
  { id: 't_b1', label: 'B1', zone: 'bar', seats: 2, deposit: 6000, x: 0.05, y: 0.74, w: 0.2, h: 0.1 },
  { id: 't_b2', label: 'B2', zone: 'bar', seats: 2, deposit: 6000, x: 0.28, y: 0.74, w: 0.2, h: 0.1 },
  { id: 't_b3', label: 'B3', zone: 'bar', seats: 3, deposit: 8000, x: 0.51, y: 0.74, w: 0.2, h: 0.1 },
  { id: 't_b4', label: 'B4', zone: 'bar', seats: 3, deposit: 8000, x: 0.74, y: 0.74, w: 0.2, h: 0.1 },
];

/**
 * Занятость зависит от события: на популярной вечеринке свободных столов
 * меньше. Считается детерминированно от id, чтобы схема не «прыгала»
 * при каждом открытии экрана.
 *
 * Стол, снятый администратором (blocked), занят на любую дату — это
 * ремонт или служебная бронь, а не чужой заказ.
 */
export function computeOccupancy(
  layout: Omit<ClubTable, 'taken'>[],
  eventId: string,
): ClubTable[] {
  const seed = hash(eventId);

  return layout.map((table, i) => ({
    ...table,
    taken: table.blocked || (seed + i * 7) % 5 === 0,
  }));
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 100000;
  }
  return h;
}
