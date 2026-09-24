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

/**
 * Новое состояние поля после правки.
 *
 * Разбирается со стиранием разделителей. В поле лежит «+7 (916)»,
 * пользователь жмёт Backspace и стирает скобку — цифры при этом те же,
 * маска собирается заново, и на экране ничего не меняется. Выглядит
 * как зависшее поле: приходится вручную переставлять курсор левее
 * скобки и жать ещё раз.
 *
 * Отличить это можно по длине: строка стала короче, а цифр столько же —
 * значит убрали разделитель, и на самом деле человек хотел стереть
 * цифру перед ним.
 */
export function applyPhoneEdit(current: string, input: string): string {
  const next = extractDigits(input);

  if (input.length < formatPhone(current).length && next === current) {
    return current.slice(0, -1);
  }

  return next;
}

/** Формат для отправки на сервер: +79161234567 */
export function toE164(digits: string): string {
  return `+7${digits}`;
}

export const PHONE_LENGTH = 10;

export function isPhoneComplete(digits: string): boolean {
  return digits.length === PHONE_LENGTH;
}
