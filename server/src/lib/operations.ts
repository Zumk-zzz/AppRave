import type { Prisma } from '@prisma/client';
import type { Auth } from '../auth/guard.js';
import { conflict } from './http-error.js';
import { liveFilter } from './events.js';
import { canNow } from './permissions.js';

export async function lockShift(tx: Prisma.TransactionClient, auth: Auth) {
  if (!auth.shiftId) throw conflict('Откройте смену', 'no_shift');
  await tx.$queryRaw`SELECT id FROM shifts WHERE id=${auth.shiftId} FOR UPDATE`;
  const shift = await tx.shift.findUnique({ where: { id: auth.shiftId } });
  if (!shift || shift.closedAt || shift.userId !== auth.sub) throw conflict('Смена уже закрыта', 'shift_closed');
}

export async function activity(tx: Prisma.TransactionClient, orderId: string, kind: string, title: string, actorName?: string, details?: Prisma.InputJsonValue) {
  await tx.orderActivity.create({ data: { orderId, kind, title, actorName, details } });
}

export async function arrival(tx: Prisma.TransactionClient, orderId: string) {
  await tx.tableBooking.updateMany({ where: { orderId, status: 'paid', serviceStatus: 'reserved' }, data: { serviceStatus: 'arrived', arrivedAt: new Date() } });
}

export async function shiftReport(tx: Prisma.TransactionClient, shift: { id: string; userId: string; openedAt: Date; closedAt: Date | null }, role: Auth['staffRole']) {
  const until = shift.closedAt ?? new Date();
  const actor = await tx.user.findUniqueOrThrow({ where: { id: shift.userId } });
  const actions = await tx.staffAction.findMany({ where: { shiftId: shift.id } });
  const sum = (kinds: string[], field: string) => actions.filter((a) => kinds.includes(a.kind)).reduce((n,a) => n + Number((a.details as Record<string,unknown> | null)?.[field] ?? 0), 0);
  const items = new Map<string, { title: string; prepared: number; ready: number; issued: number }>();
  for (const a of actions) {
    if (!['bar_started','bar_ready','bar_issued'].includes(a.kind)) continue;
    const d = a.details as Record<string,unknown>;
    const title = String(d.item ?? 'Напиток');
    const row = items.get(title) ?? { title, prepared: 0, ready: 0, issued: 0 };
    row[a.kind === 'bar_started' ? 'prepared' : a.kind === 'bar_ready' ? 'ready' : 'issued'] += Number(d.qty ?? 0);
    items.set(title,row);
  }
  const stock = [];
  if (!shift.closedAt && canNow(role, true, 'stock:write')) {
    const inventory = await tx.stock.findMany({ include: { barItem: true }, orderBy: { barItemId: 'asc' } });
    const reserved = await tx.orderLine.groupBy({ by: ['barItemId'], where: { kind: 'bar', order: { status: { in: ['pending','paid','used'] } } }, _sum: { qty: true, redeemed: true, cancelledQty: true } });
    const held = new Map(reserved.map((r) => [r.barItemId, (r._sum.qty ?? 0) - (r._sum.redeemed ?? 0) - (r._sum.cancelledQty ?? 0)]));
    for (const row of inventory) {
      const reservedQty = held.get(row.barItemId) ?? 0;
      stock.push({ barItemId: row.barItemId, title: row.barItem.name, unit: row.unit, available: row.qty, reserved: reservedQty, expected: row.qty + reservedQty, actual: null as number | null, difference: null as number | null, reason: '' });
    }
  }
  const sales = canNow(role, true, 'orders:read') ? await tx.order.aggregate({ where: { paidAt: { gte: shift.openedAt, lte: until }, status: { in: ['paid','used'] } }, _sum: { totalKopecks: true }, _count: true }) : null;
  return { saved: false, shiftId: shift.id, staffName: actor.name, openedAt: shift.openedAt.toISOString(), closedAt: shift.closedAt?.toISOString() ?? null, generatedAt: new Date().toISOString(),
    admitted: sum(['entry_admitted','entry_manual'],'guests'), started: sum(['bar_started'],'qty'), ready: sum(['bar_ready'],'qty'), issued: sum(['bar_issued'],'qty'),
    soldOrders: sales?._count ?? null, salesKopecks: sales?._sum.totalKopecks ?? null, pendingPreparations: await tx.orderLine.count({ where: { preparedById: shift.userId, preparingQty: { gt: 0 }, order: { status: 'paid', event: { status: 'published', ...liveFilter() } } } }),
    items: [...items.values()], stock };
}
