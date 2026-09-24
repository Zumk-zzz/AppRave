import { mockCatalog } from './catalog.mock';
import type { InventoryService } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockInventoryService: InventoryService = {
  async stock() {
    await delay(250);
    return mockCatalog.stock();
  },

  async moves(barItemId) {
    await delay(250);
    return mockCatalog.moves(barItemId);
  },

  async apply(input) {
    await mockCatalog.applyStockMove(input);
  },
};
