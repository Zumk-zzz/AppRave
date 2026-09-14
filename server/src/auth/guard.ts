import type { FastifyRequest } from 'fastify';

import { forbidden, unauthorized } from '../lib/http-error.js';
import { verifyToken, type TokenPayload } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TokenPayload;
  }
}

/** Разбирает Authorization: Bearer <token>. Не бросает, если заголовка нет. */
export function readAuth(req: FastifyRequest): TokenPayload | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;

  return verifyToken(header.slice(7));
}

/** Требует авторизованного пользователя. */
export function requireUser(req: FastifyRequest): TokenPayload {
  const auth = readAuth(req);
  if (!auth) throw unauthorized();
  return auth;
}

/**
 * Требует администратора.
 *
 * Роль читается из токена, а не из тела запроса — иначе любой клиент
 * объявил бы себя админом, просто прислав нужное поле.
 */
export function requireAdmin(req: FastifyRequest): TokenPayload {
  const auth = requireUser(req);
  if (auth.role !== 'admin') throw forbidden('Доступно только администратору');
  return auth;
}

/**
 * Гость, но не администратор.
 *
 * Покупки закрыты для сотрудников: администратор управляет клубом,
 * а не покупает в нём коктейли.
 */
export function requireCustomer(req: FastifyRequest): TokenPayload {
  const auth = requireUser(req);
  if (auth.role === 'admin') throw forbidden('Администратор не может оформлять заказы');
  return auth;
}
