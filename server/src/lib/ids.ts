const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Короткий номер заказа вида ORD-8F3A.
 * Из алфавита исключены O, I, 0 и 1 — их путают, когда номер
 * приходится называть вслух на фейс-контроле.
 */
export function orderNumber(): string {
  let tail = '';
  for (let i = 0; i < 4; i++) {
    tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `ORD-${tail}`;
}

/** Номер клубной карты, стабильный для одного и того же телефона. */
export function memberNoFor(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `AR-${digits.slice(-4).padStart(4, '0')}`;
}
