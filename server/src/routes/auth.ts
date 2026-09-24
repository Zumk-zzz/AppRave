import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/guard.js';
import { signToken } from '../auth/jwt.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { parseContact, type Channel } from '../lib/contact.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';
import { allocateMemberNo } from '../lib/ids.js';

const CODE_TTL_MINUTES = 5;

export async function authRoutes(app: FastifyInstance) {
  /**
   * Запрос кода на телефон или почту.
   *
   * Клиент присылает одну строку, тип определяется по содержимому:
   * выбирать канал вручную — лишний шаг на экране входа.
   */
  app.post('/auth/request-code', async (req) => {
    const { contact } = z.object({ contact: z.string() }).parse(req.body);
    const { channel, value } = parseContact(contact);

    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
    await db.loginCode.create({
      data: { channel, destination: value, code: env.DEMO_SMS_CODE, expiresAt },
    });

    return {
      channel,
      sentTo: value,
      // Только для заглушки. При подключении провайдера SMS и почты это
      // поле обязано исчезнуть — иначе код можно получить без доступа
      // к самому каналу.
      devCode: env.DEMO_SMS_CODE,
      expiresInSeconds: CODE_TTL_MINUTES * 60,
    };
  });

  /**
   * Проверка кода и выдача токена.
   *
   * Аккаунт ищется по любому из каналов: один и тот же человек,
   * вошедший по телефону и по почте, попадает в один аккаунт,
   * с теми же баллами и той же должностью.
   */
  app.post('/auth/verify', async (req) => {
    const { contact, code } = z
      .object({ contact: z.string(), code: z.string().min(4).max(6) })
      .parse(req.body);

    const { channel, value } = parseContact(contact);

    const record = await db.loginCode.findFirst({
      where: { destination: value, code, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw badRequest('Неверный или просроченный код', 'invalid_code');

    // Гасим код сразу: один код — один вход
    await db.loginCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const existing = await findByContact(channel, value);

    // Роль хранится у пользователя и выдаётся через раздел «Сотрудники».
    // Номер из переменной окружения нужен только чтобы создать первого
    // администратора, иначе выдать роли было бы некому.
    const isSeedAdmin = channel === 'phone' && value === env.ADMIN_PHONE;

    const user = existing
      ? isSeedAdmin && existing.role === 'guest'
        ? await db.user.update({ where: { id: existing.id }, data: { role: 'admin' } })
        : existing
      : await db.user.create({
          data: {
            // Явные ветки вместо вычисляемого ключа: Prisma требует,
            // чтобы в типе данных было видно, какое поле заполняется
            phone: channel === 'phone' ? value : null,
            email: channel === 'email' ? value : null,
            name: isSeedAdmin ? 'Администратор' : 'Гость',
            role: isSeedAdmin ? 'admin' : 'guest',
            memberNo: await freeMemberNo(value),
          },
        });

    return { token: signToken({ sub: user.id }), user: publicUser(user) };
  });

  app.get('/auth/me', async (req) => {
    const auth = requireUser(req);
    const user = await db.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw notFound('Пользователь не найден');

    return publicUser(user);
  });

  /**
   * Привязка второго канала к существующему аккаунту.
   *
   * Решает форс-мажор «сотрудник сменил номер»: он входит по почте
   * и привязывает новый телефон, оставаясь тем же человеком с той же
   * должностью — вместо заведения нового аккаунта и переноса ролей.
   */
  app.post('/auth/link', async (req) => {
    const auth = requireUser(req);
    const { contact, code } = z
      .object({ contact: z.string(), code: z.string().min(4).max(6) })
      .parse(req.body);

    const { channel, value } = parseContact(contact);

    const record = await db.loginCode.findFirst({
      where: { destination: value, code, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw badRequest('Неверный или просроченный код', 'invalid_code');

    const owner = await findByContact(channel, value);
    if (owner && owner.id !== auth.sub) {
      throw conflict('Этот контакт уже привязан к другому аккаунту', 'contact_taken');
    }

    await db.loginCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const user = await db.user.update({
      where: { id: auth.sub },
      data: channel === 'phone' ? { phone: value } : { email: value },
    });

    return publicUser(user);
  });

  /** Отвязка канала. Последний отвязать нельзя — войти станет нечем. */
  app.delete('/auth/link/:channel', async (req) => {
    const auth = requireUser(req);
    const { channel } = z.object({ channel: z.enum(['phone', 'email']) }).parse(req.params);

    const user = await db.user.findUniqueOrThrow({ where: { id: auth.sub } });
    const other = channel === 'phone' ? user.email : user.phone;

    if (!other) {
      throw badRequest('Нельзя отвязать единственный способ входа', 'last_contact');
    }

    const updated = await db.user.update({
      where: { id: auth.sub },
      data: channel === 'phone' ? { phone: null } : { email: null },
    });

    return publicUser(updated);
  });
}

function findByContact(channel: Channel, value: string) {
  return channel === 'phone'
    ? db.user.findUnique({ where: { phone: value } })
    : db.user.findUnique({ where: { email: value } });
}

type UserRow = Awaited<ReturnType<typeof db.user.findUniqueOrThrow>>;

function publicUser(user: UserRow) {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    tier: user.tier,
    points: user.points,
    memberNo: user.memberNo,
    joinedAt: user.createdAt.toISOString(),
  };
}

/** Свободный номер карты: проверку занятости делает база. */
async function freeMemberNo(contact: string): Promise<string> {
  return allocateMemberNo(
    async (candidate) => (await db.user.count({ where: { memberNo: candidate } })) > 0,
    contact,
  );
}
