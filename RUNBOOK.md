# Как поднять и погасить проект

Пошаговая инструкция от полностью выключенного компьютера.

Проект состоит из трёх частей, и они зависят друг от друга именно в этом порядке:

```
Postgres (в Docker, порт 5433)
   ↓ без неё API падает на первом запросе
API-сервер (порт 3000)
   ↓ без него приложение работает, но без реальных данных
Metro — сборщик приложения (порт 8081)
```

---

## Запуск

### Шаг 1. Docker Desktop

Запустите его из меню Пуск. Дождитесь, пока значок кита в трее перестанет
анимироваться — обычно 30–60 секунд. Пока он шевелится, следующие команды
будут падать с ошибкой «cannot connect to the Docker daemon».

Проверить, что готов:

```powershell
docker info --format "{{.ServerVersion}}"
```

Вернулся номер версии — можно дальше.

### Шаг 2. База

Откройте PowerShell. Самый быстрый способ: в проводнике зайдите в папку
`L:\project`, нажмите правой кнопкой на пустом месте → «Открыть в терминале».

```powershell
cd L:\project\server
docker compose up -d
```

Проверить, что база поднялась и здорова:

```powershell
docker ps
```

В колонке STATUS должно быть `Up ... (healthy)`. Если `starting` — подождите
несколько секунд, Postgres ещё запускается.

### Шаг 3. API

В том же окне:

```powershell
npm run dev
```

Окно теперь занято сервером — это нормально. Дождитесь строки
`Server listening at http://...:3000`. Логи будут идти сюда же, и это удобно:
сразу видно ошибки.

Проверить из другого окна:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/health -UseBasicParsing | Select-Object -Expand Content
```

Ответ `{"ok":true,...}` означает, что API работает и видит базу.

### Шаг 4. Приложение

**Откройте второе окно PowerShell** — первое занято сервером.

```powershell
cd L:\project
npx expo start
```

Появится QR-код. Наведите на него камеру iPhone, откроется Expo Go.

---

## Остановка

### Если окна терминалов открыты

**Ctrl+C** в каждом окне — сначала в том, где Metro, потом где API.
Windows иногда спрашивает «Завершить пакетный файл?» — отвечайте `y`.

Затем база:

```powershell
cd L:\project\server
docker compose stop
```

Данные при этом сохраняются. У контейнера стоит `restart: unless-stopped`,
и команда `stop` помечает его остановленным намеренно — сам он больше
не поднимется, пока вы не скажете.

### Если окон нет

Так бывает, когда процессы запущены в фоне или окна случайно закрыли.

Важная тонкость: `npm run dev` — это цепочка из трёх процессов
(`cmd.exe` → `npm` → `node`). Если убить только `node` по порту, обёртки
`cmd.exe` останутся жить: они держат открытым `api.log`, и следующий
запуск молча провалится, потому что не сможет записать в занятый файл.
За несколько циклов таких сирот накапливается пяток.

Поэтому убивайте дерево целиком, а не процесс на порту:

```powershell
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'npm run dev|tsx watch src/main\.ts' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F }
```

Metro останавливается так же, но по своей команде:

```powershell
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'expo start' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F }
```

Проверить, что сирот не осталось:

```powershell
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Select-Object ProcessId, CommandLine
```

Убивать `node` по имени нельзя: под ним работают и API, и Metro.

### Освободить память полностью

Остановки контейнера мало: виртуальная машина WSL, в которой живёт Docker,
продолжает держать около гигабайта. Выйдите из Docker Desktop через иконку
в трее (Quit Docker Desktop), затем:

```powershell
wsl --shutdown
```

---

## Что сколько занимает

| Часть | Порт | Память |
|---|---|---|
| Metro | 8081 | ~1,5–2 ГБ |
| API | 3000 | ~80 МБ |
| Postgres + Docker | 5433 | ~1,4 ГБ |

Самый прожорливый — Metro, а не Docker: он держит в памяти граф из почти
трёх тысяч модулей. Если нужно освободить память, но продолжить работу
с бэкендом, гасите именно его.

---

## Что проверить, когда что-то не работает

**Кто занимает порты:**

```powershell
foreach ($p in 3000,5433,8081) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { "$p -> PID $($c.OwningProcess) $((Get-Process -Id $c.OwningProcess).Name)" } else { "$p свободен" } }
```

**API не стартует, ругается на базу** — контейнер не поднят или ещё
не прошёл healthcheck. Вернитесь к шагу 2.

**База поднялась, но таблиц нет** — не применены миграции:

```powershell
cd L:\project\server
npx prisma migrate deploy
npm run seed
```

**Приложение не открывается на телефоне** — телефон и компьютер должны быть
в одной сети. На этом компьютере есть VPN-адаптеры (FlClashX, Radmin),
которые иногда перехватывают трафик. Обходится туннелем:

```powershell
npx expo start --tunnel
```

**Проверить, что всё работает целиком:**

```powershell
cd L:\project\server
npm run smoke
```

Тридцать проверок: вход, покупка, гонка за последний билет, двойная бронь
стола, оплата, отмена. Все зелёные — система в порядке.

---

## Полезное, но не обязательное

**Редактор базы в браузере** — листать и править таблицы руками:

```powershell
cd L:\project\server
npx prisma studio
```

**Логи базы:**

```powershell
docker compose -f L:\project\server\docker-compose.yml logs -f db
```

**SQL напрямую:**

```powershell
docker exec -it apprave-db psql -U apprave -d apprave
```

Внутри: `\dt` — список таблиц, `\d orders` — структура заказов, `\q` — выход.

---

## Запуск API в фоне

Если нужно, чтобы API работал, но не занимал окно терминала:

```powershell
Start-Process cmd.exe -ArgumentList "/c","npm run dev > api.log 2>&1" -WorkingDirectory "L:\project\server" -WindowStyle Hidden
```

Логи пишутся в `server\api.log`. Читать на ходу:

```powershell
Get-Content L:\project\server\api.log -Wait -Tail 20
```

Останавливать — командой из раздела «Если окон нет»: Ctrl+C к скрытому окну
неприменим, а остановка только по порту оставит обёртки `cmd.exe`, которые
заблокируют `api.log` и сорвут следующий запуск.

Пока активно правите бэкенд, обычное видимое окно удобнее: сразу видно
ошибки, и `tsx watch` перезапускает сервер на каждое сохранение файла.

> ⚠️ Команда `docker compose down -v` **удаляет все данные** — события,
> заказы, склад. Обычная остановка — это `docker compose stop`.
