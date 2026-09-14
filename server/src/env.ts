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
  DEMO_SMS_CODE: z.string().default('0000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
