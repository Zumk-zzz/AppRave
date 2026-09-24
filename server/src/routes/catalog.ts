import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { readAuth } from '../auth/guard.js';
import { can, effectiveRole } from '../lib/permissions.js';
import { db } from '../db.js';
import { notFound } from '../lib/http-error.js';

export async function catalogRoutes(app: FastifyInstance) {
  /**
   * Афиша. Гостю видны только опубликованные события,
   * администратору — вообще все, включая черновики.
   */
  app.get('/events', async (req) => {
    // Черновики и отменённые видит тот, кто их правит. Смена тут ни при
    // чём: афишу готовят днём, а не в зале.
    const mayEdit = can(effectiveRole(readAuth(req)?.staffRole), 'catalog:write');

    const events = await db.event.findMany({
      where: mayEdit ? {} : { status: 'published' },
      orderBy: { startsAt: 'asc' },
      include: { ticketTypes: { orderBy: { priceKopecks: 'asc' } } },
    });

    return events.map(toEventDto);
  });

  app.get('/events/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const mayEdit = can(effectiveRole(readAuth(req)?.staffRole), 'catalog:write');

    const event = await db.event.findUnique({
      where: { id },
      include: { ticketTypes: { orderBy: { priceKopecks: 'asc' } } },
    });

    if (!event) throw notFound('Событие не найдено');
    if (event.status !== 'published' && !mayEdit) {
      // Черновик для гостя не существует, а не «запрещён»: 403 подсказал бы,
      // что такое событие есть.
      throw notFound('Событие не найдено');
    }

    return toEventDto(event);
  });

  /** Меню бара. Снятые с продажи позиции гостю не показываем вовсе. */
  app.get('/bar/menu', async (req) => {
    // Снятые с продажи позиции нужны тому, кто правит меню
    const mayEdit = can(effectiveRole(readAuth(req)?.staffRole), 'catalog:write');

    const items = await db.barItem.findMany({
      where: mayEdit ? {} : { available: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return items.map(toBarDto);
  });

  /**
   * Схема зала на конкретное событие.
   *
   * Занятость считается по живым броням этого события, а не хранится
   * в столе: один и тот же стол свободен в среду и занят в субботу.
   */
  app.get('/events/:id/tables', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const event = await db.event.findUnique({ where: { id } });
    if (!event) throw notFound('Событие не найдено');

    const [tables, bookings] = await Promise.all([
      db.clubTable.findMany({ orderBy: { label: 'asc' } }),
      db.tableBooking.findMany({
        where: { eventId: id, status: { in: ['pending', 'paid'] } },
        select: { tableId: true },
      }),
    ]);

    const busy = new Set(bookings.map((b) => b.tableId));

    return tables.map((t) => ({
      id: t.id,
      label: t.label,
      zone: t.zone,
      seats: t.seats,
      depositKopecks: t.depositKopecks,
      blocked: t.blocked,
      // Снятый администратором стол занят на любую дату
      taken: t.blocked || busy.has(t.id),
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    }));
  });
}

type EventRow = Awaited<ReturnType<typeof db.event.findUniqueOrThrow>> & {
  ticketTypes: Awaited<ReturnType<typeof db.ticketType.findMany>>;
};

function toEventDto(event: EventRow) {
  return {
    id: event.id,
    title: event.title,
    subtitle: event.subtitle,
    date: event.startsAt.toISOString(),
    genre: event.genre,
    ageLimit: event.ageLimit,
    lineup: event.lineup,
    description: event.description,
    cover: [event.coverFrom, event.coverTo] as [string, string],
    status: event.status,
    tickets: event.ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      priceKopecks: t.priceKopecks,
      // Доступное считается, а не хранится: quantity правит админ,
      // sold пишет система, и рассинхрону взяться неоткуда.
      available: Math.max(0, t.quantity - t.sold),
      quantity: t.quantity,
    })),
  };
}

type BarRow = Awaited<ReturnType<typeof db.barItem.findUniqueOrThrow>>;

function toBarDto(item: BarRow) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    priceKopecks: item.priceKopecks,
    category: item.category,
    volume: item.volume,
    popular: item.popular,
    available: item.available,
  };
}
