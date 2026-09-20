export type Channel = 'phone' | 'email';

export interface Contact {
  channel: Channel;
  /** Нормализованный вид: +7XXXXXXXXXX либо почта в нижнем регистре */
  value: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Разбирает введённую строку в канал и нормализованное значение.
 *
 * Одно поле вместо выбора «телефон или почта»: лишний переключатель
 * на экране входа — это шаг, который можно не делать.
 *
 * Зеркалит серверный src/lib/contact.ts: нормализация должна совпадать,
 * иначе клиент покажет один контакт, а сервер заведёт аккаунт на другой.
 */
export function parseContact(raw: string): Contact | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const value = trimmed.toLowerCase();
    return EMAIL.test(value) ? { channel: 'email', value } : null;
  }

  const tail = trimmed.replace(/\D/g, '').replace(/^[78]/, '');
  return tail.length === 10 ? { channel: 'phone', value: `+7${tail}` } : null;
}

/** Как показать контакт пользователю. */
export function formatContact(value: string): string {
  if (value.includes('@')) return value;

  const d = value.replace(/^\+7/, '');
  if (d.length !== 10) return value;
  return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  phone: 'Телефон',
  email: 'Почта',
};
