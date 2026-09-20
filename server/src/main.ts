import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import { db } from './db.js';
import { env, isProd } from './env.js';
import { startExpirationJob } from './jobs/expire-reservations.js';
import { HttpError } from './lib/http-error.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { paymentRoutes } from './routes/payments.js';
import { staffRoutes } from './routes/staff.js';

const app = Fastify({
  logger: isProd
    ? true
    : { transport: undefined, level: 'info' },
});

// Мобильный клиент ходит с устройства, а не из браузера, но CORS нужен
// для отладки через веб-версию Expo и для будущей админ-панели в браузере.
await app.register(cors, { origin: true });

// Fastify по умолчанию отвергает пустое тело при content-type: application/json.
// Клиенты на fetch ставят этот заголовок всегда, даже когда тела нет —
// например, у POST /orders/:id/cancel. Считаем пустое тело пустым объектом.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const raw = body as string;
  if (raw === '' || raw == null) return done(null, {});

  try {
    done(null, JSON.parse(raw));
  } catch {
    done(new HttpError(400, 'Тело запроса не является корректным JSON', 'invalid_json'), undefined);
  }
});

app.setErrorHandler((error, req, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Некорректные данные запроса',
      code: 'validation_error',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // У ошибок самого Fastify уже есть корректный код — не подменяем его
  // пятисоткой, иначе клиент не отличит свою ошибку от падения сервера.
  const fastifyError = error as { statusCode?: number; message?: string; code?: string };
  const status = fastifyError.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return reply.code(status).send({
      error: fastifyError.message ?? 'Некорректный запрос',
      code: fastifyError.code ?? 'bad_request',
    });
  }

  req.log.error({ err: error }, 'необработанная ошибка');

  // Наружу — без подробностей: текст внутренней ошибки может содержать
  // фрагменты запроса к базе и имена таблиц.
  return reply.code(500).send({ error: 'Внутренняя ошибка', code: 'internal' });
});

app.get('/health', async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true, uptime: Math.round(process.uptime()) };
});

await app.register(authRoutes);
await app.register(catalogRoutes);
await app.register(orderRoutes);
await app.register(paymentRoutes);
await app.register(staffRoutes);

const stopJob = startExpirationJob(app.log);

// Без этого контейнер останавливается по SIGTERM жёстко, обрывая
// запросы в середине и оставляя соединения к базе открытыми.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`получен ${signal}, останавливаюсь`);
    stopJob();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });
