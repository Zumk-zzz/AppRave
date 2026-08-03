import { useCatalogStore } from '@/src/store/catalog';
import type { BarService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockBarService: BarService = {
  async menu() {
    await delay(350);
    return useCatalogStore.getState().barMenu;
  },
};
