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

Аппетит WSL ограничен четырьмя гигабайтами в `~/.wslconfig` — без этого
он запрашивал половину всей памяти и Docker переставал запускаться
на загруженной системе.

**За местом на диске C стоит следить.** Образы и тома Docker лежат там,
и растут они незаметно. Посмотреть, сколько занято:

```powershell
docker system df
```

Убрать неиспользуемые образы, не трогая тома с данными:

```powershell
docker image prune -a
```

---

## Что проверить, когда что-то не работает

**Кто занимает порты:**

```powershell
foreach ($p in 3000,5433,8081) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { "$p -> PID $($c.OwningProcess) $((Get-Process -Id $c.OwningProcess).Name)" } else { "$p свободен" } }
```

**Docker Desktop не запускается, ошибка `0x800705aa`** —
`ERROR_NO_SYSTEM_RESOURCES`. Полный текст выглядит так:

```
Wsl/Service/RegisterDistro/CreateVm/HCS/0x800705aa
```

Причина не в Docker, а в памяти. WSL без явного лимита запрашивает под
виртуальную машину **половину всей оперативной памяти** — на этой машине
8 ГБ из 16. Если браузер, Steam и Discord уже заняли своё, Hyper-V не может
зарезервировать нужный объём и отказывается создавать машину.

Лечится ограничением в `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=4GB
processors=4
swap=2GB
```

Затем полный перезапуск:

```powershell
wsl --shutdown
```

и заново открыть Docker Desktop. Четырёх гигабайт Postgres хватает
с запасом, а Hyper-V укладывается в свободную память.

Быстро посмотреть, кто съел память:

```powershell
Get-Process | Group-Object ProcessName | ForEach-Object { [PSCustomObject]@{ Имя = $_.Name; МБ = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum)/1MB) } } | Sort-Object МБ -Descending | Select-Object -First 8
```

**Docker пишет, что дистрибутив не зарегистрирован** — после сбоя WSL может
разрегистрировать `docker-desktop`, и Docker пересоздаёт его из файла диска.
Это нормально и данные не трогает: образы и тома лежат в отдельном файле
`%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`.

⚠️ Не удаляйте этот файл вручную и не выполняйте `wsl --unregister` —
вместе с ним пропадут все тома, включая базу.

Проверить, что данные на месте, после любого сбоя:

```powershell
docker exec apprave-db psql -U apprave -d apprave -tAc "SELECT 'события: '||(SELECT count(*) FROM events)||', заказы: '||(SELECT count(*) FROM orders)"
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
npm run smoke:all
```

Шесть наборов подряд: сервер сам по себе (вход, покупка, гонка за последний
билет, двойная бронь стола, оплата, отмена), права ролей, вход по телефону
и почте, заказы теми же вызовами, что делает приложение, правка каталога
со складом и возврат денег за отменённую вечеринку. Все зелёные — система
в порядке.

Отдельно любой из наборов: `npm run smoke`, `npm run smoke:roles`,
`npm run smoke:identity`, `npm run smoke:orders`, `npm run smoke:catalog`,
`npm run smoke:refund`.

Наборы сами пополняют себе склад и тираж билетов перед покупками: они гоняются
по одной и той же базе десятки раз, и без этого однажды падали бы не потому,
что что-то сломалось, а потому, что кончился коктейль.

---

## Полезное, но не обязательное

**Афиша уехала в прошлое.** Посев ставит даты относительно дня запуска,
поэтому через неделю разработки все вечеринки оказываются позади. Купить
и отменить в приложении становится нечего — выглядит как поломка, хотя
сломались данные:

```powershell
cd L:\project\server
npm run demo:refresh
```

Сдвигает прошедшие вечеринки вперёд, сохраняя промежутки. Заказы не трогает:
купленные билеты продолжают указывать на те же события.

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
