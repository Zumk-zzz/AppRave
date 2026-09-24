/**
 * Пересчитывает баллы по истории заказов.
 *
 * Баллы начисляются при оплате и снимаются при отмене или возврате.
 * Снятие появилось позже начисления, поэтому у тех, кто отменял заказы
 * раньше, на счету осталось лишнее — и никакая покупка это не выправит:
 * счётчик накопительный.
 *
 * Здесь он приводится к тому, что следует из истории: сумма начислений
 * по состоявшимся заказам. Уровень пересчитывается заодно — он выводится
 * из баллов и обязан идти с ними в ногу.
 *
 * Запуск: npm run demo:points
 */
import { PrismaClient } from '@prisma/client';

import { tierForPoints } from '../src/lib/money.js';

const db = new PrismaClient();

const users = await db.user.findMany({
  select: {
    id: true,
    phone: true,
    email: true,
    points: true,
    tier: true,
    orders: {
      where: { status: { in: ['paid', 'used'] } },
      select: { pointsEarned: true },
    },
  },
});

let fixed = 0;
console.log('');

for (const user of users) {
  const earned = user.orders.reduce((sum, o) => sum + o.pointsEarned, 0);
  if (earned === user.points) continue;

  const tier = tierForPoints(earned);
  await db.user.update({ where: { id: user.id }, data: { points: earned, tier } });

  const who = user.phone ?? user.email ?? user.id;
  const level = tier === user.tier ? '' : `, уровень ${user.tier} → ${tier}`;
  console.log(`  ${who}: ${user.points} → ${earned}${level}`);
  fixed += 1;
}

console.log(
  fixed === 0
    ? '\nВсе счета сходятся с историей.\n'
    : `\nПоправлено счетов: ${fixed} из ${users.length}\n`,
);

await db.$disconnect();
