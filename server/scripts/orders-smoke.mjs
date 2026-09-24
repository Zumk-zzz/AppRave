/**
 * Сквозная проверка заказов ровно теми вызовами, которые делает приложение.
 *
 * Отдельно от api-smoke: тот проверяет сервер сам по себе, а этот — что
 * форма ответов совпадает с тем, что разбирают мапперы в src/services/api.
 * Расхождение здесь означает пустой экран на телефоне при зелёном сервере.
 *
 * Запуск: node scripts/orders-smoke.mjs
 */
import { topUpStock, topUpTickets } from './top-up.mjs';

const BASE = process.env.API_URL ?? 'http://localhost:3000';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

async function api(path, { method = 'GET', token, body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(contact) {
  const code = await api('/auth/request-code', { method: 'POST', body: { contact } });
  const verify = await api('/auth/verify', {
    method: 'POST',
    body: { contact, code: code.body.code ?? '0000' },
  });
  return verify.body;
}

/** Поля, которые читает src/services/api/mappers.ts. Нет поля — на экране дыра. */
const ORDER_FIELDS = [
  'id',
  'number',
  'status',
  'totalKopecks',
  'pointsEarned',
  'createdAt',
  'lines',
  'qrPayload',
];
const LINE_FIELDS = ['id', 'kind', 'refId', 'title', 'priceKopecks', 'qty', 'redeemed', 'cancelledQty'];

const missing = (obj, fields) => fields.filter((f) => obj?.[f] === undefined);

console.log('\n=== Вход ===');
const guest = await login(`+7999${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);
check('гость вошёл', !!guest?.token, guest?.user?.memberNo);

// Роль выдаётся админом, а не заводится в базе руками: проверяем заодно
// и тот путь, которым сотрудники появляются в жизни
const admin = await login('+79000000000');
const doormanContact = '+79000000002';
await api('/staff/members', {
  method: 'POST',
  token: admin.token,
  body: { contact: doormanContact, role: 'doorman' },
});

const doorman = await login(doormanContact);
check('фейсер вошёл', doorman?.user?.role === 'doorman', doorman?.user?.role);

const bartenderContact = '+79000000001';
await api('/staff/members', {
  method: 'POST',
  token: admin.token,
  body: { contact: bartenderContact, role: 'bartender' },
});
const bartender = await login(bartenderContact);
check('бармен вошёл', bartender?.user?.role === 'bartender', bartender?.user?.role);

// Сканировать можно только на смене: открываем её, как это делает
// сотрудник, приходя на работу
for (const token of [doorman.token, bartender.token]) {
  await api('/staff/shift/close', { method: 'POST', token, body: {} });
  await api('/staff/shift/open', { method: 'POST', token });
}

const events = await api('/events');
const event = events.body.find((e) => e.tickets.some((t) => t.available > 1));
check('есть событие с билетами', !!event, event?.title);

const menu = await api('/bar/menu');
const drink = menu.body.find((m) => m.available);

await topUpStock(api, admin.token, drink.id);
await topUpTickets(api, admin.token, event.id, event.tickets[0].id);

console.log('\n=== Покупка как в приложении ===');
const created = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: {
    eventId: event.id,
    tickets: [{ ticketTypeId: event.tickets.find((t) => t.available > 1).id, qty: 2 }],
    bar: [{ barItemId: drink.id, qty: 2 }],
  },
});
check('заказ создан', created.status === 201, `статус ${created.status}`);

const payment = await api('/payments', {
  method: 'POST',
  token: guest.token,
  body: { orderId: created.body.id },
});
await api('/webhooks/payment', {
  method: 'POST',
  body: { providerId: payment.body.providerId, status: 'succeeded' },
});

const mine = await api('/orders', { token: guest.token });
const order = mine.body.find((o) => o.id === created.body.id);
check('заказ виден в своих', !!order, `${mine.body.length} заказов`);
check('заказ оплачен', order.status === 'paid', order.status);

console.log('\n=== Форма ответа под мапперы ===');
check('в заказе есть всё нужное', missing(order, ORDER_FIELDS).length === 0, missing(order, ORDER_FIELDS).join(', '));
check(
  'в строках есть всё нужное',
  order.lines.every((l) => missing(l, LINE_FIELDS).length === 0),
  JSON.stringify(missing(order.lines[0], LINE_FIELDS)),
);
check('номер человекочитаемый', /^ORD-[A-Z0-9]{4}$/.test(order.number), order.number);
check('номер заказа в QR', order.qrPayload.split('|')[1] === order.number, order.qrPayload);

console.log('\n=== Отмена позиции ===');
const barLine = order.lines.find((l) => l.kind === 'bar');
const afterCancel = await api(`/orders/${order.id}/lines/${barLine.id}/cancel`, {
  method: 'POST',
  token: guest.token,
  body: { qty: 1 },
});
check(
  'одна порция отменена',
  afterCancel.body?.lines.find((l) => l.id === barLine.id)?.cancelledQty === 1,
  `статус ${afterCancel.status}`,
);
check('заказ остался оплаченным', afterCancel.body?.status === 'paid', afterCancel.body?.status);

console.log('\n=== Сканер ===');
const scan = await api(`/staff/scan/${order.number}`, { token: doorman.token });
check('заказ найден по номеру', scan.status === 200, `статус ${scan.status}`);
check(
  'сканер отдаёт полный заказ',
  missing(scan.body?.order, ORDER_FIELDS).length === 0,
  missing(scan.body?.order ?? {}, ORDER_FIELDS).join(', '),
);

const admit = await api(`/staff/scan/${order.number}/admit`, {
  method: 'POST',
  token: doorman.token,
  body: {},
});
check('гости пропущены', admit.body?.admitted === 2, `${admit.body?.admitted}`);
check(
  'проход отмечен в строке',
  admit.body?.order?.lines.find((l) => l.kind === 'ticket')?.redeemed === 2,
);

const twice = await api(`/staff/scan/${order.number}/admit`, {
  method: 'POST',
  token: doorman.token,
  body: {},
});
check('второй раз не пускает', twice.status === 409, `статус ${twice.status}`);

console.log('\n=== Заказ закрывается сам ===');
const wrongRole = await api(`/staff/scan/${order.number}/issue`, {
  method: 'POST',
  token: doorman.token,
  body: { lineId: barLine.id, qty: 1 },
});
check('фейсер напитки не выдаёт', wrongRole.status === 403, `статус ${wrongRole.status}`);

// Осталась одна порция: две куплены, одну гость отменил
const issue = await api(`/staff/scan/${order.number}/issue`, {
  method: 'POST',
  token: bartender.token,
  body: { lineId: barLine.id, qty: 1 },
});
check(
  'после выдачи всего заказ использован',
  issue.body?.order?.status === 'used',
  issue.body?.order?.status,
);

const closed = await api(`/orders/${order.id}/cancel`, { method: 'POST', token: guest.token });
check('использованный заказ не отменить', closed.status === 409, `статус ${closed.status}`);

for (const token of [doorman.token, bartender.token]) {
  await api('/staff/shift/close', { method: 'POST', token, body: {} });
}

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
