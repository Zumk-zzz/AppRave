import type { BadgeTone } from '@/src/components';
import type { StockItem, StockMoveKind } from '@/src/services';

export const MOVE_LABEL: Record<StockMoveKind, string> = {
  receipt: 'Приход',
  writeoff: 'Списание',
  sale: 'Продажа',
  correction: 'Инвентаризация',
};

export const MOVE_TONE: Record<StockMoveKind, BadgeTone> = {
  receipt: 'success',
  writeoff: 'danger',
  sale: 'neutral',
  correction: 'gold',
};

/** Виды движений, которые администратор заводит руками. */
export const MANUAL_MOVE_KINDS: StockMoveKind[] = ['receipt', 'writeoff', 'correction'];

export function isLowStock(item: StockItem): boolean {
  return item.qty <= item.lowThreshold;
}

/** Дельта для операции. Инвентаризация приводит остаток к фактическому. */
export function deltaFor(kind: StockMoveKind, amount: number, currentQty: number): number {
  if (kind === 'receipt') return amount;
  if (kind === 'writeoff') return -amount;
  // correction: amount — это пересчитанный факт, а не поправка
  return amount - currentQty;
}
