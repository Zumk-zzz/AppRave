/**
 * Сдвигает прошедшую афишу вперёд.
 *
 * Посев ставит даты относительно дня, когда его запустили, и делает это
 * один раз. Через неделю разработки все вечеринки оказываются в прошлом,
 * а вместе с ними исчезает половина сценариев: купить нельзя, отменить
 * нельзя — «вечеринка уже прошла», — и выглядит это как поломка
 * приложения, хотя сломались данные.
 *
 * Заказы не трогаем: купленные билеты остаются у гостей и продолжают
 * указывать на те же события, просто теперь эти события снова впереди.
 * Промежутки между вечеринками сохраняются, чтобы афиша не слиплась
 * в один день.
 *
 * Запуск: npm run demo:refresh
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DAY = 86_400_000;

const past = await db.event.findMany({
  where: { startsAt: { lt: new Date() }, status: { not: 'cancelled' } },
  orderBy: { startsAt: 'asc' },
  select: { id: true, title: true, startsAt: true },
});

if (past.length === 0) {
  console.log('\nВся афиша впереди — сдвигать нечего.\n');
  await db.$disconnect();
  process.exit(0);
}

// Самую раннюю переносим на завтра, остальные — с теми же промежутками
const earliest = past[0].startsAt.getTime();
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(22, 0, 0, 0);

const offset = tomorrow.getTime() - earliest;

console.log('');
for (const event of past) {
  const startsAt = new Date(event.startsAt.getTime() + offset);
  await db.event.update({ where: { id: event.id }, data: { startsAt } });

  const days = Math.round((startsAt.getTime() - Date.now()) / DAY);
  console.log(`  ${event.title} → ${startsAt.toLocaleString('ru-RU')} (через ${days} дн.)`);
}

console.log(`\nСдвинуто вечеринок: ${past.length}\n`);

await db.$disconnect();
