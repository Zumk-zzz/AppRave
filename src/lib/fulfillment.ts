import type { OrderLine } from '@/src/services/types';

export function entryTotal(line: OrderLine): number {
  return line.kind === 'ticket' ? line.qty - (line.cancelled ?? 0) : line.kind === 'table' && !line.cancelled ? line.entryIncluded ?? 0 : 0;
}
export function entryUsed(line: OrderLine): number {
  return line.kind === 'ticket' ? line.redeemed : line.kind === 'table' ? line.entryRedeemed ?? 0 : 0;
}
export function entryAvailable(line: OrderLine): number {
  return Math.max(0, entryTotal(line) - entryUsed(line) - (line.entryReserved ?? 0));
}
export function barStage(line: OrderLine): 'waiting' | 'queued' | 'preparing' | 'ready' | 'done' {
  if (line.qty <= line.redeemed + (line.cancelled ?? 0)) return 'done';
  if ((line.readyQty ?? 0) > 0) return 'ready';
  if ((line.preparingQty ?? 0) > 0) return 'preparing';
  return line.barRequestedAt ? 'queued' : 'waiting';
}
export const BAR_STAGE_LABEL = {
  waiting: 'Оплачен · ждёт приготовления', queued: 'В очереди', preparing: 'Готовится', ready: 'Можно забирать', done: 'Получен / отменён',
};
export function barProgress(line: OrderLine): string {
  return `Выдано ${line.redeemed} · готово ${line.readyQty ?? 0} · готовится ${line.preparingQty ?? 0}`;
}
