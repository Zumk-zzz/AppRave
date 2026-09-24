/**
 * Убирает вечеринки, созданные проверками.
 *
 * Наборы smoke заводят свои события, чтобы ничего не ломать в настоящих
 * данных, — и за десяток прогонов их накапливается столько, что рабочая
 * афиша тонет среди «ПРОШЛА mufpl» и «SMOKE NIGHT». Через приложение
 * их не вычистить: по некоторым есть оплаченные заказы, и удаление
 * оттуда справедливо запрещено.
 *
 * Это служебная команда, она ходит в базу напрямую и удаляет заказы
 * вместе с событиями. Настоящие вечеринки не трогает: узнаёт свои
 * по названиям, которыми их называют сами проверки.
 *
 * Запуск: npm run demo:clean
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

/** Как называют свои вечеринки наборы проверок. */
const MARKERS = ['SMOKE NIGHT', 'ОТМЕНА ', 'ПРОШЛА ', 'ИДЁТ ', 'СКОРО ', 'ЗАРАНЕЕ ', 'ЧАСТИЧНО '];

const suspects = await db.event.findMany({
  where: { OR: MARKERS.map((m) => ({ title: { startsWith: m } })) },
  select: { id: true, title: true, _count: { select: { orders: true } } },
  orderBy: { createdAt: 'asc' },
});

console.log('');
let orders = 0;

// Сотрудников чистим в любом случае: вечеринок могло не остаться,
// а проверочные бармены никуда не делись
if (suspects.length === 0) console.log('  проверочных вечеринок нет');

for (const event of suspects) {
  await db.$transaction(async (tx) => {
    // Заказы удаляем явно: связь настроена на обрыв, а не на каскад —
    // чтобы настоящий заказ никогда не исчез вместе с событием
    await tx.order.deleteMany({ where: { eventId: event.id } });
    await tx.event.delete({ where: { id: event.id } });
  });

  orders += event._count.orders;
  console.log(`  удалено: ${event.title} (${event._count.orders} заказов)`);
}

console.log(`\nВечеринок: ${suspects.length}, заказов: ${orders}`);

/**
 * Заодно снимаем роли с проверочных сотрудников.
 *
 * Набор про вход по почте заводит их десятками, и в списке команды
 * они выглядят как настоящие бармены. Аккаунты не удаляем: к ним
 * могут быть привязаны заказы — достаточно вернуть их в гости.
 */
const fakeStaff = await db.user.updateMany({
  where: { role: { not: 'guest' }, name: { in: ['Бармен по почте', 'Сотрудник', 'Бармен Иван', 'Фейсер Пётр', 'Менеджер Анна'] } },
  data: { role: 'guest' },
});

console.log(`Разжаловано проверочных сотрудников: ${fakeStaff.count}\n`);

await db.$disconnect();
