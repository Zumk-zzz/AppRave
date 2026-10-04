/** Запускать только против отдельной тестовой базы: сценарий создаёт и отменяет вечеринку. */
import assert from 'node:assert/strict';
const BASE = process.env.API_URL ?? 'http://127.0.0.1:3000';
async function api(path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}), 'idempotency-key': crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
async function ok(path, token, body, method, expected = 200) {
  const r = await api(path, token, body, method);
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(r.body)}`);
  return r.body;
}
async function login(contact = `flow-${crypto.randomUUID()}@example.com`) {
  await ok('/auth/request-code', null, { contact });
  return ok('/auth/verify', null, { contact, code: '0000' });
}
const admin = await login('+79000000000');
const owner = await login(), friend = await login(), stranger = await login();
const workers = [];
async function worker(role) {
  const contact = `flow-${crypto.randomUUID()}@example.com`;
  await ok('/staff/members', admin.token, { contact, role, name: `Flow ${role} ${workers.length}` });
  const user = await login(contact);
  await ok('/staff/shift/open', user.token, {}); workers.push(user); return user;
}
const eventBody = { title: `FLOW ${crypto.randomUUID()}`, subtitle: '', date: new Date(Date.now() + 96 * 3600000).toISOString(),
  genre: 'techno', ageLimit: 18, lineup: [], description: '', cover: ['#FF2E93', '#7A1350'], status: 'published',
  tickets: [{ name: 'Вход', description: '', priceKopecks: 10000, quantity: 100 }] };
try {
  const door = await worker('doorman'), bar1 = await worker('bartender'), bar2 = await worker('bartender');
  const event = await ok('/admin/events', admin.token, eventBody, 'POST', 201);
  const fullEvent = await ok(`/events/${event.id}`);
  eventBody.tickets[0].id = fullEvent.tickets[0].id;
  const drink = (await ok('/bar/menu')).find((b) => b.available);
  await ok('/stock/moves', admin.token, { barItemId: drink.id, kind: 'receipt', delta: 40, comment: 'Fulfillment test' }, 'POST', 201);
  const tableBody = { label: `FLOW-${crypto.randomUUID().slice(0,8)}`, zone: 'vip', seats: 4, includedEntries: 4,
    depositKopecks: 100000, x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
  const table = await ok('/admin/tables', admin.token, tableBody, 'POST', 201);
  assert.equal((await api('/admin/tables', admin.token, { ...tableBody, seats: 2 })).status, 400);
  async function purchase(user, body) {
    const order = await ok('/orders', user.token, { eventId: event.id, ...body }, 'POST', 201);
    const payment = await ok('/payments', user.token, { orderId: order.id });
    await ok('/webhooks/payment', user.token, { providerId: payment.providerId, status: 'succeeded' });
    return ok(`/orders/${order.id}`, user.token);
  }
  const order = await purchase(owner, { table: { tableId: table.id, guests: ['Владелец', 'Друг'] }, bar: [{ barItemId: drink.id, qty: 3 }] });
  const bar = order.lines.find((l) => l.kind === 'bar');
  const path = `/staff/scan/${order.number}`;
  const barPath = `/staff/bar/${bar.id}`;
  assert.equal(order.lines.find((l) => l.kind === 'table').entryIncluded, 4);
  await ok(`/admin/tables/${table.id}`, admin.token, { ...tableBody, includedEntries: 0 }, 'PUT');
  assert.equal((await ok(`/orders/${order.id}`, owner.token)).lines.find((l) => l.kind === 'table').entryIncluded, 4);
  assert.equal((await api(`/orders/${order.id}/bar/request`, owner.token, {})).body.code, 'entry_required');
  assert.equal((await api(`${barPath}/prepare`, bar1.token, {})).status, 409);
  console.log('OK: проходы стола сохраняются на момент покупки; бар нельзя запустить до входа');

  const requestId = crypto.randomUUID();
  const duplicates = await Promise.all([1,2].map(() => ok(`/orders/${order.id}/invitations`, owner.token, { name: 'Друг', requestId })));
  assert.equal(duplicates[0].token, duplicates[1].token);
  const invite = duplicates[0], ip = `/invitations/${invite.token}`, sp = `/staff/invitations/${invite.token}`;
  assert.equal((await api(`/orders/${order.id}/invitations`, stranger.token)).status, 404);
  const preview = await ok(ip);
  assert.deepEqual(Object.keys(preview).sort(), ['eventDate','eventTitle','name','status']);
  assert.equal((await api(sp, door.token)).status, 409);
  await ok(`${ip}/claim`, friend.token, {});
  assert.equal((await api(`${ip}/claim`, stranger.token, {})).status, 409);
  assert.equal((await api(sp, bar1.token)).status, 403);
  const scoped = (await ok(path, door.token)).order;
  assert.equal(scoped.entry.total, 4); assert.equal(scoped.entry.left, 3);
  assert.ok(scoped.lines.every((l) => l.kind === 'ticket'));
  assert.equal((await api(`${path}/admit`, door.token, { qty: 4 })).status, 409);
  const entrants = await Promise.all([1,2].map(() => api(`${path}/admit`, door.token, { qty: 1, ownerPresent: false, expectedRemaining: 3 })));
  assert.deepEqual(entrants.map((r) => r.status).sort(), [200,409]);
  assert.equal((await api(`/orders/${order.id}/bar/request`, owner.token, {})).body.code, 'entry_required');
  await ok(`${path}/admit`, door.token, { qty: 1, ownerPresent: true, expectedRemaining: 2 });
  await ok(`${path}/admit`, door.token, { qty: 1, ownerPresent: false, expectedRemaining: 1 });
  assert.equal((await api(`${path}/admit`, door.token, {})).status, 409);
  const friendScan = (await ok(sp, door.token)).order;
  assert.equal(friendScan.lines.length, 1); assert.equal(friendScan.lines[0].kind, 'ticket');
  assert.ok(!friendScan.guest && !friendScan.table && friendScan.totalKopecks === 0);
  const invitedAdmissions = await Promise.all([1,2].map(() => api(`${sp}/admit`, door.token, {})));
  assert.deepEqual(invitedAdmissions.map((r) => r.status).sort(), [200,409]);
  assert.equal((await api(`${ip}/revoke`, owner.token, {})).status, 409);
  assert.equal((await ok(ip)).status, 'used');
  console.log('OK: общий QR и приглашение расходуют общий лимит, повторы не увеличивают вход');

  assert.equal((await api(`/orders/${order.id}/bar/request`, friend.token, {})).status, 404);
  await ok(`/orders/${order.id}/bar/request`, owner.token, {});
  await ok(`/orders/${order.id}/bar/request`, owner.token, {});
  assert.equal((await api(`/orders/${order.id}/lines/${bar.id}/cancel`, owner.token, { qty: 1 })).status, 409);
  const claims = await Promise.all([bar1,bar2].map((u) => api(`${barPath}/prepare`, u.token, {})));
  assert.deepEqual(claims.map((r) => r.status).sort(), [200,409]);
  const preparer = claims[0].status === 200 ? bar1 : bar2, issuer = preparer === bar1 ? bar2 : bar1;
  await ok(`${barPath}/prepare`, preparer.token, {});
  assert.equal((await api(`${barPath}/ready`, issuer.token, { qty: 1, expectedPreparing: 3 })).status, 403);
  assert.equal((await api(`${path}/issue`, issuer.token, { lineId: bar.id, qty: 1 })).body.code, 'not_ready');
  const readiness = await Promise.all([1,2].map(() => api(`${barPath}/ready`, preparer.token, { qty: 1, expectedPreparing: 3 })));
  assert.deepEqual(readiness.map((r) => r.status).sort(), [200,409]);
  assert.equal((await api(`${path}/issue`, issuer.token, { lineId: bar.id, qty: 2 })).body.code, 'not_ready');
  await ok(`${path}/issue`, issuer.token, { lineId: bar.id, qty: 1, expectedRedeemed: 0 });
  await ok(`${barPath}/ready`, preparer.token, { qty: 2, expectedPreparing: 2 });
  assert.equal((await api(`${path}/issue`, issuer.token, { lineId: bar.id, qty: 1, expectedRedeemed: 0 })).body.code, 'stale_issue');
  await ok(`${path}/issue`, issuer.token, { lineId: bar.id, qty: 2, expectedRedeemed: 1 });
  const finished = await ok(`/orders/${order.id}`, owner.token);
  assert.equal(finished.status, 'used');
  const finalBar = finished.lines.find((l) => l.id === bar.id);
  assert.equal(finalBar.redeemed, 3); assert.equal(finalBar.readyQty, 0); assert.equal(finalBar.preparingQty, 0);
  const history = (await ok(`/staff/fulfillments?orderId=${order.id}`, admin.token)).items;
  assert.equal(history.filter((a) => a.kind === 'bar_started').length, 1);
  assert.ok(history.filter((a) => a.kind === 'bar_ready').every((a) => a.actor.id === preparer.user.id));
  assert.ok(history.filter((a) => a.kind === 'bar_issued').every((a) => a.actor.id === issuer.user.id && a.details.preparedBy === preparer.user.name));
  console.log('OK: частичное приготовление, выдача готового, разные исполнители и защита от повторов');

  const friendsBar = await purchase(friend, { bar: [{ barItemId: drink.id, qty: 1 }] });
  await ok(`/orders/${friendsBar.id}/bar/request`, friend.token, {});
  const group = await purchase(owner, { tickets: [{ ticketTypeId: fullEvent.tickets[0].id, qty: 2 }] });
  const groupInvite = await ok(`/orders/${group.id}/invitations`, owner.token, { name: 'Отзыв', requestId: crypto.randomUUID() });
  await ok(`/invitations/${groupInvite.token}/claim`, stranger.token, {});
  await ok(`/invitations/${groupInvite.token}/revoke`, owner.token, {});
  await ok(`/invitations/${groupInvite.token}/revoke`, owner.token, {});
  assert.equal((await ok(`/staff/scan/${group.number}`, door.token)).order.entry.left, 2);
  assert.equal((await api(`/staff/invitations/${groupInvite.token}/admit`, door.token, {})).status, 409);
  const refundInvite = await ok(`/orders/${group.id}/invitations`, owner.token, { name: 'Возврат', requestId: crypto.randomUUID() });
  const pending = await purchase(owner, { bar: [{ barItemId: drink.id, qty: 2 }] });
  await ok(`/orders/${pending.id}/bar/request`, owner.token, {});
  const pendingLine = pending.lines[0];
  await ok(`/staff/bar/${pendingLine.id}/prepare`, bar1.token, {});
  await ok(`/staff/bar/${pendingLine.id}/ready`, bar1.token, { qty: 1, expectedPreparing: 2 });
  const stockBefore = (await ok('/stock', admin.token)).find((s) => s.barItemId === drink.id).qty;
  assert.equal((await api(`/admin/events/${event.id}/refund`, admin.token, { confirm: eventBody.title })).status, 409);
  await ok(`/admin/events/${event.id}`, admin.token, { ...eventBody, status: 'cancelled' }, 'PUT');
  assert.equal((await api(`/admin/events/${event.id}/refund`, bar1.token, { confirm: eventBody.title })).status, 403);
  assert.equal((await api(`/admin/events/${event.id}/refund`, admin.token, { confirm: 'wrong' })).status, 409);
  await ok(`/admin/events/${event.id}/refund`, admin.token, { confirm: eventBody.title });
  const refunded = await ok(`/orders/${pending.id}`, owner.token);
  assert.equal(refunded.status, 'refunded'); assert.equal(refunded.lines[0].preparingQty, 0); assert.equal(refunded.lines[0].readyQty, 0);
  assert.equal((await ok('/stock', admin.token)).find((s) => s.barItemId === drink.id).qty, stockBefore + 3);
  assert.equal((await ok(`/invitations/${refundInvite.token}`)).status, 'revoked');
  assert.equal((await api(`/invitations/${refundInvite.token}/claim`, stranger.token, {})).status, 409);
  console.log('OK: отзыв возвращает проход; возврат сохраняет защиты и не возвращает выданное на склад');
} finally {
  for (const user of workers) await api('/staff/shift/close', user.token, {});
}
