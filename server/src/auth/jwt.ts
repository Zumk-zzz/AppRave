import jwt from 'jsonwebtoken';

import { env } from '../env.js';
import { unauthorized } from '../lib/http-error.js';

export interface TokenPayload {
  sub: string;
  role: 'guest' | 'admin';
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

    return { sub: String(decoded.sub), role: (decoded as TokenPayload).role };
  } catch {
    // Причину наружу не отдаём: истёк токен или подделан — для
    // отвечающей стороны это одно и то же, а подсказки помогают атакующему.
    throw unauthorized('Недействительный токен');
  }
}
