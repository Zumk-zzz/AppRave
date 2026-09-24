import { mockCatalog } from './catalog.mock';
import type { ClubEvent, EventsService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ближайшие события первыми — так же, как отдавал бы бэкенд. */
function byDateAsc(a: ClubEvent, b: ClubEvent) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

export const mockEventsService: EventsService = {
  async list() {
    await delay(400);
    return [...(await mockCatalog.events())].sort(byDateAsc);
  },

  async byId(id) {
    await delay(200);
    return (await mockCatalog.events()).find((e) => e.id === id) ?? null;
  },
};
