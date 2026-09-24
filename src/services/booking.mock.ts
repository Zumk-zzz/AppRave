import { computeOccupancy } from '@/src/data/tables';
import { mockCatalog } from './catalog.mock';
import type { BookingService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBookingService: BookingService = {
  async tablesFor(eventId) {
    await delay(350);
    return computeOccupancy(await mockCatalog.tables(), eventId);
  },
};
