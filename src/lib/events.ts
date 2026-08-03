import type { ClubEvent, Genre, TicketType } from '@/src/services';

export const GENRE_LABEL: Record<Genre, string> = {
  techno: 'Techno',
  house: 'House',
  hiphop: 'Hip-hop',
  disco: 'Disco',
};

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
