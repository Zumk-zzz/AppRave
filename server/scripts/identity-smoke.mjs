/** Проверка входа по телефону и почте, связывания каналов и ролей на аккаунте. */
const BASE = 'http://127.0.0.1:3000';
let failures = 0;

const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function login(contact) {
  await api('/auth/request-code', { method: 'POST', body: { contact } });
  return api('/auth/verify', { method: 'POST', body: { contact, code: '0000' } });
}

const stamp = Date.now().toString().slice(-7);
const PHONE = `+7911${stamp}`;
const MAIL = `guest${stamp}@example.com`;
const MAIL2 = `other${stamp}@example.com`;

console.log('\n=== Определение канала ===');
const byPhone = await api('/auth/request-code', { method: 'POST', body: { contact: PHONE } });
check('телефон распознан', byPhone.body?.channel === 'phone', byPhone.body?.channel);

const byMail = await api('/auth/request-code', { method: 'POST', body: { contact: MAIL } });
check('почта распознана', byMail.body?.channel === 'email', byMail.body?.channel);

const bad = await api('/auth/request-code', { method: 'POST', body: { contact: 'не-контакт' } });
check('мусор отклонён', bad.status === 400, `статус ${bad.status}`);

const badMail = await api('/auth/request-code', { method: 'POST', body: { contact: 'a@b' } });
check('кривая почта отклонена', badMail.status === 400, `статус ${badMail.status}`);

console.log('\n=== Нормализация телефона ===');
const variants = [`8911${stamp}`, `7911${stamp}`, `+7 (911) ${stamp}`];
const normalized = [];
for (const v of variants) {
  const r = await api('/auth/request-code', { method: 'POST', body: { contact: v } });
  normalized.push(r.body?.sentTo);
}
check('разные записи дают один номер', new Set(normalized).size === 1, normalized.join(' / '));

console.log('\n=== Вход по почте ===');
const mailUser = await login(MAIL);
check('вход по почте выдал токен', !!mailUser.body?.token);
check('почта записана в аккаунт', mailUser.body?.user.email === MAIL, mailUser.body?.user.email);
check('телефона пока нет', mailUser.body?.user.phone === null, String(mailUser.body?.user.phone));
check('номер карты выдан', /^AR-\d{4}$/.test(mailUser.body?.user.memberNo ?? ''), mailUser.body?.user.memberNo);

console.log('\n=== Привязка второго канала ===');
await api('/auth/request-code', { method: 'POST', body: { contact: PHONE } });
const link = await api('/auth/link', {
  method: 'POST', token: mailUser.body.token, body: { contact: PHONE, code: '0000' },
});
check('телефон привязан', link.status === 200 && link.body?.phone, link.body?.phone);
check('почта осталась', link.body?.email === MAIL);

console.log('\n=== Вход вторым каналом ведёт в тот же аккаунт ===');
const viaPhone = await login(PHONE);
check(
  'тот же пользователь',
  viaPhone.body?.user.id === mailUser.body.user.id,
  `${viaPhone.body?.user.id} против ${mailUser.body.user.id}`,
);
check('баллы те же', viaPhone.body?.user.points === mailUser.body.user.points);

console.log('\n=== Чужой контакт не перехватывается ===');
const other = await login(MAIL2);
await api('/auth/request-code', { method: 'POST', body: { contact: PHONE } });
const steal = await api('/auth/link', {
  method: 'POST', token: other.body.token, body: { contact: PHONE, code: '0000' },
});
check('занятый контакт не привязать', steal.status === 409, `статус ${steal.status}`);

console.log('\n=== Отвязка ===');
const unlinkMail = await api('/auth/link/email', { method: 'DELETE', token: viaPhone.body.token });
check('почта отвязана', unlinkMail.status === 200 && unlinkMail.body?.email === null);

const unlinkLast = await api('/auth/link/phone', { method: 'DELETE', token: viaPhone.body.token });
check('последний канал не отвязать', unlinkLast.status === 400, `статус ${unlinkLast.status}`);

console.log('\n=== Должность выдаётся аккаунту, а не номеру ===');
const admin = await login('+79000000000');
check('админ вошёл', admin.body?.user.role === 'admin', admin.body?.user.role);

const staffMail = `bartender${stamp}@example.com`;
const grant = await api('/staff/members', {
  method: 'POST', token: admin.body.token,
  body: { contact: staffMail, role: 'bartender', name: 'Бармен по почте' },
});
check('роль выдана по почте', grant.status === 200 && grant.body?.role === 'bartender', `статус ${grant.status}`);

const staffLogin = await login(staffMail);
check('сотрудник получил роль при входе', staffLogin.body?.user.role === 'bartender', staffLogin.body?.user.role);

console.log('\n=== Смена контакта сохраняет должность ===');
const newPhone = `+7922${stamp}`;
await api('/auth/request-code', { method: 'POST', body: { contact: newPhone } });
await api('/auth/link', { method: 'POST', token: staffLogin.body.token, body: { contact: newPhone, code: '0000' } });
const afterMove = await login(newPhone);
check(
  'вход с нового номера — та же должность',
  afterMove.body?.user.role === 'bartender' && afterMove.body?.user.id === staffLogin.body.user.id,
  `${afterMove.body?.user.role}`,
);

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
