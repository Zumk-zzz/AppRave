import type { ClubEvent, Genre, TicketType } from '@/src/services';

export const GENRE_LABEL: Record<Genre, string> = {
  techno: 'Techno',
  house: 'House',
  hiphop: 'Hip-hop',
  disco: 'Disco',
};

/**
 * Сколько вечеринка считается идущей после начала.
 *
 * Дата начала — не граница: вечеринка начинается в 22:00 и заканчивается
 * под утро. Гость, открывший афишу в полночь, должен видеть то, что
 * происходит прямо сейчас, а не пустой экран.
 *
 * Значение продублировано на сервере (server/src/lib/events.ts): там
 * оно решает, что показывать и что можно купить, здесь — что показывать
 * в афише и как раскладывать вечеринки по вкладкам в управлении.
 */
export const EVENT_DURATION_HOURS = 8;

/** Вечеринка ещё впереди или идёт прямо сейчас. */
export function isLive(date: string, now: number = Date.now()): boolean {
  return new Date(date).getTime() + EVENT_DURATION_HOURS * 3_600_000 > now;
}

/** Где вечеринка лежит в управлении: своя полка для каждого состояния. */
export type EventShelf = 'live' | 'draft' | 'past' | 'cancelled';

export function shelfOf(event: ClubEvent, now: number = Date.now()): EventShelf {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'draft';

  return isLive(event.date, now) ? 'live' : 'past';
}

/**
 * Ближайшая вечеринка: та, что идёт сейчас или начнётся раньше прочих.
 *
 * Нужна везде, где выбор даты был лишним шагом. Клуб живёт одной ночью:
 * бармен выдаёт напитки сегодняшним гостям, фейсер пускает сегодняшних,
 * и заказ гостя почти всегда к ближайшей вечеринке. Список для выбора
 * в таких местах только мешает — и однажды в нём выберут не ту строку.
 */
export function nearestEvent(events: ClubEvent[], now: number = Date.now()): ClubEvent | null {
  const upcoming = events
    .filter((e) => (e.status ?? 'published') === 'published' && isLive(e.date, now))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return upcoming[0] ?? null;
}

/** Самый дешёвый доступный билет — цена «от» на карточке. */
export function minPrice(event: ClubEvent): number {
  const inStock = event.tickets.filter((t) => t.available > 0);
  const pool = inStock.length > 0 ? inStock : event.tickets;
  return Math.min(...pool.map((t) => t.price));
}

/** Сколько всего мест осталось на событие. */
export function totalAvailable(event: ClubEvent): number {
  return event.tickets.reduce((sum, t) => sum + t.available, 0);
}

export function isSoldOut(event: ClubEvent): boolean {
  return totalAvailable(event) === 0;
}

/** Мало билетов — повод показать предупреждающую метку. */
export function isLowStock(event: ClubEvent): boolean {
  const left = totalAvailable(event);
  return left > 0 && left <= 15;
}

export function isTicketSoldOut(ticket: TicketType): boolean {
  return ticket.available === 0;
}
