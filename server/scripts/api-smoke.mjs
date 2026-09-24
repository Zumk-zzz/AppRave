/**
 * Сквозная проверка API: вход, каталог, покупка, гонка за последний билет,
 * двойная бронь стола, оплата, идемпотентность, отмена.
 */
import { execFileSync } from 'node:child_process';

import { topUpStock, topUpTickets } from './top-up.mjs';

const BASE = 'http://127.0.0.1:3000';

/**
 * Выполняет SQL в контейнере базы.
 *
 * Нужно, чтобы тест сам готовил себе условия: сценарий гонки требует
 * типа билета с малым остатком, а прошлый прогон его раскупает. Без
 * подготовки тест проходит один раз, а потом молча перестаёт проверять
 * главное — это хуже, чем отсутствие теста.
 */
function sql(query) {
  return execFileSync('docker', ['exec', 'apprave-db', 'psql', '-U', 'apprave', '-d', 'apprave', '-tAc', query], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

async function api(path, { method = 'GET', token, body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function login(phone) {
  await api('/auth/request-code', { method: 'POST', body: { contact: phone } });
  const r = await api('/auth/verify', { method: 'POST', body: { contact: phone, code: '0000' } });
  if (!r.body?.token) throw new Error(`вход не удался: ${JSON.stringify(r.body)}`);
  return r.body;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

console.log('\n=== Здоровье ===');
const health = await api('/health');
check('GET /health', health.status === 200 && health.body?.ok === true);

console.log('\n=== Авторизация ===');
const guest = await login('+79991110001');
check('гость получил токен', !!guest.token);
check('роль guest', guest.user.role === 'guest', guest.user.role);

const admin = await login('+79000000000');
check('админ получил роль admin', admin.user.role === 'admin', admin.user.role);

const badCode = await api('/auth/verify', { method: 'POST', body: { contact: '+79991110001', code: '9999' } });
check('неверный код отклонён', badCode.status === 400, `статус ${badCode.status}`);

console.log('\n=== Каталог ===');
const events = await api('/events');
check('афиша отдаётся', events.status === 200 && events.body.length > 0, `${events.body?.length} событий`);

const withStock = events.body.find((e) => e.tickets.some((t) => t.available > 0));

// Проверяем границы остатка, а не наличие распроданного типа: предыдущий
// прогон мог вернуть билеты в продажу отменой, и тогда распроданных типов
// просто нет. Что остаток обнуляется, проверяет раздел про гонку ниже.
const allTickets = events.body.flatMap((e) => e.tickets);
check(
  'остаток билетов не уходит в минус',
  allTickets.every((t) => t.available >= 0 && t.available <= t.quantity),
  `${allTickets.length} типов`,
);

const noAuthTables = await api(`/events/${withStock.id}/tables`);
check('схема зала отдаётся', noAuthTables.status === 200 && noAuthTables.body.length === 12);

console.log('\n=== Защита ролей ===');
// Прошлый прогон мог прерваться с открытой сменой, а от неё зависят
// права: без уборки набор проверял бы не то, что написано в его названиях
await api('/staff/shift/close', { method: 'POST', token: admin.token, body: {} });

// Сотрудник не на смене — обычный гость: он тоже приходит отдыхать
const offShift = await api('/orders', {
  method: 'POST', token: admin.token, key: uid(),
  body: { eventId: withStock.id, tickets: [{ ticketTypeId: withStock.tickets[0].id, qty: 1 }] },
});
check('вне смены админ покупает как гость', offShift.status === 201, `статус ${offShift.status}`);

// А на смене — не покупает: это исказило бы выручку и позволило бы
// выписать себе билет мимо кассы
await api('/staff/shift/open', { method: 'POST', token: admin.token });
const onShift = await api('/orders', {
  method: 'POST', token: admin.token, key: uid(),
  body: { eventId: withStock.id, tickets: [{ ticketTypeId: withStock.tickets[0].id, qty: 1 }] },
});
check('на смене покупать нельзя', onShift.status === 403, `статус ${onShift.status}`);
await api('/staff/shift/close', { method: 'POST', token: admin.token, body: {} });

const noToken = await api('/orders', { method: 'POST', key: uid(), body: { eventId: withStock.id } });
check('без токена заказ отклонён', noToken.status === 401, `статус ${noToken.status}`);

console.log('\n=== Цена берётся из базы ===');
await topUpTickets(api, admin.token, withStock.id, withStock.tickets[0].id);
const ticketType = (await api(`/events/${withStock.id}`)).body.tickets[0];
const order1 = await api('/orders', {
  method: 'POST', token: guest.token, key: uid(),
  body: { eventId: withStock.id, tickets: [{ ticketTypeId: ticketType.id, qty: 1 }] },
});
check('заказ создан', order1.status === 201, `статус ${order1.status}`);
check('цена совпала с каталогом',
  order1.body?.totalKopecks === ticketType.priceKopecks,
  `${order1.body?.totalKopecks} против ${ticketType.priceKopecks}`);
check('статус pending', order1.body?.status === 'pending');
check('резерв имеет срок', !!order1.body?.expiresAt);

console.log('\n=== Идемпотентность ===');
const sameKey = uid();
const first = await api('/orders', {
  method: 'POST', token: guest.token, key: sameKey,
  body: { eventId: withStock.id, tickets: [{ ticketTypeId: ticketType.id, qty: 1 }] },
});
const repeat = await api('/orders', {
  method: 'POST', token: guest.token, key: sameKey,
  body: { eventId: withStock.id, tickets: [{ ticketTypeId: ticketType.id, qty: 1 }] },
});
check('повтор вернул тот же заказ', first.body?.id === repeat.body?.id, `${first.body?.id} / ${repeat.body?.id}`);
check('повтор не создал второй', repeat.status === 200, `статус ${repeat.status}`);

console.log('\n=== Гонка за последний билет ===');
// Тип с 4 билетами: шлём 6 параллельных запросов, пройти должны ровно 4
// Готовим дефицит сами: выставляем выбранному типу ровно 4 свободных места.
// Иначе тест проходит один раз, а потом молча перестаёт проверять главное.
const targetId = sql(`SELECT id FROM ticket_types ORDER BY price_kopecks DESC LIMIT 1`);
sql(`UPDATE ticket_types SET quantity = sold + 4 WHERE id = '${targetId}'`);

const refreshed = await api('/events');
const scarce = refreshed.body.flatMap((e) => e.tickets.map((t) => ({ ...t, eventId: e.id })))
  .find((t) => t.id === targetId);

if (scarce) {
  const before = scarce.available;
  const attempts = await Promise.all(
    Array.from({ length: before + 2 }, () =>
      api('/orders', {
        method: 'POST', token: guest.token, key: uid(),
        body: { eventId: scarce.eventId, tickets: [{ ticketTypeId: scarce.id, qty: 1 }] },
      }),
    ),
  );
  const ok = attempts.filter((a) => a.status === 201).length;
  const rejected = attempts.filter((a) => a.status === 409).length;
  check(`продано ровно ${before} из ${before + 2} попыток`, ok === before, `прошло ${ok}, отклонено ${rejected}`);
  check('лишние получили 409', rejected === 2, `${rejected}`);

  const after = await api(`/events/${scarce.eventId}`);
  const t = after.body.tickets.find((x) => x.id === scarce.id);
  check('остаток обнулился', t.available === 0, `available=${t.available}`);
} else {
  check('найден дефицитный тип билета', false, 'не найден');
}

console.log('\n=== Двойная бронь стола ===');
const tables = (await api(`/events/${withStock.id}/tables`)).body;
const freeTable = tables.find((t) => !t.taken);
if (!freeTable) {
  check('есть свободный стол', false, 'все заняты — пересейте базу');
  process.exit(1);
}
const both = await Promise.all([
  api('/orders', { method: 'POST', token: guest.token, key: uid(),
    body: { eventId: withStock.id, table: { tableId: freeTable.id, guests: ['Иван Петров'] } } }),
  api('/orders', { method: 'POST', token: guest.token, key: uid(),
    body: { eventId: withStock.id, table: { tableId: freeTable.id, guests: [] } } }),
]);
const booked = both.filter((r) => r.status === 201).length;
check('забронирован ровно один', booked === 1, `прошло ${booked}`);
check('второй получил 409', both.some((r) => r.status === 409), both.map((r) => r.status).join('/'));

const afterBooking = (await api(`/events/${withStock.id}/tables`)).body;
check('стол помечен занятым', afterBooking.find((t) => t.id === freeTable.id)?.taken === true);

console.log('\n=== Списание со склада ===');
const menu = (await api('/bar/menu')).body;
const drink = menu.find((m) => m.available && m.category === 'cocktails');
await topUpStock(api, admin.token, drink.id);
const barOrder = await api('/orders', {
  method: 'POST', token: guest.token, key: uid(),
  body: { eventId: withStock.id, bar: [{ barItemId: drink.id, qty: 3 }] },
});
check('заказ бара создан', barOrder.status === 201, `статус ${barOrder.status}`);

console.log('\n=== Оплата ===');
const pay = await api('/payments', { method: 'POST', token: guest.token, body: { orderId: barOrder.body.id } });
check('платёж создан', pay.status === 200 && !!pay.body?.providerId);

const hook = await api('/webhooks/payment', { method: 'POST', body: { providerId: pay.body.providerId, status: 'succeeded' } });
check('вебхук обработан', hook.status === 200 && hook.body?.ok === true);

const paid = await api(`/orders/${barOrder.body.id}`, { token: guest.token });
check('заказ стал paid', paid.body?.status === 'paid', paid.body?.status);
check('резерв снят', paid.body?.expiresAt === null);

const hookAgain = await api('/webhooks/payment', { method: 'POST', body: { providerId: pay.body.providerId, status: 'succeeded' } });
check('повторный вебхук идемпотентен', hookAgain.body?.alreadyProcessed === true);

const me = await api('/auth/me', { token: guest.token });
check('баллы начислены', me.body?.points > 0, `${me.body?.points}`);

console.log('\n=== Отмена одной позиции ===');
const partial = await api('/orders', {
  method: 'POST', token: guest.token, key: uid(),
  body: { eventId: withStock.id, bar: [{ barItemId: drink.id, qty: 3 }] },
});
const partialLine = partial.body.lines.find((l) => l.kind === 'bar');
check('строка заказа имеет id', !!partialLine?.id);
check('в строке видно выданное и отменённое', partialLine.redeemed === 0 && partialLine.cancelledQty === 0);

const cancelLine = await api(`/orders/${partial.body.id}/lines/${partialLine.id}/cancel`, {
  method: 'POST', token: guest.token, body: { qty: 1 },
});
check('одна порция отменена', cancelLine.status === 200, `статус ${cancelLine.status}`);
check('отмена учтена в строке',
  cancelLine.body?.lines.find((l) => l.id === partialLine.id)?.cancelledQty === 1,
  JSON.stringify(cancelLine.body?.lines.find((l) => l.id === partialLine.id)));
check('заказ остался живым', cancelLine.body?.status === 'pending', cancelLine.body?.status);

const tooMuch = await api(`/orders/${partial.body.id}/lines/${partialLine.id}/cancel`, {
  method: 'POST', token: guest.token, body: { qty: 5 },
});
check('больше оставшегося отменить нельзя', tooMuch.status === 409, `статус ${tooMuch.status}`);

const restCancel = await api(`/orders/${partial.body.id}/lines/${partialLine.id}/cancel`, {
  method: 'POST', token: guest.token, body: { qty: 2 },
});
check('после отмены всех позиций заказ отменён', restCancel.body?.status === 'cancelled', restCancel.body?.status);

const foreign = await api(`/orders/${partial.body.id}/lines/${partialLine.id}/cancel`, {
  method: 'POST', token: admin.token, body: { qty: 1 },
});
check('чужой заказ не отменить', foreign.status === 404, `статус ${foreign.status}`);

console.log('\n=== Отмена возвращает товар ===');
const stockBefore = (await api('/bar/menu')).body;
const cancel = await api(`/orders/${barOrder.body.id}/cancel`, { method: 'POST', token: guest.token });
check('заказ отменён', cancel.body?.status === 'cancelled', cancel.body?.status);

const tableOrderId = both.find((r) => r.status === 201).body.id;
await api(`/orders/${tableOrderId}/cancel`, { method: 'POST', token: guest.token });
const tablesAfterCancel = (await api(`/events/${withStock.id}/tables`)).body;
check('стол снова свободен', tablesAfterCancel.find((t) => t.id === freeTable.id)?.taken === false);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
