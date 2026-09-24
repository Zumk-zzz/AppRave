import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requirePermission } from '../auth/guard.js';
import { db } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';

/**
 * Правка каталога и склада.
 *
 * Отдельно от чтения: смотреть афишу может кто угодно, менять — только
 * тот, у кого есть право. Разделение на уровне маршрутов, а не проверок
 * внутри общего обработчика: так забыть проверку негде.
 *
 * Общее правило всех ручек здесь — не терять проданное. Количество
 * выпущенных билетов правит администратор, количество проданных пишет
 * система, и правка первого никогда не затирает второе.
 */

const ticketSchema = z.object({
  /** Идентификатор существующего типа. У нового его нет. */
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(''),
  priceKopecks: z.number().int().min(0),
  quantity: z.number().int().min(0).max(100_000),
});

const eventSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(''),
  date: z.string().datetime({ offset: true }),
  genre: z.enum(['techno', 'house', 'hiphop', 'disco']),
  ageLimit: z.number().int().min(0).max(30),
  lineup: z.array(z.string().min(1)).max(50).default([]),
  description: z.string().default(''),
  cover: z.tuple([z.string().min(1), z.string().min(1)]),
  status: z.enum(['draft', 'published', 'cancelled']).default('published'),
  tickets: z.array(ticketSchema).min(1),
});

const barSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  priceKopecks: z.number().int().min(0),
  category: z.enum(['cocktails', 'shots', 'champagne', 'strong', 'soft']),
  volume: z.string().default(''),
  popular: z.boolean().default(false),
  available: z.boolean().default(true),
  stock: z
    .object({
      qty: z.number().int().min(0).optional(),
      unit: z.string().min(1).optional(),
      lowThreshold: z.number().int().min(0).optional(),
    })
    .optional(),
});

const tableSchema = z.object({
  label: z.string().min(1),
  zone: z.enum(['vip', 'lounge', 'bar']),
  seats: z.number().int().min(1).max(30),
  depositKopecks: z.number().int().min(0),
  blocked: z.boolean().default(false),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export async function adminRoutes(app: FastifyInstance) {
  // --- Афиша ---

  app.post('/admin/events', async (req, reply) => {
    requirePermission(req, 'catalog:write');
    const body = eventSchema.parse(req.body);

    const event = await db.event.create({
      data: {
        ...toEventData(body),
        ticketTypes: {
          createMany: {
            data: body.tickets.map((t) => ({
              name: t.name,
              description: t.description,
              priceKopecks: t.priceKopecks,
              quantity: t.quantity,
            })),
          },
        },
      },
    });

    return reply.code(201).send({ id: event.id });
  });

  app.put('/admin/events/:id', async (req) => {
    requirePermission(req, 'catalog:write');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = eventSchema.parse(req.body);

    const existing = await db.event.findUnique({ where: { id }, include: { ticketTypes: true } });
    if (!existing) throw notFound('Событие не найдено');

    const incoming = new Set(body.tickets.map((t) => t.id).filter(Boolean));

    // Тип, по которому уже продали, убрать нельзя: у людей на руках
    // билеты, и без типа в чеке не останется ни названия, ни цены
    for (const type of existing.ticketTypes) {
      if (!incoming.has(type.id) && type.sold > 0) {
        throw conflict(`По типу «${type.name}» уже проданы билеты`, 'tickets_sold');
      }
    }

    await db.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: toEventData(body) });

      await tx.ticketType.deleteMany({
        where: { eventId: id, id: { notIn: [...incoming] as string[] } },
      });

      for (const ticket of body.tickets) {
        const current = ticket.id
          ? existing.ticketTypes.find((t) => t.id === ticket.id)
          : undefined;

        if (!current) {
          await tx.ticketType.create({
            data: {
              eventId: id,
              name: ticket.name,
              description: ticket.description,
              priceKopecks: ticket.priceKopecks,
              quantity: ticket.quantity,
            },
          });
          continue;
        }

        // Выпустить меньше, чем уже продано, нельзя: остаток ушёл бы
        // в минус, а часть гостей осталась бы с билетами в никуда
        if (ticket.quantity < current.sold) {
          throw conflict(
            `«${current.name}»: уже продано ${current.sold}, меньше выпустить нельзя`,
            'below_sold',
          );
        }

        await tx.ticketType.update({
          where: { id: current.id },
          data: {
            name: ticket.name,
            description: ticket.description,
            priceKopecks: ticket.priceKopecks,
            // sold не трогаем: его пишет только система
            quantity: ticket.quantity,
          },
        });
      }
    });

    return { id };
  });

  app.delete('/admin/events/:id', async (req) => {
    requirePermission(req, 'catalog:write');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const orders = await db.order.count({ where: { eventId: id } });
    if (orders > 0) {
      // Удаление оторвало бы заказы от события, и у гостя в билете
      // пропали бы название и дата. Снятие с публикации делает то же
      // самое для афиши, ничего не ломая.
      throw conflict(
        'По этой вечеринке есть заказы — снимите её с публикации',
        'event_has_orders',
      );
    }

    await db.event.delete({ where: { id } });
    return { ok: true };
  });

  // --- Меню бара ---

  app.post('/admin/bar', async (req, reply) => {
    requirePermission(req, 'catalog:write');
    const body = barSchema.parse(req.body);

    const item = await db.barItem.create({
      data: {
        ...toBarData(body),
        // Строка склада заводится сразу: без неё позиция есть в меню,
        // но невидима для инвентаризации и не продаётся
        stock: {
          create: {
            qty: body.stock?.qty ?? 0,
            unit: body.stock?.unit ?? 'шт',
            lowThreshold: body.stock?.lowThreshold ?? 5,
          },
        },
      },
    });

    return reply.code(201).send({ id: item.id });
  });

  app.put('/admin/bar/:id', async (req) => {
    requirePermission(req, 'catalog:write');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = barSchema.parse(req.body);

    const existing = await db.barItem.findUnique({ where: { id }, include: { stock: true } });
    if (!existing) throw notFound('Позиция не найдена');

    await db.$transaction(async (tx) => {
      await tx.barItem.update({ where: { id }, data: toBarData(body) });

      if (!body.stock) return;

      // Остаток правится движением, а не присваиванием: так в журнале
      // видно, кто и на сколько поменял склад. Присваивание оставило бы
      // расхождение без следа.
      const target = body.stock.qty;
      const current = existing.stock?.qty ?? 0;

      if (target !== undefined && target !== current) {
        await tx.stockMove.create({
          data: {
            barItemId: id,
            kind: 'correction',
            delta: target - current,
            comment: 'Правка карточки',
          },
        });
      }

      await tx.stock.upsert({
        where: { barItemId: id },
        create: {
          barItemId: id,
          qty: target ?? 0,
          unit: body.stock.unit ?? 'шт',
          lowThreshold: body.stock.lowThreshold ?? 5,
        },
        update: {
          ...(target === undefined ? {} : { qty: target }),
          ...(body.stock.unit === undefined ? {} : { unit: body.stock.unit }),
          ...(body.stock.lowThreshold === undefined
            ? {}
            : { lowThreshold: body.stock.lowThreshold }),
        },
      });
    });

    return { id };
  });

  app.delete('/admin/bar/:id', async (req) => {
    requirePermission(req, 'catalog:write');
    const { id } = z.object({ id: z.string() }).parse(req.params);

    const sold = await db.orderLine.count({ where: { barItemId: id } });
    if (sold > 0) {
      // История продаж должна сходиться. Снятая с продажи позиция
      // пропадает из меню гостя, но остаётся в отчётах.
      throw conflict('Позиция уже продавалась — снимите её с продажи', 'bar_item_sold');
    }

    await db.barItem.delete({ where: { id } });
    return { ok: true };
  });

  // --- Столы ---

  /** Схема зала целиком: без события и без занятости — её правит админ. */
  app.get('/admin/tables', async (req) => {
    requirePermission(req, 'catalog:write');

    const tables = await db.clubTable.findMany({ orderBy: { label: 'asc' } });
    return tables.map((t) => ({
      id: t.id,
      label: t.label,
      zone: t.zone,
      seats: t.seats,
      depositKopecks: t.depositKopecks,
      blocked: t.blocked,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    }));
  });

  app.post('/admin/tables', async (req, reply) => {
    requirePermission(req, 'catalog:write');
    const body = tableSchema.parse(req.body);

    try {
      const table = await db.clubTable.create({ data: body });
      return reply.code(201).send({ id: table.id });
    } catch (e) {
      throw labelTaken(e);
    }
  });

  app.put('/admin/tables/:id', async (req) => {
    requirePermission(req, 'catalog:write');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = tableSchema.parse(req.body);

    try {
      await db.clubTable.update({ where: { id }, data: body });
      return { id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw notFound('Стол не найден');
      }
      throw labelTaken(e);
    }
  });

  // --- Склад ---

  /** Остатки. Видит тот, кто их и правит: бармен, управляющий, админ. */
  app.get('/stock', async (req) => {
    requirePermission(req, 'stock:write');

    const stock = await db.stock.findMany({ orderBy: { barItemId: 'asc' } });
    return stock.map((s) => ({
      barItemId: s.barItemId,
      qty: s.qty,
      unit: s.unit,
      lowThreshold: s.lowThreshold,
    }));
  });

  /** Журнал движений, новые первыми. Без barItemId — по всем позициям. */
  app.get('/stock/moves', async (req) => {
    requirePermission(req, 'stock:write');
    const { barItemId, limit } = z
      .object({
        barItemId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .parse(req.query);

    const moves = await db.stockMove.findMany({
      where: barItemId ? { barItemId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return moves.map((m) => ({
      id: m.id,
      barItemId: m.barItemId,
      kind: m.kind,
      delta: m.delta,
      comment: m.comment,
      orderId: m.orderId,
      createdAt: m.createdAt.toISOString(),
    }));
  });

  /**
   * Приход, списание, инвентаризация.
   *
   * Остаток меняется тем же условным UPDATE, что и при продаже: иначе
   * два списания, пришедшие одновременно, увели бы склад в минус.
   */
  app.post('/stock/moves', async (req, reply) => {
    const auth = requirePermission(req, 'stock:write');
    const body = z
      .object({
        barItemId: z.string().min(1),
        kind: z.enum(['receipt', 'writeoff', 'correction']),
        delta: z.number().int().refine((n) => n !== 0, 'Нулевое движение бессмысленно'),
        comment: z.string().max(200).optional(),
      })
      .parse(req.body);

    const item = await db.barItem.findUnique({ where: { id: body.barItemId } });
    if (!item) throw notFound('Позиция не найдена');

    if (body.kind === 'receipt' && body.delta < 0) {
      throw badRequest('Приход не может быть отрицательным', 'bad_delta');
    }
    if (body.kind === 'writeoff' && body.delta > 0) {
      throw badRequest('Списание не может быть положительным', 'bad_delta');
    }

    const move = await db.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE stock
           SET qty = qty + ${body.delta}
         WHERE bar_item_id = ${body.barItemId}
           AND qty + ${body.delta} >= 0
      `;

      if (affected === 0) {
        throw conflict(`«${item.name}»: на складе столько нет`, 'not_enough_stock');
      }

      const created = await tx.stockMove.create({
        data: {
          barItemId: body.barItemId,
          kind: body.kind,
          delta: body.delta,
          comment: body.comment,
        },
      });

      // Кто и на сколько поправил склад — вопрос денег, а не гигиены
      await tx.staffAction.create({
        data: {
          actorId: auth.sub,
          kind: 'stock_adjusted',
          details: { item: item.name, delta: body.delta, kind: body.kind },
        },
      });

      return created;
    });

    return reply.code(201).send({
      id: move.id,
      barItemId: move.barItemId,
      kind: move.kind,
      delta: move.delta,
      comment: move.comment,
      orderId: move.orderId,
      createdAt: move.createdAt.toISOString(),
    });
  });
}

function toEventData(body: z.infer<typeof eventSchema>) {
  return {
    title: body.title,
    subtitle: body.subtitle,
    startsAt: new Date(body.date),
    genre: body.genre,
    ageLimit: body.ageLimit,
    lineup: body.lineup,
    description: body.description,
    coverFrom: body.cover[0],
    coverTo: body.cover[1],
    status: body.status,
  };
}

function toBarData(body: z.infer<typeof barSchema>) {
  return {
    name: body.name,
    description: body.description,
    priceKopecks: body.priceKopecks,
    category: body.category,
    volume: body.volume,
    popular: body.popular,
    available: body.available,
  };
}

/** P2002 на столе означает только одно: такая метка уже занята. */
function labelTaken(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return conflict('Стол с такой меткой уже есть', 'label_taken');
  }
  return e;
}
