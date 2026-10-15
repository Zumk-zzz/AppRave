import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { unauthorized } from './http-error.js';

/** initDataUnsafe, username и присланная клиентом роль не являются авторизацией. */
export function verifyTelegram(initData: string, botToken: string, now = Date.now()) {
  const values = new URLSearchParams(initData);
  if ([...values.keys()].some((key, index, keys) => keys.indexOf(key) !== index)) throw unauthorized('Недействительный вход Telegram');
  const hash = values.get('hash') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw unauthorized('Недействительный вход Telegram');
  values.delete('hash');
  const data = [...values.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw unauthorized('Недействительный вход Telegram');
  const authDate = Number(values.get('auth_date'));
  const age = now / 1000 - authDate;
  if (!Number.isSafeInteger(authDate) || age < -30 || age > 600) throw unauthorized('Вход Telegram устарел — откройте приложение заново');
  try {
    return z.object({ id: z.number().int().positive().safe(), first_name: z.string().max(100), last_name: z.string().max(100).optional() }).parse(JSON.parse(values.get('user') ?? 'null'));
  } catch { throw unauthorized('Недействительный пользователь Telegram'); }
}
