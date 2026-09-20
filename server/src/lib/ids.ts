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

/**
 * Желаемый номер клубной карты: последние цифры контакта.
 *
 * Именно последние цифры телефона — их удобно назвать вслух на входе.
 * Но уникальным такой номер не будет: у двух гостей телефоны вполне
 * могут оканчиваться одинаково, а у писем цифр может не быть вовсе.
 * Поэтому это лишь предпочтение, а уникальность обеспечивает
 * allocateMemberNo.
 */
export function preferredMemberNo(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 4) return `AR-${digits.slice(-4)}`;

  let hash = 0;
  for (let i = 0; i < contact.length; i++) {
    hash = (hash * 31 + contact.charCodeAt(i)) % 10000;
  }
  return `AR-${String(hash).padStart(4, '0')}`;
}

function randomMemberNo(): string {
  return `AR-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

/**
 * Выдаёт свободный номер карты.
 *
 * Сначала пробует красивый номер из контакта, при занятости подбирает
 * случайный. Без этого регистрация второго гостя с похожим телефоном
 * падала бы с ошибкой уникальности — и человек просто не смог бы войти.
 */
export async function allocateMemberNo(
  isTaken: (candidate: string) => Promise<boolean>,
  contact: string,
): Promise<string> {
  const preferred = preferredMemberNo(contact);
  if (!(await isTaken(preferred))) return preferred;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomMemberNo();
    if (!(await isTaken(candidate))) return candidate;
  }

  // Четырёхзначных номеров всего десять тысяч. Когда они кончатся,
  // тихо выдавать дубль нельзя — лучше явная ошибка и переход на пять знаков.
  throw new Error('Свободные номера клубных карт закончились');
}
