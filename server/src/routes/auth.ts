import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { signToken } from '../auth/jwt.js';
import { requireUser } from '../auth/guard.js';
import { db } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { memberNoFor } from '../lib/ids.js';

/** Телефон в едином виде +7XXXXXXXXXX — иначе один человек заведёт два аккаунта. */
const phoneSchema = z
  .string()
  .transform((raw) => {
    const digits = raw.replace(/\D/g, '');
    const tail = digits.replace(/^[78]/, '').slice(0, 10);
    return `+7${tail}`;
  })
  .refine((v) => /^\+7\d{10}$/.test(v), 'Некорректный номер телефона');

const CODE_TTL_MINUTES = 5;

export async function authRoutes(app: FastifyInstance) {
  /** Запрос кода. В заглушке код всегда один и возвращается в ответе. */
  app.post('/auth/request-code', async (req) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);

    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);
    await db.smsCode.create({ data: { phone, code: env.DEMO_SMS_CODE, expiresAt } });

    return {
      sentTo: phone,
      // Только для заглушки. При подключении SMS-провайдера это поле
      // обязано исчезнуть — иначе код смогут получить без телефона.
      devCode: env.DEMO_SMS_CODE,
      expiresInSeconds: CODE_TTL_MINUTES * 60,
    };
  });

  /** Проверка кода и выдача токена. Пользователь заводится при первом входе. */
  app.post('/auth/verify', async (req) => {
    const { phone, code } = z
      .object({ phone: phoneSchema, code: z.string().min(4).max(6) })
      .parse(req.body);

    const record = await db.smsCode.findFirst({
      where: { phone, code, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw badRequest('Неверный или просроченный код', 'invalid_code');

    // Гасим код сразу: один код — один вход
    await db.smsCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const isAdmin = phone === env.ADMIN_PHONE;

    const user = await db.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        name: isAdmin ? 'Администратор' : 'Гость',
        role: isAdmin ? 'admin' : 'guest',
        memberNo: memberNoFor(phone),
      },
    });

    return { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) };
  });

  /** Текущий пользователь — клиент зовёт при старте, чтобы освежить баллы и уровень. */
  app.get('/auth/me', async (req) => {
    const auth = requireUser(req);
    const user = await db.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw notFound('Пользователь не найден');

    return publicUser(user);
  });
}

type UserRow = Awaited<ReturnType<typeof db.user.findUniqueOrThrow>>;

/** Наружу отдаём только то, что нужно клиенту. */
function publicUser(user: UserRow) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    tier: user.tier,
    points: user.points,
    memberNo: user.memberNo,
    joinedAt: user.createdAt.toISOString(),
  };
}
