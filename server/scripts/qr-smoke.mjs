/** Only run against a disposable seeded database. */
import assert from 'node:assert/strict';
const BASE = process.env.API_URL ?? 'http://127.0.0.1:3000';
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(BASE + path, { method, headers: {
    'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}),
    'idempotency-key': crypto.randomUUID(),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
async function login(contact) {
  await api('/auth/request-code', null, { contact });
  const res = await api('/auth/verify', null, { contact, code: '0000' });
  assert.equal(res.status, 200);
  return res.body;
}
const admin = await login('+79000000000');
const guest = await login(`qr-${crypto.randomUUID()}@example.com`);
const workers = [];
async function worker(role, name) {
  const contact = `qr-${crypto.randomUUID()}@example.com`;
  assert.equal((await api('/staff/members', admin.token, { contact, role, name })).status, 200);
  const user = await login(contact);
  assert.equal((await api('/staff/shift/open', user.token, {})).status, 200);
  workers.push(user);
  return user;
}
try {
  const door = await worker('doorman', 'Фейсер QR');
  const bar1 = await worker('bartender', 'Бармен Первый');
  const bar2 = await worker('bartender', 'Бармен Второй');
  const event = (await api('/events')).body.find((e) => new Date(e.date).getTime() > Date.now()+24*3600000 && e.tickets.some((t) => t.available > 10));
  assert.ok(event, 'Нужно событие с билетами');
  const ticket = event.tickets.find((t) => t.available > 10);
  const drink = (await api('/bar/menu')).body.find((b) => b.available);
  await api('/stock/moves', admin.token, { barItemId: drink.id, kind: 'receipt', delta: 20, comment: 'QR smoke' });
  async function order(paid = true, qty = 3) {
    const created = await api('/orders', guest.token, { eventId: event.id,
      tickets: [{ ticketTypeId: ticket.id, qty: 1 }], bar: [{ barItemId: drink.id, qty }] });
    assert.equal(created.status, 201);
    if (paid) {
      const payment = await api('/payments', guest.token, { orderId: created.body.id });
      assert.equal((await api('/webhooks/payment', guest.token, { providerId: payment.body.providerId, status: 'succeeded' })).status, 200);
    }
    return created.body;
  }
  const mixed = await order();
  const path = `/staff/scan/${mixed.number}`;
  const b = (await api(path, bar1.token)).body.order;
  const d = (await api(path, door.token)).body.order;
  assert.ok(b.lines.length > 0 && b.lines.every((l) => l.kind === 'bar'));
  assert.ok(d.lines.length > 0 && d.lines.every((l) => l.kind === 'ticket'));
  assert.equal(b.entry.total, 0);
  assert.equal(b.guest.contact, null);
  assert.equal(b.table, null);
  assert.equal(d.bar.length, 0);
  assert.equal(d.table, null);
  assert.equal(b.totalKopecks, drink.priceKopecks * 3);
  assert.equal(d.totalKopecks, ticket.priceKopecks);
  for (const [user, kind] of [[bar1, 'bar'], [door, 'ticket']]) {
    const list = (await api('/staff/orders', user.token)).body;
    assert.ok(list.length && list.every((o) => o.lines.length && o.lines.every((l) => l.kind === kind)));
  }
  assert.equal((await api(`${path}/admit`, bar1.token, {})).status, 403);
  assert.equal((await api(`${path}/issue`, door.token, { lineId: b.bar[0].lineId, qty: 1 })).status, 403);
  console.log('OK: состав, суммы, списки и действия разделены по ролям');

  const admissions = await Promise.all([api(`${path}/admit`, door.token, {}), api(`${path}/admit`, door.token, {})]);
  assert.equal(admissions.filter((r) => r.status === 200).length, 1);
  assert.equal(admissions.filter((r) => r.status === 409).length, 1);
  assert.ok(admissions.find((r) => r.status === 200).body.order.lines.every((l) => l.kind === 'ticket'));
  assert.equal((await api(`/orders/${mixed.id}/bar/request`, guest.token, {})).status, 200);
  assert.equal((await api(`/staff/bar/${b.bar[0].lineId}/prepare`, bar1.token, {})).status, 200);
  assert.equal((await api(`/staff/bar/${b.bar[0].lineId}/ready`, bar1.token, { qty: 3, expectedPreparing: 3 })).status, 200);
  const races = await Promise.all([bar1, bar2].map((u) => api(`${path}/issue`, u.token, { lineId: b.bar[0].lineId, qty: 2 })));
  assert.equal(races.filter((r) => r.status === 200).length, 1);
  assert.equal(races.filter((r) => r.status === 400).length, 1);
  assert.ok(races.find((r) => r.status === 200).body.order.lines.every((l) => l.kind === 'bar'));
  const winner = races[0].status === 200 ? bar1 : bar2;
  const other = winner === bar1 ? bar2 : bar1;
  assert.equal((await api(`${path}/issue`, other.token, { lineId: b.bar[0].lineId, qty: 1 })).status, 200);
  assert.equal((await api(`${path}/issue`, other.token, { lineId: b.bar[0].lineId, qty: 1 })).status, 409);
  console.log('OK: одновременный вход и выдача не дублируют исполнение');

  const historyPath = `/staff/fulfillments?orderId=${mixed.id}`;
  const team = (await api(historyPath, admin.token)).body.items;
  assert.equal(team.length, 5);
  const drinks = team.filter((a) => a.kind === 'bar_issued');
  assert.equal(drinks.reduce((n, a) => n + a.details.qty, 0), 3);
  assert.ok(drinks.some((a) => a.actor.id === winner.user.id && a.details.qty === 2));
  assert.ok(drinks.some((a) => a.actor.id === other.user.id && a.details.qty === 1));
  assert.ok(team.every((a) => a.actor.name && a.shiftId && a.details.number === mixed.number));
  for (const user of [bar1, bar2, door]) {
    const own = (await api(historyPath, user.token)).body.items;
    assert.equal(own.length, user === bar1 ? 3 : 1);
    assert.equal(own[0].actor.id, user.user.id);
  }
  assert.equal((await api(historyPath, guest.token)).status, 403);
  assert.equal((await api(historyPath)).status, 401);
  console.log('OK: история содержит исполнителей; чужие записи закрыты');

  const unpaid = await order(false);
  const unscanned = (await api(`/staff/scan/${unpaid.number}`, bar1.token)).body.order;
  assert.equal((await api(`/staff/scan/${unpaid.number}/issue`, bar1.token, { lineId: unscanned.bar[0].lineId, qty: 1 })).status, 409);
  assert.equal((await api(`/staff/fulfillments?orderId=${unpaid.id}`, admin.token)).body.items.length, 0);
  console.log('OK: неоплаченный заказ не выдаётся и не попадает в историю');

  const cancellable = await order(true, 1);
  const line = cancellable.lines.find((l) => l.kind === 'bar');
  const competing = await Promise.all([
    api(`/staff/scan/${cancellable.number}/issue`, bar1.token, { lineId: line.id, qty: 1 }),
    api(`/orders/${cancellable.id}/lines/${line.id}/cancel`, guest.token, { qty: 1 }),
  ]);
  assert.equal(competing.filter((r) => r.status === 200).length, 1);
  const final = (await api(`/orders/${cancellable.id}`, guest.token)).body.lines.find((l) => l.id === line.id);
  assert.equal(final.redeemed + final.cancelledQty, 1);
  console.log('OK: отмена и выдача одной единицы не происходят одновременно');

  await api('/staff/shift/close', bar1.token, {});
  assert.equal((await api(path, bar1.token)).status, 403);
  assert.equal((await api(historyPath, bar1.token)).body.items.length, 3);
  console.log('OK: вне смены выдача закрыта, своя история доступна');
} finally {
  for (const user of workers) await api('/staff/shift/close', user.token, {});
}
