import { format, isToday, isTomorrow } from 'date-fns';
import { ru } from 'date-fns/locale';

/** Узкий неразрывный пробел — разделитель разрядов по типографским правилам. */
const THIN_NBSP = ' ';

/**
 * Цена в рублях: 2500 → «2 500 ₽».
 * Считаем вручную, а не через Intl: результат одинаков на всех движках
 * и не зависит от того, собран ли Hermes с ICU.
 */
export function formatPrice(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();

  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      grouped += THIN_NBSP;
    }
    grouped += digits[i];
  }

  return `${sign}${grouped}${THIN_NBSP}₽`;
}

/** Дата события: «Сегодня · 23:00», «Завтра · 23:00», «пт, 15 авг · 23:00». */
export function formatEventDate(date: Date): string {
  const time = format(date, 'HH:mm');

  if (isToday(date)) return `Сегодня${THIN_NBSP}·${THIN_NBSP}${time}`;
  if (isTomorrow(date)) return `Завтра${THIN_NBSP}·${THIN_NBSP}${time}`;

  return `${format(date, 'EEEEEE, d MMM', { locale: ru })}${THIN_NBSP}·${THIN_NBSP}${time}`;
}

/** Короткая дата для компактных мест: «15 авг». */
export function formatShortDate(date: Date): string {
  return format(date, 'd MMM', { locale: ru });
}

/** Только время: «23:00». */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm');
}

/**
 * Правильная форма слова после числа.
 * plural(1, 'гость', 'гостя', 'гостей') → 'гость'
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** «3 гостя» — число вместе с правильной формой слова. */
export function pluralWithCount(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}
