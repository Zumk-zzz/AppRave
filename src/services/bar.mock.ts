import { MOCK_BAR_MENU } from '@/src/data/bar';
import type { BarService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBarService: BarService = {
  async menu() {
    await delay(350);
    return MOCK_BAR_MENU;
  },
};
