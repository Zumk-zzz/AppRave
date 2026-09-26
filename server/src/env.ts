import { z } from 'zod';

/**
 * Конфигурация читается и проверяется один раз при старте.
 *
 * Падать на старте из-за пустого JWT_SECRET намного лучше, чем поднять
 * сервис, который подпишет токены строкой undefined и обнаружится это
 * через неделю.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET слишком короткий'),
  JWT_EXPIRES_IN: z.string().default('30d'),
  PORT: z.coerce.number().int().positive().default(3000),
  RESERVATION_MINUTES: z.coerce.number().int().positive().default(15),
  ADMIN_PHONE: z.string().default('+79000000000'),
  DEMO_SMS_CODE: z.string().optional(),
  /**
   * Сервер доступен не только из своей сети.
   *
   * Включается, когда порт проброшен наружу туннелем. Меняет ровно две
   * вещи, и обе про вход: код перестаёт быть предсказуемым нулём и
   * перестаёт возвращаться в ответе. Иначе любой, кто узнал адрес,
   * входит администратором и может вернуть деньги по вечеринкам.
   */
  PUBLIC_ACCESS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
}

const data = parsed.data;

/**
 * Коды, которые подбираются с первой попытки.
 *
 * Список нужен не для строгости, а потому что именно их и ставят
 * в настройках «на время»: 0000 лежит в .env этого проекта с первого дня.
 */
const WEAK_CODES = new Set(['0000', '1111', '1234', '000000', '111111', '123456', '123123']);

function isWeak(code: string): boolean {
  return code.length < 6 || WEAK_CODES.has(code);
}

/**
 * Код подтверждения входа.
 *
 * В своей сети это привычный 0000: набирать случайные цифры при каждом
 * запуске приложения — мучение, а доступ к серверу и так есть только
 * у того, кто сидит за этим компьютером.
 *
 * Как только сервер открыт наружу, предсказуемый код становится дырой
 * в размер всей системы: по нему входят администратором и возвращают
 * деньги за вечеринки. Поэтому слабый код оттуда не принимается вовсе —
 * даже если он явно задан в .env. Молча уважить его было бы хуже всего:
 * настройка выглядит применённой, а защиты нет.
 */
function resolveCode(): { code: string; ignoredWeak: boolean } {
  const fromEnv = data.DEMO_SMS_CODE;

  if (!data.PUBLIC_ACCESS) return { code: fromEnv ?? '0000', ignoredWeak: false };

  if (fromEnv && !isWeak(fromEnv)) return { code: fromEnv, ignoredWeak: false };

  return {
    code: String(Math.floor(100_000 + Math.random() * 900_000)),
    ignoredWeak: !!fromEnv,
  };
}

const resolved = resolveCode();

export const env = { ...data, DEMO_SMS_CODE: resolved.code };

/** Заданный код оказался слишком простым для открытого сервера. */
export const weakCodeIgnored = resolved.ignoredWeak;

export const isProd = env.NODE_ENV === 'production';

/** Отдавать ли код прямо в ответе. Наружу — никогда. */
export const showCodeInResponse = !env.PUBLIC_ACCESS;
