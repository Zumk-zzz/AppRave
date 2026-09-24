/**
 * Проверка ввода телефона.
 *
 * Запуск: node scripts/phone.test.mjs
 *
 * Маска с разделителями — место, где ошибка не падает, а просто мешает
 * жить: поле выглядит зависшим, и человек не может исправить опечатку
 * в номере. Поймать это можно только на стирании, поэтому проверяем
 * именно его.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// Модуль без зависимостей от React Native: срезаем типы и грузим как есть
const source = readFileSync(new URL('../src/lib/phone.ts', import.meta.url), 'utf8')
  .replace(/: string\b/g, '')
  .replace(/: number\b/g, '')
  .replace(/: boolean\b/g, '')
  .replace(/\)\s*{/g, ') {');

const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { applyPhoneEdit, extractDigits, formatPhone, isPhoneComplete, toE164 } = module;

console.log('\n=== Маска ===');
check('пустое поле пустое', formatPhone('') === '', formatPhone(''));
check('три цифры закрывают скобку', formatPhone('916') === '+7 (916)', formatPhone('916'));
check(
  'полный номер разбит на группы',
  formatPhone('9161234567') === '+7 (916) 123-45-67',
  formatPhone('9161234567'),
);

console.log('\n=== Код страны не путается с номером ===');
check('восьмёрка в начале отброшена', extractDigits('89161234567') === '9161234567');
check('семёрка в начале отброшена', extractDigits('+7 916 123 45 67') === '9161234567');
check('лишние цифры обрезаны', extractDigits('9161234567890') === '9161234567');

console.log('\n=== Стирание ===');
// Главный случай: курсор стоит за скобкой, человек жмёт Backspace.
// Стирается разделитель, цифры прежние — и без поправки поле не меняется
check(
  'стирание скобки убирает цифру',
  applyPhoneEdit('916', '+7 (916') === '91',
  applyPhoneEdit('916', '+7 (916'),
);
// Дефис в конце маски не задерживается — он появляется вместе со
// следующей цифрой. Наткнуться на него можно, только стирая из середины
check(
  'стирание дефиса из середины убирает цифру',
  applyPhoneEdit('9161234', '+7 (916) 1234') === '916123',
  applyPhoneEdit('9161234', '+7 (916) 1234'),
);
check(
  'стирание пробела убирает цифру',
  applyPhoneEdit('916123', '+7 (916)123') === '91612',
  applyPhoneEdit('916123', '+7 (916)123'),
);
check(
  'обычное стирание цифры работает как раньше',
  applyPhoneEdit('9161', '+7 (916) ') === '916',
  applyPhoneEdit('9161', '+7 (916) '),
);
check(
  'номер стирается до конца',
  applyPhoneEdit('9', '+7 (') === '',
  applyPhoneEdit('9', '+7 ('),
);

console.log('\n=== Ввод ===');
check('цифра добавляется', applyPhoneEdit('916', '+7 (916)5') === '9165');
check('первая цифра', applyPhoneEdit('', '9') === '9');
check(
  'вставка номера целиком',
  applyPhoneEdit('', '+7 916 123-45-67') === '9161234567',
  applyPhoneEdit('', '+7 916 123-45-67'),
);

console.log('\n=== Готовность ===');
check('неполный номер не готов', !isPhoneComplete('91612345'));
check('полный номер готов', isPhoneComplete('9161234567'));
check('на сервер уходит E.164', toE164('9161234567') === '+79161234567');

console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}\n`);
process.exit(failures === 0 ? 0 : 1);
