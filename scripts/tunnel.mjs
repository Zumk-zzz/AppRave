/**
 * Запуск через туннель: и сборщик, и сервер доступны из любой сети.
 *
 * Зачем это отдельным скриптом. `expo start --tunnel` пробрасывает
 * только Metro — сборщик JS. Сервер остаётся на этом компьютере, и
 * телефон, подключившийся из мобильного интернета, приложение откроет,
 * но увидит пустую афишу: адрес API он выводит из адреса Metro, а по
 * адресу туннеля сервера нет.
 *
 * Поэтому здесь поднимаются два туннеля. Адрес сервера передаётся
 * приложению через APPRAVE_API_URL — ту же переменную, которой позже
 * будет задаваться боевой домен (см. app.config.ts).
 *
 * Сервер нужно запустить в режиме PUBLIC_ACCESS: код входа перестаёт
 * быть предсказуемым нулём и исчезает из ответов API. Без этого
 * открывать порт наружу нельзя — по коду 0000 в систему входят
 * администратором и возвращают деньги за вечеринки.
 *
 * Запуск: npm run tunnel
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cloudflared = path.join(root, '.tools', 'cloudflared.exe');

const API_PORT = process.env.PORT ?? 3000;
const children = [];

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('exit', stopAll);

/**
 * Ждёт в выводе процесса строку с адресом туннеля.
 *
 * Оба клиента печатают его в поток, а не отдают программно, поэтому
 * читаем построчно. Таймаут обязателен: без него скрипт при неудаче
 * висит молча, и непонятно, поднимается туннель или уже умер.
 */
function waitForUrl(proc, pattern, seconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`нет ответа за ${seconds} секунд`)), seconds * 1000);

    const onLine = (line) => {
      const match = line.match(pattern);
      if (!match) return;

      clearTimeout(timer);
      resolve(match[0]);
    };

    for (const stream of [proc.stdout, proc.stderr]) {
      if (stream) createInterface({ input: stream }).on('line', onLine);
    }

    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`процесс завершился с кодом ${code}`));
    });
  });
}

/** Cloudflare: адрес живёт до перезапуска, аккаунт не нужен. */
async function viaCloudflare() {
  if (!existsSync(cloudflared)) throw new Error('cloudflared не скачан');

  const proc = spawn(cloudflared, ['tunnel', '--url', `http://localhost:${API_PORT}`], {
    windowsHide: true,
  });
  children.push(proc);

  return waitForUrl(proc, /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i, 45);
}

/**
 * Запасной путь.
 *
 * Cloudflare ограничивает бесплатные туннели по адресу и отвечает 429,
 * если с этого IP их уже много, — что легко случается через VPN.
 * Тогда поднимаем туннель другим сервисом: браузеру он показывает
 * страницу-предупреждение, но запросам приложения не мешает.
 */
async function viaLocaltunnel() {
  const proc = spawn('npx', ['--yes', 'localtunnel', '--port', String(API_PORT)], {
    shell: true,
    windowsHide: true,
  });
  children.push(proc);

  return waitForUrl(proc, /https:\/\/[a-z0-9-]+\.loca\.lt/i, 45);
}

console.log(`\nПоднимаю туннель к серверу (порт ${API_PORT})…`);

let apiUrl;
try {
  apiUrl = await viaCloudflare();
} catch (first) {
  console.log(`  Cloudflare не вышел: ${first.message}. Пробую запасной сервис…`);

  try {
    apiUrl = await viaLocaltunnel();
  } catch (second) {
    console.error(
      `\nНи один туннель не поднялся.\n  Cloudflare: ${first.message}\n  Запасной: ${second.message}\n\n` +
        'Что можно сделать:\n' +
        '  - выключить VPN: общий адрес часто упирается в ограничения;\n' +
        '  - повторить через несколько минут;\n' +
        '  - работать по своей сети: npm start\n',
    );
    process.exit(1);
  }
}

console.log(`\n  Сервер снаружи: ${apiUrl}`);
console.log('  Сервер должен быть запущен с PUBLIC_ACCESS=true, иначе код входа');
console.log('  останется прежним и будет виден всем, кто узнает адрес.');
console.log('  Сам код — в окне сервера: в ответах API его больше нет.\n');
console.log('Запускаю Metro через туннель. Первый запуск дольше обычного.\n');

const expo = spawn('npx', ['expo', 'start', '--tunnel'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, APPRAVE_API_URL: apiUrl },
});

children.push(expo);
expo.on('exit', (code) => {
  stopAll();
  process.exit(code ?? 0);
});
