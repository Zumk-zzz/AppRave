import type { OrderLine, Prisma } from '@prisma/client';
import { conflict } from './http-error.js';
import { isLive } from './events.js';

export function entryLeft(line: OrderLine) {
  if (line.kind === 'ticket') return Math.max(0, line.qty - line.redeemed - line.cancelledQty - line.entryReserved);
  if (line.kind === 'table' && line.cancelledQty === 0) return Math.max(0, line.entryIncluded - line.entryRedeemed - line.entryReserved);
  return 0;
}

export function ensureServing(event: { status: string; startsAt: Date } | null) {
  if (!event || event.status !== 'published' || !isLive(event.startsAt)) {
    throw conflict('Вечеринка отменена или уже закончилась', 'event_unavailable');
  }
}

export async function recordVisit(tx: Prisma.TransactionClient, userId: string, eventId: string) {
  await tx.visit.upsert({ where: { userId_eventId: { userId, eventId } }, create: { userId, eventId }, update: {} });
}

export async function revokeInvitations(tx: Prisma.TransactionClient, orderId: string, lineId?: string) {
  await tx.entryInvitation.updateMany({
    where: { orderId, ...(lineId ? { lineId } : {}), admittedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.orderLine.updateMany({ where: { orderId, ...(lineId ? { id: lineId } : {}) }, data: { entryReserved: 0 } });
}
