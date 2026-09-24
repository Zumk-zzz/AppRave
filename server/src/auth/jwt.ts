import jwt from 'jsonwebtoken';

import { env } from '../env.js';
import { unauthorized } from '../lib/http-error.js';

/**
 * Содержимое токена — только кто это.
 *
 * Роли внутри нет намеренно: она меняется, а токен живёт неделями.
 * С ролью внутри уволенный сотрудник продолжал бы пропускать людей
 * до истечения срока, а вставший на смену — ждать нового входа.
 * Роль определяется на каждом запросе по базе, см. auth/guard.ts.
 */
export interface TokenPayload {
  sub: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) throw new Error('bad payload');

    return { sub: String(decoded.sub) };
  } catch {
    // Причину наружу не отдаём: истёк токен или подделан — для
    // отвечающей стороны это одно и то же, а подсказки помогают атакующему.
    throw unauthorized('Недействительный токен');
  }
}
