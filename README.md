# DR Mini App

Telegram **Mini App** для замаскированного приглашения на день рождения. Гость думает, что проходит короткое "исследование" из 5 вопросов с картинками. В конце Mini App раскрывает: 29, 30, 31 мая в Питере. Каждому пользователю показывается персональный финал в зависимости от назначенных ему дней.

## Что внутри

- **Сервер**: Node.js + TypeScript, Express + telegraf, SQLite (`better-sqlite3`)
- **Клиент**: TypeScript, esbuild → один JS-бандл, без фреймворков
- **Сценарий вопросов** и **список гостей** хранятся в JSON, редактируются без изменения кода
- Защита от повторного прохождения, аналитика в SQLite, CSV-экспорт
- Бот выступает входной точкой (`/start` → кнопка "Открыть исследование" с WebApp URL), плюс держит админские команды
- Альтернативно работает прямая ссылка `t.me/<bot>/<app>`, минуя бота

## Структура

```
.
├── data/
│   ├── questions.json   # сценарий
│   ├── guests.json      # гости + назначенные дни
│   └── bot.sqlite       # создается автоматически
├── assets/              # раздаются как /assets/* из express
│   ├── questions/
│   ├── reactions/
│   └── finals/
├── public/              # статика клиента (HTML/CSS)
│   ├── index.html
│   ├── styles.css
│   └── app.js           # собирается из web/src/, не коммитим
├── web/src/             # исходники клиента (TypeScript)
│   ├── main.ts
│   ├── api.ts
│   └── types.ts
└── src/                 # сервер (TypeScript)
    ├── index.ts         # entry: запускает Express + telegraf
    ├── server.ts        # Express
    ├── api.ts           # /api/state, /api/start, /api/answer, /api/complete
    ├── auth.ts          # валидация Telegram initData (HMAC-SHA256)
    ├── bot.ts           # бот: /start, /myid, /restart, админка
    ├── adminCommands.ts
    ├── analytics.ts
    ├── csv.ts
    ├── db.ts
    ├── storage.ts
    ├── scenario.ts
    ├── guests.ts
    ├── renderText.ts
    ├── config.ts
    ├── utils.ts
    └── types.ts
```

## Быстрый старт

### 1. Создать бота через BotFather

1. Открой Telegram, напиши [@BotFather](https://t.me/BotFather).
2. `/newbot` → имя и username.
3. Скопируй `BOT_TOKEN`.

### 2. Узнать свой Telegram ID

Напиши [@userinfobot](https://t.me/userinfobot), либо запусти проект и отправь боту `/myid`.

ID нужен для:
- `ADMIN_TELEGRAM_ID` в `.env`
- каждого гостя в `guests.json`

### 3. Установить зависимости

Требуется Node.js >= 18.

```bash
npm install
```

При установке `better-sqlite3` собирается нативный модуль. Если не собирается:
- macOS: `xcode-select --install`
- Везде: `npm rebuild better-sqlite3`

### 4. Настроить `.env`

```bash
cp .env.example .env
```

```
BOT_TOKEN=123456:ABC...
ADMIN_TELEGRAM_ID=твой_id
NODE_ENV=development
PORT=3000
PUBLIC_URL=https://<твой-домен-с-https>
```

`PUBLIC_URL` обязателен и обязательно HTTPS. Локально используй ngrok или Cloudflare Tunnel:

```bash
# в одном терминале
npm run dev
# в другом
ngrok http 3000
# и взять https-url из вывода, вписать в .env как PUBLIC_URL
# перезапустить npm run dev
```

### 5. Наполнить данные

`data/guests.json`:

```json
[
  {
    "telegramId": 111111111,
    "name": "Даня",
    "days": ["2026-05-29", "2026-05-30", "2026-05-31"],
    "group": "boys",
    "finalVariant": "boys_all_three",
    "notes": "Все три дня"
  }
]
```

Поля:
- `telegramId` - числовой ID
- `name` - имя, как обращаемся в Mini App
- `days` - массив `YYYY-MM-DD`. Mini App соберёт финальный текст
- `group` - произвольная группа для аналитики (`boys`, `family`, `work`...)
- `finalVariant` - имя файла в `assets/finals/<variant>.jpg`
- `notes` - заметка для тебя

`data/questions.json` - каждый вопрос:
- `id` - стабильный идентификатор (`q_beer`)
- `analyticsKey` - ключ для аналитики (`beer`)
- `text` - вопрос
- `image` - путь к картинке (`assets/questions/q_beer.jpg`)
- `yesLabel`, `noLabel` - подписи для аналитики (могут быть инвертированы, см. `q_free_30`)
- `yes.reactionImage` + `yes.reactionText` - реакция на "Да"
- `no.reactionImage` + `no.reactionText` - реакция на "Нет"

### 6. Положить картинки

```
assets/questions/q_beer.jpg
assets/reactions/q_beer_yes.jpg
assets/reactions/q_beer_no.jpg
...
assets/finals/boys_all_three.jpg
```

Если файла нет, Mini App просто не покажет блок с изображением (без ошибки). Аналогично боту - картинку в превью пропустит, текст останется.

### 7. Привязать Mini App к боту в BotFather

В BotFather:

1. `/mybots` → выбрать бота → **Bot Settings** → **Menu Button** → задать URL = `PUBLIC_URL` и текст кнопки "Открыть исследование". Это даст кнопку слева от поля ввода в чате с ботом, открывающую Mini App.
2. Чтобы работала прямая ссылка `t.me/<bot>/<short_name>`:
   - В BotFather: `/newapp` → выбрать бота → ввести title, описание, фото 640x360, иконку 256x256, `short_name`, и **Web App URL = PUBLIC_URL**.
   - После этого делишься ссылкой `https://t.me/<bot_username>/<short_name>`. Telegram сразу открывает Mini App.

### 8. Запустить локально

Dev (сервер + watch-сборка клиента в одну команду):

```bash
npm run dev
```

Это поднимет:
- HTTP-сервер на `PORT` (по умолчанию 3000)
- Polling бота
- esbuild --watch для клиента (пересобирает `public/app.js` при изменении `web/src/`)

Прод:

```bash
npm run build
npm start
```

Typecheck сервера и клиента вместе:

```bash
npm run typecheck
```

## Пользовательские команды бота

- `/start` - проверяет, в списке ли пользователь. Если да - присылает приветствие и кнопку `Открыть исследование` (WebApp). Если нет - сообщает Telegram ID.
- `/myid` - вернёт свой Telegram ID
- `/restart` - пройти заново. Обычному пользователю запрещено - бот отвечает, что результаты зафиксированы

## Сценарий внутри Mini App

1. Mini App стартует, шлёт `POST /api/state` с `initData` в `Authorization`. Сервер валидирует HMAC, возвращает либо `unknown`, либо `ready` с именем, прогрессом, списком вопросов и финалом.
2. Welcome-экран → кнопка "Начать" → `POST /api/start`.
3. Question-экран (картинка + текст + Да/Нет) → `POST /api/answer` → Reaction-экран (картинка + текст + "Дальше").
4. После последнего вопроса → `POST /api/complete` → Final-экран.
5. На "Я понял" - `Telegram.WebApp.close()`.

Защита от повторов:
- `UNIQUE(telegramId, questionId)` в SQLite.
- Сервер сверяет `currentQuestionIndex` с присланным `questionId`. Любая попытка ответить на старый вопрос - 409.
- `completed=1` блокирует всё, кроме просмотра финала.

## Админские команды (в боте)

Только из `ADMIN_TELEGRAM_ID`.

- `/stats` - сколько гостей, сколько начали, завершили, completion rate, инвайты на 29/30/31
- `/stats_questions` - агрегаты по каждому вопросу (Да/Нет в штуках и процентах)
- `/stats_question <questionId>` - кто как ответил
- `/insights` - человекочитаемые выводы (`Пиво пьют: 14`, `Свободны 30 мая: 18`)
- `/pending` - кто не начал и кто застрял
- `/user_status <telegramId>` - полный статус
- `/export` - CSV со всеми ответами
- `/export_summary` - CSV с агрегатами
- `/preview_final <telegramId>` - предпросмотр финального экрана конкретного гостя
- `/admin_reset <telegramId>` - сбросить прохождение конкретного пользователя
- `/dev_clear_db` - очистить SQLite (в `NODE_ENV=production` заблокирована)
- `/guests` - список гостей из `guests.json`

## CSV-экспорт

`/export` - `answers_*.csv`:
```
telegramId, username, firstName, questionId, questionText, analyticsKey, answer, answerLabel, timestamp, completed, assignedDays, groupName
```

`/export_summary` - `summary_*.csv`:
```
questionId, questionText, analyticsKey, yesLabel, noLabel, yesCount, noCount, totalAnswers, yesPercent, noPercent
```

CSV в UTF-8. Открывается в Numbers и Google Sheets корректно.

## SQLite

`data/bot.sqlite`. Создаётся автоматически. Бэкап = копия файла. В `.gitignore`.

Таблицы: `users`, `answers`, `events`.

## Сброс пользователя

```
/admin_reset 123456789
```

Удаляет ответы, обнуляет `completed`, `completedAt`, `currentQuestionIndex`, `startedAt`. После - пользователь может снова открыть Mini App и пройти заново.

## Деплой на Render

Сценарий: один Web Service держит и HTTP, и бота (polling).

1. Запушь репозиторий на GitHub.
2. Render → **New Web Service** → подключи репо.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Environment:
   - `BOT_TOKEN` - токен от BotFather
   - `ADMIN_TELEGRAM_ID` - твой ID
   - `NODE_ENV` - `production`
   - `PUBLIC_URL` - адрес сервиса (Render показывает после первого деплоя, вида `https://dr-mini-app.onrender.com`). После первого деплоя - впиши и передеплой.
   - `PORT` - Render проставляет автоматически, пусто оставь.
6. **Persistent Disk**: подключи диск, mount path = `/opt/render/project/src/data`. Иначе SQLite сбросится при следующем деплое. 1 GB достаточно.
7. После деплоя - в BotFather привяжи `PUBLIC_URL` к Menu Button и к Web App (`/newapp`).
8. Free-план Render усыпляет сервис при простое. Polling бота из-за этого может пропускать сообщения. Для гарантии работы возьми Starter ($7/мес) или сделай heartbeat-пинг на `/healthz`.

## Деплой на Railway

Аналогично:
1. Создать проект из репозитория.
2. Build: `npm run build`, Start: `npm start`.
3. Env vars те же.
4. Подключить Volume, смонтировать на `./data`.

## Заметки

- `initData` валидируется на каждом запросе через HMAC-SHA256 с `bot_token`. Запросы старше 24 часов отклоняются.
- Бот в режиме long-polling. Webhook не используется - так проще на Render/Railway.
- Картинки лучше не делать тяжелее 500 KB - Mini App грузит их на старте (preload), чтобы переходы были мгновенные.
- Telegram WebApp темизация работает автоматически: цвета берутся из `Telegram.WebApp.themeParams`.

## Стиль текстов

- Русский язык
- Живо, без канцелярита
- Не раскрывать заранее, что это про день рождения
- Финал интригующий, без лишних деталей
- Не использовать длинные тире - только обычный дефис
