import { MOCK_EVENTS } from '@/src/data/events';
import type { ClubEvent, EventsService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ближайшие события первыми — так же, как отдавал бы бэкенд. */
function byDateAsc(a: ClubEvent, b: ClubEvent) {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

export const mockEventsService: EventsService = {
  async list() {
    await delay(400);
    return [...MOCK_EVENTS].sort(byDateAsc);
  },

  async byId(id) {
    await delay(200);
    return MOCK_EVENTS.find((e) => e.id === id) ?? null;
  },
};
