import type { FastifyRequest } from 'fastify';

import { forbidden, unauthorized } from '../lib/http-error.js';
import { can, type Permission, type UserRole } from '../lib/permissions.js';
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
 * Требует конкретное право.
 *
 * Проверяется право, а не роль: набор прав у роли меняется в одном месте,
 * и ни один маршрут при этом трогать не нужно.
 *
 * Роль читается из токена, а не из тела запроса — иначе любой клиент
 * объявил бы себя администратором, просто прислав нужное поле.
 */
export function requirePermission(req: FastifyRequest, permission: Permission): TokenPayload {
  const auth = requireUser(req);

  if (!can(auth.role, permission)) {
    throw forbidden(`Недостаточно прав: требуется ${permission}`);
  }

  return auth;
}

/**
 * Покупать может только гость.
 *
 * Персонал управляет клубом, а не покупает в нём: заказы сотрудников
 * исказили бы выручку и позволили бы выписать себе билет мимо кассы.
 */
export function requireCustomer(req: FastifyRequest): TokenPayload {
  return requirePermission(req, 'purchase');
}

export function roleOf(req: FastifyRequest): UserRole | undefined {
  return readAuth(req)?.role;
}
