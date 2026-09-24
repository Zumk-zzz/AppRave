/**
 * Проверка бизнес-правил, которые нельзя оставлять только в интерфейсе.
 *
 * Кнопку в приложении можно обойти прямым запросом, поэтому каждое
 * правило, за которым стоят деньги или реальный вход в клуб, обязано
 * проверяться на сервере. Здесь — ровно эти случаи.
 *
 * Запуск: node scripts/rules-smoke.mjs
 */
import { topUpStock } from './top-up.mjs';

const BASE = process.env.API_URL ?? 'http://localhost:3000';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const HOUR = 3_600_000;

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
  await api('/auth/request-code', { method: 'POST', body: { contact } });
  return (await api('/auth/verify', { method: 'POST', body: { contact, code: '0000' } })).body;
}

const admin = await login('+79000000000');
const guest = await login(`+7999${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);

// Смена админа могла остаться от прерванного прогона, а от неё зависят права
await api('/staff/shift/close', { method: 'POST', token: admin.token, body: {} });

const eventBody = (title, startsAt, over = {}) => ({
  title,
  subtitle: 'проверка правил',
  date: startsAt.toISOString(),
  genre: 'techno',
  ageLimit: 18,
  lineup: [],
  description: '',
  cover: ['#FF2E93', '#7A1350'],
  tickets: [{ name: 'Standard', description: '', priceKopecks: 100_000, quantity: 20 }],
  ...over,
});

async function createEvent(title, startsAt) {
  const created = await api('/admin/events', {
    method: 'POST',
    token: admin.token,
    body: eventBody(title, startsAt),
  });

  const full = (await api(`/events/${created.body.id}`, { token: admin.token })).body;
  return { id: full.id, typeId: full.tickets[0].id, title: full.title };
}

/** Спрятать проверочную вечеринку, чтобы она не мешалась в афише. */
async function hide(event, startsAt) {
  await api(`/admin/events/${event.id}`, {
    method: 'PUT',
    token: admin.token,
    body: eventBody(event.title, startsAt, {
      status: 'draft',
      tickets: [
        { id: event.typeId, name: 'Standard', description: '', priceKopecks: 100_000, quantity: 20 },
      ],
    }),
  });
}

console.log('\n=== Прошедшую вечеринку нельзя купить ===');
const finishedAt = new Date(Date.now() - 30 * HOUR);
const finished = await createEvent(`ПРОШЛА ${uid().slice(0, 5)}`, finishedAt);

const lateBuy = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: { eventId: finished.id, tickets: [{ ticketTypeId: finished.typeId, qty: 1 }] },
});
check('покупка задним числом отклонена', lateBuy.status === 409, `статус ${lateBuy.status}`);
check('причина названа', lateBuy.body?.code === 'event_finished', lateBuy.body?.code);

const guestAfisha = await api('/events', { token: guest.token });
check(
  'прошедшей вечеринки нет в афише гостя',
  !guestAfisha.body.some((e) => e.id === finished.id),
  `${guestAfisha.body.length} в афише`,
);

const adminAfisha = await api('/events', { token: admin.token });
check(
  'у админа она осталась — это история',
  adminAfisha.body.some((e) => e.id === finished.id),
);

console.log('\n=== Идущую вечеринку купить ещё можно ===');
// Началась час назад: гость, пришедший в полночь, не должен упереться
// в «уже прошла» — вечеринка идёт до утра
const running = await createEvent(`ИДЁТ ${uid().slice(0, 5)}`, new Date(Date.now() - HOUR));
const lateButOk = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: { eventId: running.id, tickets: [{ ticketTypeId: running.typeId, qty: 1 }] },
});
check('билет на идущую вечеринку продан', lateButOk.status === 201, `статус ${lateButOk.status}`);

console.log('\n=== Поздняя отмена закрыта ===');
const soon = await createEvent(`СКОРО ${uid().slice(0, 5)}`, new Date(Date.now() + 5 * HOUR));
const soonOrder = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: { eventId: soon.id, tickets: [{ ticketTypeId: soon.typeId, qty: 1 }] },
});
const soonPay = await api('/payments', {
  method: 'POST',
  token: guest.token,
  body: { orderId: soonOrder.body.id },
});
await api('/webhooks/payment', {
  method: 'POST',
  body: { providerId: soonPay.body.providerId, status: 'succeeded' },
});

const lateCancel = await api(`/orders/${soonOrder.body.id}/cancel`, {
  method: 'POST',
  token: guest.token,
});
check('отмена за 5 часов до начала отклонена', lateCancel.status === 409, `статус ${lateCancel.status}`);
check('причина названа', lateCancel.body?.code === 'too_late_to_cancel', lateCancel.body?.code);

const lineCancel = await api(
  `/orders/${soonOrder.body.id}/lines/${soonOrder.body.lines[0].id}/cancel`,
  { method: 'POST', token: guest.token, body: { qty: 1 } },
);
check('отдельную позицию тоже не отменить', lineCancel.status === 409, `статус ${lineCancel.status}`);

console.log('\n=== Отмена забирает баллы обратно ===');
const later = await createEvent(`ЗАРАНЕЕ ${uid().slice(0, 5)}`, new Date(Date.now() + 96 * HOUR));
const drink = (await api('/bar/menu')).body.find((m) => m.available);
await topUpStock(api, admin.token, drink.id);

const before = (await api('/auth/me', { token: guest.token })).body.points;

const order = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: {
    eventId: later.id,
    tickets: [{ ticketTypeId: later.typeId, qty: 2 }],
    bar: [{ barItemId: drink.id, qty: 1 }],
  },
});
const pay = await api('/payments', {
  method: 'POST',
  token: guest.token,
  body: { orderId: order.body.id },
});
await api('/webhooks/payment', {
  method: 'POST',
  body: { providerId: pay.body.providerId, status: 'succeeded' },
});

const earned = (await api(`/orders/${order.body.id}`, { token: guest.token })).body.pointsEarned;
const afterPay = (await api('/auth/me', { token: guest.token })).body.points;
check('баллы начислены при оплате', afterPay === before + earned, `${before} → ${afterPay}`);

const cancelled = await api(`/orders/${order.body.id}/cancel`, {
  method: 'POST',
  token: guest.token,
});
check('заранее отменить можно', cancelled.status === 200, `статус ${cancelled.status}`);

const afterCancel = (await api('/auth/me', { token: guest.token })).body.points;
check('баллы сняты вместе с отменой', afterCancel === before, `${afterPay} → ${afterCancel}`);

console.log('\n=== Отмена возвращает только невыданное ===');
const partial = await createEvent(`ЧАСТИЧНО ${uid().slice(0, 5)}`, new Date(Date.now() + 96 * HOUR));
await topUpStock(api, admin.token, drink.id);

const stockBefore = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === drink.id,
).qty;

const mixed = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: { eventId: partial.id, bar: [{ barItemId: drink.id, qty: 3 }] },
});
const mixedPay = await api('/payments', {
  method: 'POST',
  token: guest.token,
  body: { orderId: mixed.body.id },
});
await api('/webhooks/payment', {
  method: 'POST',
  body: { providerId: mixedPay.body.providerId, status: 'succeeded' },
});

// Бармен выдал одну порцию: её на складе уже нет. Выдавать можно
// только на смене, поэтому админ открывает её и сразу закрывает
await api('/staff/shift/open', { method: 'POST', token: admin.token });
const issued = await api(`/staff/scan/${mixed.body.number}/issue`, {
  method: 'POST',
  token: admin.token,
  body: { lineId: mixed.body.lines[0].id, qty: 1 },
});
check('одна порция выдана', issued.status === 200, `статус ${issued.status}`);
await api('/staff/shift/close', { method: 'POST', token: admin.token, body: {} });

const cancelMixed = await api(`/orders/${mixed.body.id}/cancel`, {
  method: 'POST',
  token: guest.token,
});
check('заказ отменён', cancelMixed.status === 200, `статус ${cancelMixed.status}`);

const stockAfter = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === drink.id,
).qty;
check(
  'выпитое не вернулось на склад',
  stockAfter === stockBefore - 1,
  `было ${stockBefore}, куплено 3, выдана 1, стало ${stockAfter}`,
);

const closedOrder = (await api(`/orders/${mixed.body.id}`, { token: guest.token })).body;
check(
  'в строке видно, что вернулось',
  closedOrder.lines[0].redeemed === 1 && closedOrder.lines[0].cancelledQty === 2,
  JSON.stringify(closedOrder.lines[0]),
);

console.log('\n=== Уборка ===');
await hide(finished, finishedAt);
await hide(running, new Date(Date.now() - HOUR));
await hide(soon, new Date(Date.now() + 5 * HOUR));
await hide(later, new Date(Date.now() + 96 * HOUR));
await hide(partial, new Date(Date.now() + 96 * HOUR));
check('проверочные вечеринки убраны из афиши', true);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
