/**
 * Проверка логики состояния заказа.
 *
 * Запуск: node scripts/order-status.test.mjs
 *
 * Модуль src/lib/order-status.ts написан без зависимостей от React Native
 * именно ради этого: ошибка в нём решает, пустят гостя внутрь или нет,
 * и проверять её кликами по телефону слишком дорого.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// Читаем исходник и срезаем типы простейшим образом: в модуле нет ничего,
// кроме функций и импорта типов, поэтому отдельный компилятор здесь избыточен.
const source = readFileSync(new URL('../src/lib/order-status.ts', import.meta.url), 'utf8')
  .replace(/^import type .*$/gm, '')
  .replace(/: (Order|OrderLine|OrderStatus)\b/g, '')
  .replace(/\): (OrderStatus|Order|number|boolean)\b/g, ')');

const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { redeemableOf, isLineClosed, deriveStatus } = module;

const line = (over = {}) => ({
  kind: 'bar',
  refId: 'b1',
  title: 'Негрони',
  price: 89000,
  qty: 3,
  redeemed: 0,
  cancelled: 0,
  ...over,
});

const order = (lines, status = 'paid') => ({
  id: 'ORD-TEST',
  createdAt: new Date().toISOString(),
  lines,
  total: 0,
  pointsEarned: 0,
  status,
  qrPayload: '',
});

console.log('\n=== Остаток к выдаче ===');
check('ничего не выдано', redeemableOf(line()) === 3);
check('выдано 1 из 3', redeemableOf(line({ redeemed: 1 })) === 2);
check('отменено 1 из 3', redeemableOf(line({ cancelled: 1 })) === 2);
check('выдано 1, отменено 1', redeemableOf(line({ redeemed: 1, cancelled: 1 })) === 1);
check('не уходит в минус', redeemableOf(line({ redeemed: 5 })) === 0);
check('поле cancelled может отсутствовать', redeemableOf({ ...line(), cancelled: undefined }) === 3);

console.log('\n=== Закрытие строки ===');
check('открыта, пока есть остаток', isLineClosed(line()) === false);
check('закрыта, когда всё выдано', isLineClosed(line({ redeemed: 3 })) === true);
check('закрыта, когда всё отменено', isLineClosed(line({ cancelled: 3 })) === true);

console.log('\n=== Статус заказа ===');
check('свежий заказ оплачен', deriveStatus(order([line()])) === 'paid');
check('частично выдан — всё ещё оплачен', deriveStatus(order([line({ redeemed: 1 })])) === 'paid');
check('всё выдано — использован', deriveStatus(order([line({ redeemed: 3 })])) === 'used');

check(
  'ВСЁ ОТМЕНЕНО — отменён, а не использован',
  deriveStatus(order([line({ cancelled: 3 })])) === 'cancelled',
  deriveStatus(order([line({ cancelled: 3 })])),
);

check(
  'часть выдана, остальное отменено — использован',
  deriveStatus(order([line({ redeemed: 1, cancelled: 2 })])) === 'used',
);

check(
  'две строки: одна выдана, вторая отменена — использован',
  deriveStatus(order([line({ redeemed: 3 }), line({ refId: 'b2', cancelled: 3 })])) === 'used',
);

check(
  'две строки, обе отменены — отменён',
  deriveStatus(order([line({ cancelled: 3 }), line({ refId: 'b2', cancelled: 3 })])) === 'cancelled',
);

check(
  'уже отменённый не переигрывается',
  deriveStatus(order([line({ redeemed: 3 })], 'cancelled')) === 'cancelled',
);

console.log('\n=== Стол не влияет на закрытие ===');
const table = { kind: 'table', refId: 't1', title: 'Стол V1', price: 2500000, qty: 1, redeemed: 0, cancelled: 0 };
check(
  'заказ из одного стола сохраняет статус',
  deriveStatus(order([table])) === 'paid',
);
check(
  'стол не мешает закрыть заказ по напиткам',
  deriveStatus(order([table, line({ redeemed: 3 })])) === 'used',
);
check(
  'стол не мешает признать отмену',
  deriveStatus(order([table, line({ cancelled: 3 })])) === 'cancelled',
);

console.log('\n=== Билеты ===');
const ticket = (over = {}) => line({ kind: 'ticket', refId: 'tt1', title: 'Standard', qty: 2, ...over });
check('билеты не погашены — оплачен', deriveStatus(order([ticket()])) === 'paid');
check('прошли все — использован', deriveStatus(order([ticket({ redeemed: 2 })])) === 'used');
check('билеты возвращены — отменён', deriveStatus(order([ticket({ cancelled: 2 })])) === 'cancelled');
check(
  'прошёл один из двух — всё ещё оплачен',
  deriveStatus(order([ticket({ redeemed: 1 })])) === 'paid',
);

console.log('\n=== Состояния оплаты ===');
// Эти статусы назначает оплата, а не выдача: вывести их из строк нельзя,
// и попытка вывести превратила бы неоплаченный заказ в оплаченный
check('резерв остаётся резервом', deriveStatus(order([ticket()], 'pending')) === 'pending');
check(
  'сгоревший резерв не оживает',
  deriveStatus(order([ticket({ redeemed: 2 })], 'expired')) === 'expired',
);
check(
  'отменённый заказ не становится использованным',
  deriveStatus(order([ticket({ redeemed: 2 })], 'cancelled')) === 'cancelled',
);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
