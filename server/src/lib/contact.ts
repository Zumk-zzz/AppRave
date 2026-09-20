import { badRequest } from './http-error.js';

export type Channel = 'phone' | 'email';

export interface Contact {
  channel: Channel;
  /** Нормализованный вид: +7XXXXXXXXXX либо почта в нижнем регистре */
  value: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Разбирает строку контакта в канал и нормализованное значение.
 *
 * Пользователь вводит одно поле, а не выбирает тип заранее: лишний
 * переключатель на экране входа — это шаг, который можно не делать.
 *
 * Нормализация обязательна: без неё «+7 (900) 111-22-33», «89001112233»
 * и «79001112233» заведут три разных аккаунта одному человеку.
 */
export function parseContact(raw: string): Contact {
  const trimmed = raw.trim();
  if (!trimmed) throw badRequest('Укажите телефон или почту', 'empty_contact');

  if (trimmed.includes('@')) {
    const value = trimmed.toLowerCase();
    if (!EMAIL.test(value)) throw badRequest('Некорректная почта', 'bad_email');
    return { channel: 'email', value };
  }

  const digits = trimmed.replace(/\D/g, '');
  const tail = digits.replace(/^[78]/, '');

  if (tail.length !== 10) throw badRequest('Некорректный номер телефона', 'bad_phone');
  return { channel: 'phone', value: `+7${tail}` };
}

/** Поле пользователя, соответствующее каналу. */
export function fieldFor(channel: Channel): 'phone' | 'email' {
  return channel;
}
