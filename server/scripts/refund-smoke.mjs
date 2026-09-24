/**
 * Проверка возврата денег за отменённую вечеринку.
 *
 * Здесь проверяется в первую очередь не то, что возврат работает,
 * а то, что его нельзя выполнить случайно: без права, по живой
 * вечеринке, без точного названия или дважды подряд.
 *
 * Запуск: node scripts/refund-smoke.mjs
 */
import { topUpStock } from './top-up.mjs';

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
  await api('/auth/request-code', { method: 'POST', body: { contact } });
  return (await api('/auth/verify', { method: 'POST', body: { contact, code: '0000' } })).body;
}

const admin = await login('+79000000000');
const guest = await login(`+7999${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);

await api('/staff/members', {
  method: 'POST',
  token: admin.token,
  body: { contact: '+79001110033', role: 'manager', name: 'Менеджер Анна' },
});
const manager = await login('+79001110033');

const TITLE = `ОТМЕНА ${uid().slice(0, 6)}`;

const eventBody = (over = {}) => ({
  title: TITLE,
  subtitle: 'проверка возврата',
  date: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  genre: 'house',
  ageLimit: 18,
  lineup: [],
  description: '',
  cover: ['#FF2E93', '#7A1350'],
  tickets: [{ name: 'Standard', description: '', priceKopecks: 200_000, quantity: 10 }],
  // Новая вечеринка заводится черновиком, а купить можно только
  // опубликованную — публикуем сразу, как это делает администратор
  status: 'published',
  ...over,
});

console.log('\n=== Подготовка ===');
const created = await api('/admin/events', { method: 'POST', token: admin.token, body: eventBody() });
const eventId = created.body.id;
check('вечеринка создана', created.status === 201, `статус ${created.status}`);

const event = (await api(`/events/${eventId}`, { token: admin.token })).body;
const typeId = event.tickets[0].id;

const drink = (await api('/bar/menu')).body.find((m) => m.available);
await topUpStock(api, admin.token, drink.id);

const order = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: {
    eventId,
    tickets: [{ ticketTypeId: typeId, qty: 2 }],
    bar: [{ barItemId: drink.id, qty: 2 }],
  },
});
const payment = await api('/payments', { method: 'POST', token: guest.token, body: { orderId: order.body.id } });
await api('/webhooks/payment', {
  method: 'POST',
  body: { providerId: payment.body.providerId, status: 'succeeded' },
});
check('гость купил и оплатил', order.status === 201, `статус ${order.status}`);

const before = (await api('/auth/me', { token: guest.token })).body;
check('баллы начислены', before.points > 0, `${before.points}`);

const stockBefore = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === drink.id,
).qty;

console.log('\n=== Возврат нельзя выполнить случайно ===');
const byGuest = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: guest.token, body: { confirm: TITLE },
});
check('гость не возвращает деньги', byGuest.status === 403, `статус ${byGuest.status}`);

const byManager = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: manager.token, body: { confirm: TITLE },
});
check('управляющему возврат закрыт', byManager.status === 403, `статус ${byManager.status}`);

const alive = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: admin.token, body: { confirm: TITLE },
});
check('по живой вечеринке возврата нет', alive.status === 409, `статус ${alive.status}`);
check('ответ объясняет, чего не хватает', alive.body?.code === 'event_not_cancelled', alive.body?.code);

console.log('\n=== После отмены вечеринки ===');
await api(`/admin/events/${eventId}`, {
  method: 'PUT',
  token: admin.token,
  body: eventBody({
    status: 'cancelled',
    tickets: [{ id: typeId, name: 'Standard', description: '', priceKopecks: 200_000, quantity: 10 }],
  }),
});

const wrongName = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: admin.token, body: { confirm: TITLE.toLowerCase() },
});
check('без точного названия возврата нет', wrongName.status === 409, `статус ${wrongName.status}`);
check('причина названа', wrongName.body?.code === 'confirm_mismatch', wrongName.body?.code);

const preview = await api(`/admin/events/${eventId}/refund`, { token: admin.token });
check('предпросмотр показывает объём', preview.body?.orders === 1, JSON.stringify(preview.body));
check('предпросмотр показывает сумму', preview.body?.totalKopecks === order.body.totalKopecks);
check('предпросмотр говорит, что всё готово', preview.body?.ready === true);

console.log('\n=== Возврат ===');
const refund = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: admin.token, body: { confirm: TITLE },
});
check('возврат выполнен', refund.status === 200 && refund.body?.refunded === 1, JSON.stringify(refund.body));
check('сумма совпадает с заказом', refund.body?.totalKopecks === order.body.totalKopecks);

const after = (await api(`/orders/${order.body.id}`, { token: guest.token })).body;
check('заказ помечен возвратом', after.status === 'refunded', after.status);

const me = (await api('/auth/me', { token: guest.token })).body;
check('баллы сняты вместе с деньгами', me.points === before.points - order.body.pointsEarned, `${me.points}`);

const stockAfter = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === drink.id,
).qty;
check('невыданные напитки вернулись на склад', stockAfter === stockBefore + 2, `${stockBefore} → ${stockAfter}`);

const journal = await api('/staff/actions', { token: admin.token });
const entry = journal.body.find((a) => a.kind === 'refund_issued');
check('возврат записан в журнал', !!entry, JSON.stringify(entry?.details));

console.log('\n=== Повтор безопасен ===');
const again = await api(`/admin/events/${eventId}/refund`, {
  method: 'POST', token: admin.token, body: { confirm: TITLE },
});
check('второй возврат ничего не возвращает', again.body?.refunded === 0, JSON.stringify(again.body));

const stockFinal = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === drink.id,
).qty;
check('склад не вырос от повтора', stockFinal === stockAfter, `${stockAfter} → ${stockFinal}`);

const meFinal = (await api('/auth/me', { token: guest.token })).body;
check('баллы не ушли в минус', meFinal.points === me.points, `${meFinal.points}`);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
