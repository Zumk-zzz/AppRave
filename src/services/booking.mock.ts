import { computeOccupancy } from '@/src/data/tables';
import { useCatalogStore } from '@/src/store/catalog';
import type { BookingService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBookingService: BookingService = {
  async tablesFor(eventId) {
    await delay(350);
    return computeOccupancy(useCatalogStore.getState().tables, eventId);
  },
};
