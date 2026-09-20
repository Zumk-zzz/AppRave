/** Проверка ролей, прав и рабочих сценариев персонала. */
const BASE = 'http://127.0.0.1:3000';
let failures = 0;

const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

async function api(path, { method = 'GET', token, body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function login(phone) {
  await api('/auth/request-code', { method: 'POST', body: { phone } });
  const r = await api('/auth/verify', { method: 'POST', body: { phone, code: '0000' } });
  if (!r.body?.token) throw new Error(`вход не удался: ${JSON.stringify(r.body)}`);
  return r.body;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const PHONES = {
  admin: '+79000000000',
  bartender: '+79001110011',
  doorman: '+79001110022',
  manager: '+79001110033',
  guest: '+79005550077',
};

console.log('\n=== Выдача ролей ===');
const admin = await login(PHONES.admin);
check('админ вошёл', admin.user.role === 'admin', admin.user.role);

for (const [role, phone] of [['bartender', PHONES.bartender], ['doorman', PHONES.doorman], ['manager', PHONES.manager]]) {
  const r = await api('/staff/members', {
    method: 'POST', token: admin.token,
    body: { phone, role, name: role === 'bartender' ? 'Бармен Иван' : role === 'doorman' ? 'Фейсер Пётр' : 'Менеджер Анна' },
  });
  check(`роль ${role} выдана`, r.status === 200 && r.body?.role === role, `статус ${r.status}`);
}

const bartender = await login(PHONES.bartender);
const doorman = await login(PHONES.doorman);
const manager = await login(PHONES.manager);
const guest = await login(PHONES.guest);

check('бармен получил свою роль при входе', bartender.user.role === 'bartender', bartender.user.role);
check('фейсер получил свою роль', doorman.user.role === 'doorman', doorman.user.role);
check('менеджер получил свою роль', manager.user.role === 'manager', manager.user.role);
check('обычный номер остаётся гостем', guest.user.role === 'guest', guest.user.role);

console.log('\n=== Границы прав ===');
const events = (await api('/events')).body;
const ev = events.find((e) => e.tickets.some((t) => t.available > 0));
const tt = ev.tickets.find((t) => t.available > 0);

for (const [who, token] of [['бармен', bartender.token], ['фейсер', doorman.token], ['менеджер', manager.token], ['админ', admin.token]]) {
  const r = await api('/orders', { method: 'POST', token, key: uid(), body: { eventId: ev.id, tickets: [{ ticketTypeId: tt.id, qty: 1 }] } });
  check(`${who} не может покупать`, r.status === 403, `статус ${r.status}`);
}

const b1 = await api('/staff/members', { method: 'POST', token: bartender.token, body: { phone: '+79009998877', role: 'doorman' } });
check('бармен не может выдавать роли', b1.status === 403, `статус ${b1.status}`);

const m1 = await api('/staff/members', { method: 'POST', token: manager.token, body: { phone: '+79009998877', role: 'doorman' } });
check('менеджер тоже не может выдавать роли', m1.status === 403, `статус ${m1.status}`);

const g1 = await api('/staff/actions', { token: guest.token });
check('гость видит пустой журнал своих действий', g1.status === 200 && Array.isArray(g1.body), `статус ${g1.status}`);

console.log('\n=== Покупка гостя ===');
const menu = (await api('/bar/menu')).body;
const drink = menu.find((m) => m.available && m.category === 'cocktails');
const order = await api('/orders', {
  method: 'POST', token: guest.token, key: uid(),
  body: { eventId: ev.id, tickets: [{ ticketTypeId: tt.id, qty: 2 }], bar: [{ barItemId: drink.id, qty: 3 }] },
});
check('гость купил 2 билета и 3 коктейля', order.status === 201, `статус ${order.status}`);

const pay = await api('/payments', { method: 'POST', token: guest.token, body: { orderId: order.body.id } });
await api('/webhooks/payment', { method: 'POST', body: { providerId: pay.body.providerId, status: 'succeeded' } });
const num = order.body.number;

console.log('\n=== Сканер: что видит каждый ===');
const asBartender = await api(`/staff/scan/${num}`, { token: bartender.token });
check('бармен видит заказ', asBartender.status === 200);
check('бармену разрешён бар, но не вход',
  asBartender.body?.allowed.bar === true && asBartender.body?.allowed.entry === false,
  JSON.stringify(asBartender.body?.allowed));

const asDoorman = await api(`/staff/scan/${num}`, { token: doorman.token });
check('фейсеру разрешён вход, но не бар',
  asDoorman.body?.allowed.entry === true && asDoorman.body?.allowed.bar === false,
  JSON.stringify(asDoorman.body?.allowed));

const asGuest = await api(`/staff/scan/${num}`, { token: guest.token });
check('гость не может сканировать', asGuest.status === 403, `статус ${asGuest.status}`);

console.log('\n=== Действия по правам ===');
const barAdmit = await api(`/staff/scan/${num}/admit`, { method: 'POST', token: bartender.token });
check('бармен не может пропустить на вход', barAdmit.status === 403, `статус ${barAdmit.status}`);

const barLine = asBartender.body.order.bar[0];
const doorIssue = await api(`/staff/scan/${num}/issue`, { method: 'POST', token: doorman.token, body: { lineId: barLine.lineId, qty: 1 } });
check('фейсер не может выдать напиток', doorIssue.status === 403, `статус ${doorIssue.status}`);

const admit = await api(`/staff/scan/${num}/admit`, { method: 'POST', token: doorman.token });
check('фейсер пропустил 2 гостей', admit.status === 200 && admit.body?.admitted === 2, `${admit.body?.admitted}`);

const again = await api(`/staff/scan/${num}/admit`, { method: 'POST', token: doorman.token });
check('повторный проход отклонён', again.status === 409, `статус ${again.status}`);

console.log('\n=== Частичная выдача напитков ===');
const issue1 = await api(`/staff/scan/${num}/issue`, { method: 'POST', token: bartender.token, body: { lineId: barLine.lineId, qty: 1 } });
check('выдан 1 из 3', issue1.status === 200 && issue1.body?.order.bar[0].left === 2, `осталось ${issue1.body?.order.bar[0].left}`);

const tooMany = await api(`/staff/scan/${num}/issue`, { method: 'POST', token: bartender.token, body: { lineId: barLine.lineId, qty: 5 } });
check('выдать больше остатка нельзя', tooMany.status === 400, `статус ${tooMany.status}`);

const issue2 = await api(`/staff/scan/${num}/issue`, { method: 'POST', token: bartender.token, body: { lineId: barLine.lineId, qty: 2 } });
check('выданы оставшиеся 2', issue2.status === 200 && issue2.body?.order.bar[0].left === 0);

const issue3 = await api(`/staff/scan/${num}/issue`, { method: 'POST', token: bartender.token, body: { lineId: barLine.lineId, qty: 1 } });
check('когда всё выдано — 409', issue3.status === 409, `статус ${issue3.status}`);

console.log('\n=== Смены ===');
const open = await api('/staff/shift/open', { method: 'POST', token: bartender.token });
check('смена открыта', open.status === 200 && !!open.body?.openedAt);
const dup = await api('/staff/shift/open', { method: 'POST', token: bartender.token });
check('вторая смена не открывается', dup.status === 409, `статус ${dup.status}`);
const close = await api('/staff/shift/close', { method: 'POST', token: bartender.token, body: { note: 'всё сошлось' } });
check('смена закрыта', close.status === 200 && !!close.body?.closedAt);

console.log('\n=== Журнал ===');
const mine = await api('/staff/actions', { token: bartender.token });
check('бармен видит свои действия', mine.status === 200 && mine.body.length > 0, `${mine.body?.length} записей`);
check('в журнале есть выдача напитка', mine.body.some((a) => a.kind === 'bar_issued'));
check('бармен НЕ видит чужие действия', mine.body.every((a) => a.actor.role === 'bartender'));

const all = await api('/staff/actions', { token: manager.token });
const roles = [...new Set(all.body.map((a) => a.actor.role))];
check('менеджер видит действия всех', roles.length > 1, roles.join(', '));

console.log('\n=== Стоп-лист ===');
const ban = await api('/staff/bans', { method: 'POST', token: doorman.token, body: { phone: PHONES.guest, reason: 'Драка 12.09' } });
check('отказ добавлен', ban.status === 200);

const scanBanned = await api(`/staff/scan/${num}`, { token: doorman.token });
check('сканер показывает отказ', scanBanned.body?.ban?.reason === 'Драка 12.09', JSON.stringify(scanBanned.body?.ban));

const order2 = await api('/orders', { method: 'POST', token: guest.token, key: uid(), body: { eventId: ev.id, tickets: [{ ticketTypeId: tt.id, qty: 1 }] } });
const pay2 = await api('/payments', { method: 'POST', token: guest.token, body: { orderId: order2.body.id } });
await api('/webhooks/payment', { method: 'POST', body: { providerId: pay2.body.providerId, status: 'succeeded' } });
const blocked = await api(`/staff/scan/${order2.body.number}/admit`, { method: 'POST', token: doorman.token });
check('вход по отказу запрещён', blocked.status === 409, `статус ${blocked.status}`);

await api(`/staff/bans/${ban.body.id}`, { method: 'DELETE', token: doorman.token });
const afterLift = await api(`/staff/scan/${order2.body.number}/admit`, { method: 'POST', token: doorman.token });
check('после снятия отказа проход открыт', afterLift.status === 200, `статус ${afterLift.status}`);

console.log('\n=== Списки ===');
const gl = await api(`/staff/guest-list/${ev.id}`, { token: doorman.token });
check('список гостей отдаётся', gl.status === 200 && gl.body.length > 0, `${gl.body?.length} записей`);
check('в списке есть имя и телефон', !!gl.body[0]?.name && !!gl.body[0]?.phone);

const bq = await api(`/staff/bar-queue/${ev.id}`, { token: bartender.token });
check('очередь бара отдаётся', bq.status === 200, `${bq.body?.length} заказов`);

const glForBartender = await api(`/staff/guest-list/${ev.id}`, { token: bartender.token });
check('бармену список гостей закрыт', glForBartender.status === 403, `статус ${glForBartender.status}`);

console.log('\n=== Защита от самоотзыва ===');
const selfRevoke = await api(`/staff/members/${admin.user.id}`, { method: 'DELETE', token: admin.token });
check('админ не может разжаловать себя', selfRevoke.status === 400, `статус ${selfRevoke.status}`);

const members = await api('/staff/members', { token: admin.token });
check('список сотрудников виден админу', members.status === 200 && members.body.length >= 3, `${members.body?.length}`);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
