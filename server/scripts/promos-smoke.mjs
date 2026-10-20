import assert from 'node:assert/strict';
if (!process.env.DATABASE_URL?.includes(':5546/')) throw new Error('Только одноразовая тестовая БД на 5546');
process.env.PAYMENT_PROVIDER = 'stub';
const [{ default: Fastify }, { ZodError }, { db }, { resolveAuth }, { authRoutes }, { orderRoutes }, { catalogRoutes }, { adminRoutes }, { promoRoutes }, { paymentRoutes }, { HttpError }, { promoDiscount }, { pointsForPurchase }] = await Promise.all([
  import('fastify'), import('zod'), import('../src/db.ts'), import('../src/auth/guard.ts'), import('../src/routes/auth.ts'), import('../src/routes/orders.ts'), import('../src/routes/catalog.ts'), import('../src/routes/admin.ts'), import('../src/routes/promos.ts'), import('../src/routes/payments.ts'), import('../src/lib/http-error.ts'), import('../src/lib/promos.ts'), import('../src/lib/money.ts'),
]);
const app = Fastify(); app.addHook('preHandler', resolveAuth);
app.setErrorHandler((e, _req, reply) => reply.code(e instanceof HttpError ? e.statusCode : e instanceof ZodError ? 400 : 500).send({ error: e.message, code: e.code }));
for (const routes of [authRoutes, catalogRoutes, adminRoutes, orderRoutes, promoRoutes, paymentRoutes]) await app.register(routes);
async function api(path, token, body, method = body === undefined ? 'GET' : 'POST', key = crypto.randomUUID()) {
  const r = await app.inject({ method, url: path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'idempotency-key': key }, ...(body === undefined ? {} : { payload: body }) });
  return { status: r.statusCode, body: r.json() };
}
async function ok(...args) { const r = await api(...args); assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r)); return r.body; }
async function login(contact = `promo-${crypto.randomUUID()}@example.com`) { await ok('/auth/request-code', null, { contact }); return ok('/auth/verify', null, { contact, code: '0000' }); }
try {
  const admin = await login('+79000000000'), guest = await login(), other = await login(), manager = await login();
  await db.user.update({ where: { id: manager.user.id }, data: { role: 'manager' } });
  const managerSession = await login(manager.user.email);
  const ev = await ok('/admin/events', admin.token, { title: `PROMOS ${crypto.randomUUID()}`, subtitle: '', date: new Date(Date.now() + 96 * 3600000).toISOString(), genre: 'techno', ageLimit: 18, lineup: [], description: '', cover: ['#FF2E93', '#7A1350'], status: 'published', tickets: [{ name: 'Вход', description: '', priceKopecks: 100000, quantity: 100 }] });
  const full = await ok(`/events/${ev.id}`), ticket = full.tickets[0];
  const body = { eventId: ev.id, tickets: [{ ticketTypeId: ticket.id, qty: 1 }], expectedTotalKopecks: 100000 };
  const rule = { code: `TEST_${Date.now()}`, title: 'Тест скидки', kind: 'percent', value: 20, scope: 'tickets', active: true, eventId: ev.id, minSubtotalKopecks: 100000, maxUses: 10, perUserLimit: 1, startsAt: null, endsAt: null };
  const promo = await ok('/admin/promos', admin.token, rule);
  assert.equal((await api('/admin/promos', guest.token)).status, 403);
  assert.equal((await api('/admin/promos', managerSession.token)).status, 403);
  assert.equal((await api('/admin/promos', guest.token, { ...rule, code: 'FORGED' })).status, 403);
  assert.equal((await api('/admin/promos', admin.token, { ...rule, code: rule.code.toLowerCase() })).body.code, 'promo_exists');
  assert.equal((await api('/admin/promos', admin.token, { ...rule, code: 'INVALID', value: 91 })).status, 400);
  const preview = await ok('/orders/promo-preview', guest.token, { ...body, promoCode: rule.code.toLowerCase() });
  assert.equal(preview.discountKopecks, 20000); assert.equal(preview.amountKopecks, 80000); assert.equal(preview.points, 40);
  assert.equal(await db.promoUse.count({ where: { promoId: promo.id } }), 0);
  assert.equal((await api('/orders', guest.token, { ...body, promoCode: rule.code, expectedPayableKopecks: 1 })).body.code, 'promo_changed');
  assert.equal((await ok(`/events/${ev.id}`)).tickets[0].available, 100);
  const key = crypto.randomUUID();
  const order = await ok('/orders', guest.token, { ...body, promoCode: rule.code, expectedPayableKopecks: 80000 }, 'POST', key);
  assert.equal(order.totalKopecks, 80000); assert.equal(order.subtotalKopecks, 100000); assert.equal(order.pointsEarned, 40); assert.equal(order.lines[0].discountKopecks, 20000);
  assert.equal((await ok('/orders', guest.token, { ...body, promoCode: rule.code }, 'POST', key)).id, order.id);
  assert.equal((await api('/orders', guest.token, { ...body, promoCode: rule.code })).body.code, 'promo_limit');
  assert.equal((await api(`/orders/${order.id}/lines/${order.lines[0].id}/cancel`, guest.token, { qty: 1 })).body.code, 'promo_partial_cancel');
  const payment = await ok('/payments', guest.token, { orderId: order.id });
  assert.equal(payment.cart.amountKopecks, 80000); assert.equal(payment.cart.items.reduce((sum, i) => sum + i.amountKopecks, 0), 80000);
  await Promise.all([ok('/webhooks/payment', guest.token, { providerId: payment.providerId, status: 'succeeded' }), ok('/webhooks/payment', guest.token, { providerId: payment.providerId, status: 'succeeded' })]);
  assert.equal((await ok('/auth/me', guest.token)).points, 40);
  assert.equal((await db.promoUse.findUnique({ where: { orderId: order.id } })).state, 'used');
  await ok(`/orders/${order.id}/cancel`, guest.token, {});
  assert.equal((await ok('/auth/me', guest.token)).points, 0);
  assert.equal((await api('/orders', guest.token, { ...body, promoCode: rule.code })).body.code, 'promo_limit');
  console.log('OK: права администратора, точная сумма после скидки, идемпотентность, 5%, однократное начисление и отмена');

  const pending = await ok('/orders', other.token, { ...body, promoCode: rule.code });
  await ok(`/orders/${pending.id}/cancel`, other.token, {});
  const again = await ok('/orders', other.token, { ...body, promoCode: rule.code });
  await db.order.update({ where: { id: again.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const afterExpiry = await ok('/orders', other.token, { ...body, promoCode: rule.code });
  assert.ok(afterExpiry.id !== again.id);
  const lastRule = { ...rule, code: `${rule.code}_LAST`, maxUses: 1, perUserLimit: 10 };
  const last = await ok('/admin/promos', admin.token, lastRule);
  const race = await Promise.all([api('/orders', guest.token, { ...body, promoCode: last.code }), api('/orders', other.token, { ...body, promoCode: last.code })]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  assert.equal(await db.promoUse.count({ where: { promoId: last.id } }), 1);
  const changed = await ok('/admin/promos', admin.token, { ...rule, code: `${rule.code}_CHANGE`, perUserLimit: 10 });
  await ok(`/admin/promos/${changed.id}`, admin.token, { ...rule, code: changed.code, value: 10, perUserLimit: 10 }, 'PUT');
  assert.equal((await api('/orders', guest.token, { ...body, promoCode: changed.code, expectedPayableKopecks: 80000 })).body.code, 'promo_changed');
  await ok(`/admin/promos/${changed.id}`, admin.token, { ...rule, code: changed.code, active: false }, 'PUT');
  assert.equal((await api('/orders/promo-preview', guest.token, { ...body, promoCode: changed.code })).body.code, 'promo_unavailable');
  for (const [suffix, extra] of [['PAST', { endsAt: new Date(Date.now() - 1000).toISOString() }], ['FUTURE', { startsAt: new Date(Date.now() + 60000).toISOString() }], ['MIN', { minSubtotalKopecks: 100001 }]]) {
    const p = await ok('/admin/promos', admin.token, { ...rule, code: `${rule.code}_${suffix}`, ...extra });
    assert.equal((await api('/orders/promo-preview', guest.token, { ...body, promoCode: p.code })).status, 409);
  }
  console.log('OK: отмена неоплаченного освобождает лимит, резерв истекает, последний промокод нельзя применить одновременно дважды');

  const table = await db.clubTable.create({ data: { label: `PROMO ${crypto.randomUUID()}`, x: 0, y: 0, w: 1, h: 1, seats: 4, zone: 'vip', depositKopecks: 500000, includedEntries: 4 } });
  const tablePromo = await ok('/admin/promos', admin.token, { ...rule, code: `${rule.code}_TABLE`, perUserLimit: 10 });
  const tablePreview = await ok('/orders/promo-preview', guest.token, { ...body, table: { tableId: table.id }, promoCode: tablePromo.code });
  assert.equal(tablePreview.amountKopecks, 580000); assert.equal(tablePreview.points, 290);
  assert.equal((await api('/orders/promo-preview', guest.token, { eventId: ev.id, table: { tableId: table.id }, promoCode: tablePromo.code })).body.code, 'promo_minimum');
  const mixed = [{ kind: 'ticket', priceKopecks: 10001, qty: 3 }, { kind: 'bar', priceKopecks: 111, qty: 2 }, { kind: 'table', priceKopecks: 500000, qty: 1 }];
  const odd = promoDiscount({ kind: 'percent', value: 17, scope: 'tickets_bar', minSubtotalKopecks: 0 }, mixed);
  assert.equal(odd.allocations.reduce((a, b) => a + b, 0), odd.discountKopecks); assert.equal(odd.allocations[2], 0);
  assert.equal(promoDiscount({ kind: 'fixed', value: 100000, scope: 'tickets', minSubtotalKopecks: 0 }, mixed).discountKopecks, 30002);
  const barOnly = promoDiscount({ kind: 'fixed', value: 100, scope: 'bar', minSubtotalKopecks: 0 }, mixed); assert.deepEqual(barOnly.allocations, [0, 100, 0]);
  for (const tier of ['silver', 'gold', 'black']) for (const [amount, expected] of [[0, 0], [1999, 0], [2000, 1], [100000, 50], [99999, 49]]) assert.equal(pointsForPurchase(amount, tier), expected);
  assert.ok(await db.staffAction.count({ where: { kind: 'promo_created', actorId: admin.user.id } }));
  assert.ok(await db.staffAction.count({ where: { kind: 'promo_updated', actorId: admin.user.id } }));
  console.log('OK: депозит не получает скидку, копейки распределены без потерь, все уровни получают ровно 5%, действия администратора записаны');
} finally { await app.close(); await db.$disconnect(); }
