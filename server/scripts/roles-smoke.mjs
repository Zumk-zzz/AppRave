/** Проверка ролей, прав и рабочих сценариев персонала. */
import { topUpStock, topUpTickets } from './top-up.mjs';

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
  await api('/auth/request-code', { method: 'POST', body: { contact: phone } });
  const r = await api('/auth/verify', { method: 'POST', body: { contact: phone, code: '0000' } });
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
    body: { contact: phone, role, name: role === 'bartender' ? 'Бармен Иван' : role === 'doorman' ? 'Фейсер Пётр' : 'Менеджер Анна' },
  });
  check(`роль ${role} выдана`, r.status === 200 && r.body?.role === role, `статус ${r.status}`);
}

const bartender = await login(PHONES.bartender);
const doorman = await login(PHONES.doorman);
const manager = await login(PHONES.manager);
const guest = await login(PHONES.guest);

// Прошлый прогон мог оставить смены открытыми, а от смены зависят права:
// без уборки набор проверял бы не то, что написано в его же названиях
for (const token of [bartender.token, doorman.token, manager.token, admin.token]) {
  await api('/staff/shift/close', { method: 'POST', token, body: {} });
}

check('бармен получил свою роль при входе', bartender.user.role === 'bartender', bartender.user.role);
check('фейсер получил свою роль', doorman.user.role === 'doorman', doorman.user.role);
check('менеджер получил свою роль', manager.user.role === 'manager', manager.user.role);
check('обычный номер остаётся гостем', guest.user.role === 'guest', guest.user.role);

console.log('\n=== Границы прав ===');
const events = (await api('/events')).body;
const ev = events.find((e) => e.tickets.some((t) => t.available > 0));
const tt = ev.tickets.find((t) => t.available > 0);

// Права даёт не должность, а открытая смена: пока сотрудник не встал
// на смену, он для системы обычный гость и покупает наравне со всеми
const staff = [['бармен', bartender.token], ['фейсер', doorman.token], ['менеджер', manager.token], ['админ', admin.token]];

const beforeShift = await api(`/staff/scan/${'ORD-NONE'}`, { token: doorman.token });
check('вне смены сканер недоступен', beforeShift.status === 403, `статус ${beforeShift.status}`);

for (const [who, token] of staff) {
  await api('/staff/shift/open', { method: 'POST', token });
  const r = await api('/orders', { method: 'POST', token, key: uid(), body: { eventId: ev.id, tickets: [{ ticketTypeId: tt.id, qty: 1 }] } });
  check(`${who} на смене не может покупать`, r.status === 403, `статус ${r.status}`);
}

const b1 = await api('/staff/members', { method: 'POST', token: bartender.token, body: { contact: '+79009998877', role: 'doorman' } });
check('бармен не может выдавать роли', b1.status === 403, `статус ${b1.status}`);

const m1 = await api('/staff/members', { method: 'POST', token: manager.token, body: { contact: '+79009998877', role: 'doorman' } });
check('менеджер тоже не может выдавать роли', m1.status === 403, `статус ${m1.status}`);

const g1 = await api('/staff/actions', { token: guest.token });
check('гость видит пустой журнал своих действий', g1.status === 200 && Array.isArray(g1.body), `статус ${g1.status}`);

console.log('\n=== Покупка гостя ===');
const menu = (await api('/bar/menu')).body;
const drink = menu.find((m) => m.available && m.category === 'cocktails');
await topUpStock(api, admin.token, drink.id);
await topUpTickets(api, admin.token, ev.id, tt.id);
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
const open = await api('/staff/shift', { token: bartender.token });
check('смена открыта', open.status === 200 && !!open.body?.openedAt);
const dup = await api('/staff/shift/open', { method: 'POST', token: bartender.token });
check('вторая смена не открывается', dup.status === 409, `статус ${dup.status}`);

const overview = await api('/staff/shifts', { token: manager.token });
check('управляющий видит смены команды', overview.status === 200 && overview.body.length > 0, `${overview.body?.length}`);
check('в смене видно, кто её открыл', !!overview.body[0]?.staff?.name, JSON.stringify(overview.body[0]?.staff));
check('открытые смены идут первыми', overview.body[0]?.closedAt === null);

const forBartender = await api('/staff/shifts', { token: bartender.token });
check('бармену чужие смены закрыты', forBartender.status === 403, `статус ${forBartender.status}`);

const guestShift = await api('/staff/shift/open', { method: 'POST', token: guest.token });
check('гость смену не открывает', guestShift.status === 403, `статус ${guestShift.status}`);
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
const ban = await api('/staff/bans', { method: 'POST', token: doorman.token, body: { phone: PHONES.guest, reason: 'Драка 12.09', name: 'Буйный гость' } });
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

const active = await api('/staff/bans', { token: doorman.token });
check(
  'снятый отказ пропал из действующих',
  !active.body.some((b) => b.id === ban.body.id),
  `${active.body?.length} записей`,
);

const history = await api('/staff/bans?all=true', { token: doorman.token });
const lifted = history.body.find((b) => b.id === ban.body.id);
check('снятый отказ остался в истории', !!lifted?.liftedAt, JSON.stringify(lifted?.liftedAt));
check('в отказе сохранено имя', lifted?.name === 'Буйный гость', JSON.stringify(lifted?.name));

// Отказ выносится человеку, а не каналу входа: гость, зашедший по почте,
// должен быть узнан так же, как зашедший по телефону
const byMail = await login('mail.ban@example.com');
const mailOrder = await api('/orders', {
  method: 'POST', token: byMail.token, key: uid(),
  body: { eventId: ev.id, tickets: [{ ticketTypeId: tt.id, qty: 1 }] },
});
const mailPay = await api('/payments', { method: 'POST', token: byMail.token, body: { orderId: mailOrder.body.id } });
await api('/webhooks/payment', { method: 'POST', body: { providerId: mailPay.body.providerId, status: 'succeeded' } });

const mailBan = await api('/staff/bans', {
  method: 'POST', token: doorman.token,
  body: { phone: 'mail.ban@example.com', reason: 'Проверка почты' },
});
const mailScan = await api(`/staff/scan/${mailOrder.body.number}`, { token: doorman.token });
check('отказ по почте виден сканеру', mailScan.body?.ban?.reason === 'Проверка почты', JSON.stringify(mailScan.body?.ban));

const mailAdmit = await api(`/staff/scan/${mailOrder.body.number}/admit`, { method: 'POST', token: doorman.token });
check('вход по отказу с почтой запрещён', mailAdmit.status === 409, `статус ${mailAdmit.status}`);

await api(`/staff/bans/${mailBan.body.id}`, { method: 'DELETE', token: doorman.token });

console.log('\n=== Списки ===');
const gl = await api(`/staff/orders?eventId=${ev.id}`, { token: doorman.token });
check('список заказов отдаётся фейсеру', gl.status === 200 && gl.body.length > 0, `${gl.body?.length} записей`);
check('в списке есть имя и контакт', !!gl.body[0]?.guest?.name && !!gl.body[0]?.guest?.contact);
check('в списке есть состав заказа', Array.isArray(gl.body[0]?.lines) && !!gl.body[0].lines[0]?.id);

await api('/staff/shift/open', { method: 'POST', token: bartender.token });
const bq = await api(`/staff/orders?eventId=${ev.id}`, { token: bartender.token });
check('список заказов отдаётся бармену', bq.status === 200, `${bq.body?.length} заказов`);
check('бармен не видит контакт гостя', bq.body[0]?.guest?.contact === null, JSON.stringify(bq.body[0]?.guest));

const forGuest = await api('/staff/orders', { token: guest.token });
check('гостю чужие заказы закрыты', forGuest.status === 403, `статус ${forGuest.status}`);

console.log('\n=== Защита от самоотзыва ===');
const selfRevoke = await api(`/staff/members/${admin.user.id}`, { method: 'DELETE', token: admin.token });
check('админ не может разжаловать себя', selfRevoke.status === 400, `статус ${selfRevoke.status}`);

const members = await api('/staff/members', { token: admin.token });
check('список сотрудников виден админу', members.status === 200 && members.body.length >= 3, `${members.body?.length}`);

for (const token of [bartender.token, doorman.token, manager.token, admin.token]) {
  await api('/staff/shift/close', { method: 'POST', token, body: {} });
}

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
