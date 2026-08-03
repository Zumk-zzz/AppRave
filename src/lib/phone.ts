/**
 * Российский номер телефона: маска ввода и нормализация.
 * Храним и отправляем всегда в формате +7XXXXXXXXXX, показываем — с маской.
 */

/** Оставить только значащие 10 цифр номера, отбросив код страны. */
export function extractDigits(input: string): string {
  let digits = input.replace(/\D/g, '');

  // Пользователь мог начать с 8 или 7 — это код страны, а не номер.
  if (digits.startsWith('8') || digits.startsWith('7')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

/** 9161234567 → «+7 (916) 123-45-67», по мере набора. */
export function formatPhone(digits: string): string {
  if (digits.length === 0) return '';

  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 8);
  const d = digits.slice(8, 10);

  let out = `+7 (${a}`;
  if (digits.length >= 3) out += ')';
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (d) out += `-${d}`;

  return out;
}

/** Формат для отправки на сервер: +79161234567 */
export function toE164(digits: string): string {
  return `+7${digits}`;
}

export const PHONE_LENGTH = 10;

export function isPhoneComplete(digits: string): boolean {
  return digits.length === PHONE_LENGTH;
}
