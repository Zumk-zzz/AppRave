import { tablesForEvent } from '@/src/data/tables';
import type { BookingService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBookingService: BookingService = {
  async tablesFor(eventId) {
    await delay(350);
    return tablesForEvent(eventId);
  },
};
