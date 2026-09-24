import { mockCatalog } from './catalog.mock';
import { currentActor } from './session';
import type { ClubEvent, EventsService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ближайшие события первыми — так же, как отдавал бы бэкенд. */
function byDateAsc(a: ClubEvent, b: ClubEvent) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

/**
 * Видна ли вечеринка этому человеку.
 *
 * Гостю — только опубликованные: черновик готовится, отменённую
 * показывать в афише незачем. Сотруднику видно всё, иначе он не сможет
 * ни доготовить черновик, ни вернуть деньги по отменённой.
 *
 * На сервере то же самое решается по токену. Здесь спрашиваем у сессии —
 * это ровно тот же вопрос «кто сейчас работает», только без сети.
 */
function visible(event: ClubEvent): boolean {
  if ((event.status ?? 'published') === 'published') return true;
  return !!currentActor()?.staffRole;
}

export const mockEventsService: EventsService = {
  async list() {
    await delay(400);
    return (await mockCatalog.events()).filter(visible).sort(byDateAsc);
  },

  async byId(id) {
    await delay(200);
    const event = (await mockCatalog.events()).find((e) => e.id === id);
    return event && visible(event) ? event : null;
  },
};
