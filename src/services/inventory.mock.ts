import { useCatalogStore } from '@/src/store/catalog';
import type { InventoryService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockInventoryService: InventoryService = {
  async stock() {
    await delay(250);
    return useCatalogStore.getState().stock;
  },

  async moves(barItemId) {
    await delay(250);
    const all = useCatalogStore.getState().moves;
    return barItemId ? all.filter((m) => m.barItemId === barItemId) : all;
  },

  async apply(input) {
    await useCatalogStore.getState().applyStockMove(input);
  },
};
