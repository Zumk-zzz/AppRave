/**
 * Проверка правки каталога и склада.
 *
 * Главное, что здесь проверяется, — что правка не теряет проданное.
 * Ошибка в этом месте не падает и не видна: тираж просто тихо
 * затирает счётчик продаж, и лишние билеты уходят в продажу.
 *
 * Запуск: node scripts/catalog-smoke.mjs
 */
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

const admin = await login('+79000000000');
const guest = await login(`+7999${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);

const eventBody = (over = {}) => ({
  title: 'SMOKE NIGHT',
  subtitle: 'проверка',
  date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  genre: 'techno',
  ageLimit: 18,
  lineup: ['DJ Test'],
  description: '',
  cover: ['#FF2E93', '#7A1350'],
  tickets: [{ name: 'Standard', description: '', priceKopecks: 100_000, quantity: 10 }],
  ...over,
});

console.log('\n=== Права ===');
const byGuest = await api('/admin/events', { method: 'POST', token: guest.token, body: eventBody() });
check('гость не правит афишу', byGuest.status === 403, `статус ${byGuest.status}`);

const noToken = await api('/admin/events', { method: 'POST', body: eventBody() });
check('без токена нельзя', noToken.status === 401, `статус ${noToken.status}`);

const stockForGuest = await api('/stock', { token: guest.token });
check('гость не видит склад', stockForGuest.status === 403, `статус ${stockForGuest.status}`);

console.log('\n=== Афиша ===');
const created = await api('/admin/events', { method: 'POST', token: admin.token, body: eventBody() });
check('событие создано', created.status === 201 && !!created.body?.id, `статус ${created.status}`);

const eventId = created.body.id;
const loaded = await api(`/events/${eventId}`, { token: admin.token });
check('событие сразу опубликовано', loaded.body?.status === 'published', loaded.body?.status);
check('тип билета создан', loaded.body?.tickets.length === 1, `${loaded.body?.tickets.length}`);
check(
  'остаток равен тиражу',
  loaded.body?.tickets[0].available === 10 && loaded.body?.tickets[0].quantity === 10,
);

console.log('\n=== Правка не теряет проданное ===');
const typeId = loaded.body.tickets[0].id;
const order = await api('/orders', {
  method: 'POST',
  token: guest.token,
  key: uid(),
  body: { eventId, tickets: [{ ticketTypeId: typeId, qty: 3 }] },
});
check('гость купил 3 билета', order.status === 201, `статус ${order.status}`);

const grown = await api(`/admin/events/${eventId}`, {
  method: 'PUT',
  token: admin.token,
  body: eventBody({
    title: 'SMOKE NIGHT 2',
    tickets: [{ id: typeId, name: 'Standard', description: '', priceKopecks: 120_000, quantity: 20 }],
  }),
});
check('тираж увеличен', grown.status === 200, `статус ${grown.status}`);

const afterGrow = await api(`/events/${eventId}`, { token: admin.token });
check('название обновилось', afterGrow.body?.title === 'SMOKE NIGHT 2', afterGrow.body?.title);
check(
  'проданное не затёрто',
  afterGrow.body?.tickets[0].available === 17 && afterGrow.body?.tickets[0].quantity === 20,
  `осталось ${afterGrow.body?.tickets[0].available} из ${afterGrow.body?.tickets[0].quantity}`,
);

const shrunk = await api(`/admin/events/${eventId}`, {
  method: 'PUT',
  token: admin.token,
  body: eventBody({
    tickets: [{ id: typeId, name: 'Standard', description: '', priceKopecks: 120_000, quantity: 2 }],
  }),
});
check('тираж меньше проданного отклонён', shrunk.status === 409, `статус ${shrunk.status}`);

const dropped = await api(`/admin/events/${eventId}`, {
  method: 'PUT',
  token: admin.token,
  body: eventBody({
    tickets: [{ name: 'Другой', description: '', priceKopecks: 100_000, quantity: 5 }],
  }),
});
check('проданный тип нельзя убрать', dropped.status === 409, `статус ${dropped.status}`);

const removal = await api(`/admin/events/${eventId}`, { method: 'DELETE', token: admin.token });
check('событие с заказами не удалить', removal.status === 409, `статус ${removal.status}`);

console.log('\n=== Меню и склад ===');
const item = await api('/admin/bar', {
  method: 'POST',
  token: admin.token,
  body: {
    name: `Проверочный ${uid()}`,
    description: '',
    priceKopecks: 50_000,
    category: 'cocktails',
    volume: '200 мл',
    popular: false,
    available: true,
    stock: { qty: 5, unit: 'шт', lowThreshold: 2 },
  },
});
check('позиция создана', item.status === 201, `статус ${item.status}`);

const barItemId = item.body.id;
const stock = await api('/stock', { token: admin.token });
const line = stock.body.find((s) => s.barItemId === barItemId);
check('строка склада заведена сразу', line?.qty === 5, JSON.stringify(line));

const receipt = await api('/stock/moves', {
  method: 'POST',
  token: admin.token,
  body: { barItemId, kind: 'receipt', delta: 10, comment: 'Поставка' },
});
check('приход записан', receipt.status === 201, `статус ${receipt.status}`);

const afterReceipt = (await api('/stock', { token: admin.token })).body.find(
  (s) => s.barItemId === barItemId,
);
check('остаток вырос', afterReceipt?.qty === 15, `${afterReceipt?.qty}`);

const tooMuch = await api('/stock/moves', {
  method: 'POST',
  token: admin.token,
  body: { barItemId, kind: 'writeoff', delta: -100 },
});
check('в минус списать нельзя', tooMuch.status === 409, `статус ${tooMuch.status}`);

const wrongSign = await api('/stock/moves', {
  method: 'POST',
  token: admin.token,
  body: { barItemId, kind: 'receipt', delta: -1 },
});
check('приход не бывает отрицательным', wrongSign.status === 400, `статус ${wrongSign.status}`);

const moves = await api(`/stock/moves?barItemId=${barItemId}`, { token: admin.token });
check('движение видно в журнале', moves.body?.[0]?.delta === 10, JSON.stringify(moves.body?.[0]));

const journal = await api('/staff/actions', { token: admin.token });
check(
  'правка склада попала в журнал действий',
  journal.body?.some((a) => a.kind === 'stock_adjusted'),
);

console.log('\n=== Столы ===');
const tables = await api('/admin/tables', { token: admin.token });
check('схема зала отдаётся', tables.status === 200 && tables.body.length > 0, `${tables.body?.length}`);

const table = tables.body[0];
const blocked = await api(`/admin/tables/${table.id}`, {
  method: 'PUT',
  token: admin.token,
  body: { ...table, blocked: true },
});
check('стол снят с продажи', blocked.status === 200, `статус ${blocked.status}`);

const inHall = (await api(`/events/${eventId}/tables`)).body.find((t) => t.id === table.id);
check('снятый стол занят на любую дату', inHall?.taken === true, JSON.stringify(inHall?.taken));

await api(`/admin/tables/${table.id}`, {
  method: 'PUT',
  token: admin.token,
  body: { ...table, blocked: false },
});

const duplicate = await api('/admin/tables', {
  method: 'POST',
  token: admin.token,
  body: { ...table, id: undefined },
});
check('метка стола уникальна', duplicate.status === 409, `статус ${duplicate.status}`);

console.log('\n=== Уборка ===');
const cleanItem = await api(`/admin/bar/${barItemId}`, { method: 'DELETE', token: admin.token });
check('непроданную позицию можно удалить', cleanItem.status === 200, `статус ${cleanItem.status}`);

// Событие с заказом удалить нельзя, поэтому прячем его в черновики:
// иначе проверочная вечеринка висела бы в афише после каждого прогона
const hidden = await api(`/admin/events/${eventId}`, {
  method: 'PUT',
  token: admin.token,
  body: eventBody({
    status: 'draft',
    tickets: [{ id: typeId, name: 'Standard', description: '', priceKopecks: 120_000, quantity: 20 }],
  }),
});
check('проверочное событие убрано из афиши', hidden.status === 200, `статус ${hidden.status}`);

const forGuest = await api('/events');
check(
  'черновик гостю не виден',
  !forGuest.body.some((e) => e.id === eventId),
);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
