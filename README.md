# DR Mini App

Telegram **Mini App** для замаскированного приглашения на день рождения. Гость думает, что проходит короткое "исследование" из 5 вопросов с картинками. В конце Mini App раскрывает: 29, 30, 31 мая в Питере. Каждому пользователю показывается персональный финал в зависимости от назначенных ему дней.

## Стек

- **Хостинг**: Vercel (бесплатный план)
- **БД**: Turso (managed SQLite, бесплатный план)
- **Сервер**: TypeScript, serverless functions через `@vercel/node`
- **Бот**: telegraf в webhook-режиме (не polling)
- **Клиент**: TypeScript, esbuild → один JS-бандл, без фреймворков

Никакого long-running процесса. Telegram POST'ит апдейты в `/api/telegram-webhook`, Mini App ходит в `/api/state|start|answer|complete`. Cold start ~500 мс. Сервис не засыпает.

## Структура

```
.
├── api/                 # Vercel serverless functions
│   ├── state.ts
│   ├── start.ts
│   ├── answer.ts
│   ├── complete.ts
│   ├── telegram-webhook.ts
│   └── _common.ts
├── data/                # bundled with deploy
│   ├── questions.json
│   └── guests.json
├── public/              # served as static from root
│   ├── index.html
│   ├── styles.css
│   ├── app.js           # esbuild output (gitignored)
│   └── assets/
│       ├── questions/
│       ├── reactions/
│       └── finals/
├── web/src/             # client TypeScript
│   ├── main.ts
│   ├── api.ts
│   ├── types.ts
│   └── telegram.d.ts
├── src/                 # shared server logic
│   ├── apiHandlers.ts   # pure async handlers used by api/*.ts
│   ├── bot.ts           # telegraf bot (used by telegram-webhook)
│   ├── adminCommands.ts
│   ├── analytics.ts
│   ├── csv.ts
│   ├── db.ts            # libsql client
│   ├── storage.ts
│   ├── scenario.ts
│   ├── guests.ts
│   ├── renderText.ts
│   ├── auth.ts          # HMAC initData validation
│   ├── config.ts
│   ├── utils.ts
│   └── types.ts
├── vercel.json
├── tsconfig.json
├── tsconfig.web.json
└── package.json
```

## Деплой за 15 минут

### Шаг 1. Turso (SQLite as a service)

1. Регистрация: [turso.tech](https://turso.tech) (можно через GitHub) - free plan, без карты.
2. Установить CLI:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   ```
3. Логин:
   ```bash
   turso auth login
   ```
4. Создать БД (регион Frankfurt - ближе всего к Питеру):
   ```bash
   turso db create dr-bot --location fra
   ```
5. Получить URL и токен:
   ```bash
   turso db show dr-bot --url
   turso db tokens create dr-bot
   ```
   Сохрани оба значения - пойдут в Vercel env vars.

### Шаг 2. Vercel

1. Регистрация: [vercel.com](https://vercel.com) (через GitHub) - free plan, без карты.
2. **Add New** → **Project** → Import репозиторий `tsch1446/issledrovanie`.
3. **Framework Preset**: Other (Vercel сам разберётся - есть `vercel.json`)
4. **Environment Variables** - добавь:
   - `BOT_TOKEN` - токен от [@BotFather](https://t.me/BotFather)
   - `ADMIN_TELEGRAM_ID` - твой числовой Telegram ID
   - `TURSO_DATABASE_URL` - из шага 1 (`libsql://dr-bot-...turso.io`)
   - `TURSO_AUTH_TOKEN` - из шага 1
   - `TELEGRAM_WEBHOOK_SECRET` - любая случайная строка, например `openssl rand -hex 32`
   - `NODE_ENV` - `production`
   - `PUBLIC_URL` - пока пусто, впишем после первого деплоя
5. **Deploy**. Получишь URL вида `https://issledrovanie-xxx.vercel.app`.
6. Скопируй URL → Settings → Environment Variables → впиши в `PUBLIC_URL` → **Redeploy**.

### Шаг 3. Регистрация webhook'а

В терминале, подставив свои значения:

```bash
BOT_TOKEN="<твой токен>"
PUBLIC_URL="https://issledrovanie-xxx.vercel.app"
SECRET="<TELEGRAM_WEBHOOK_SECRET из Vercel>"

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${PUBLIC_URL}/api/telegram-webhook" \
  -d "secret_token=${SECRET}" \
  -d "drop_pending_updates=true"
```

Должен вернуть `{"ok":true, ...}`. Проверить:

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

### Шаг 4. BotFather - привязать Mini App

В [@BotFather](https://t.me/BotFather):

1. `/mybots` → выбери бота → **Bot Settings** → **Menu Button** → задай:
   - URL: `https://issledrovanie-xxx.vercel.app/`
   - Текст: "Открыть исследование"
2. (Опционально) `/newapp` → выбери бота → задай title, описание, фото 640×360, иконку 256×256, short_name, Web App URL = `PUBLIC_URL`. После этого работает прямая ссылка `t.me/<bot_username>/<short_name>`.

### Шаг 5. Тест

1. Напиши боту `/start` - должна прийти кнопка "Открыть исследование".
2. Нажми кнопку - откроется Mini App с приветствием.
3. Пройди вопросы - на финальном экране увидишь свой персональный текст.

## Локальный запуск (для разработки)

Требуется Node.js >= 18 и Vercel CLI:

```bash
npm install -g vercel
```

```bash
npm install
cp .env.example .env
# заполни .env, включая TURSO_DATABASE_URL и TURSO_AUTH_TOKEN
```

Для локальной БД можно использовать file-режим libsql:

```
TURSO_DATABASE_URL=file:./data/local.db
TURSO_AUTH_TOKEN=
```

Запуск:

```bash
vercel dev
```

`vercel dev` поднимет dev-сервер на `http://localhost:3000`, который имитирует Vercel runtime (запускает функции из `api/*.ts`, отдаёт статику из `public/`). Для теста webhook'а локально нужен туннель (ngrok), webhook должен быть HTTPS.

Watch-сборка клиента в отдельном терминале:

```bash
npm run watch:web
```

Typecheck:

```bash
npm run typecheck
```

## Заполнение данных

### `data/guests.json`

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

После изменения - `git push`, Vercel автоматически передеплоит.

### `data/questions.json`

Структура каждого вопроса - см. существующие 5 заглушек в файле. Поля:
- `id`, `analyticsKey` - стабильные идентификаторы
- `text` - текст вопроса
- `image` - путь от корня репо, например `assets/questions/q_beer.jpg` (клиент сам подставит `/` в начале и обратится к Vercel-статике)
- `yesLabel`/`noLabel` - подписи для аналитики (могут быть инвертированы по смыслу)
- `yes.reactionImage`/`yes.reactionText`, `no.reactionImage`/`no.reactionText` - реакции

### Картинки

Положи файлы в `public/assets/`:

```
public/assets/questions/q_beer.jpg
public/assets/reactions/q_beer_yes.jpg
public/assets/reactions/q_beer_no.jpg
...
public/assets/finals/boys_all_three.jpg
```

Если файла нет - Mini App просто не покажет изображение, продолжит работать с текстом.

## Команды бота

### Пользовательские

- `/start` - присылает кнопку "Открыть исследование" (если ты в списке гостей)
- `/myid` - вернёт твой Telegram ID
- `/restart` - попытка перепройти. Обычному пользователю запрещена

### Админские (только для `ADMIN_TELEGRAM_ID`)

- `/stats` - общая статистика (сколько гостей, сколько начали, завершили, инвайты на 29/30/31)
- `/stats_questions` - агрегаты по каждому вопросу
- `/stats_question <questionId>` - кто как ответил
- `/insights` - человекочитаемые выводы (`Пиво пьют: 14`, `Свободны 30 мая: 18`)
- `/pending` - кто не начал и кто застрял
- `/user_status <telegramId>` - полный статус
- `/export` - CSV со всеми ответами
- `/export_summary` - CSV с агрегатами
- `/preview_final <telegramId>` - предпросмотр финального экрана конкретного гостя
- `/admin_reset <telegramId>` - сбросить прохождение
- `/dev_clear_db` - очистить БД (в `NODE_ENV=production` заблокирована)
- `/guests` - список гостей из `guests.json`

## Архитектура

**API эндпоинты** (все требуют `Authorization: tma <initData>`):
- `POST /api/state` - возвращает либо `{status:"unknown",telegramId}`, либо `{status:"ready",name,total,currentIndex,completed,questions,final}` (всё нужное клиенту за один запрос)
- `POST /api/start` - помечает `startedAt`
- `POST /api/answer` `{questionId, answer}` - сохраняет ответ, инкрементит `currentIndex`. Сверяет, что `questionId` соответствует ожидаемому индексу
- `POST /api/complete` - помечает `completed=1`

**Защита от повторов**:
- `UNIQUE(telegramId, questionId)` в SQLite
- Сервер сверяет `currentQuestionIndex`. Любая попытка ответить на старый вопрос - 409
- `completed=1` блокирует всё, кроме просмотра финала

**Валидация initData**: HMAC-SHA256 с ключом `HMAC-SHA256("WebAppData", BOT_TOKEN)`. Запросы старше 24 часов отклоняются.

**Webhook secret**: при `setWebhook` мы передаём `secret_token`. Telegram отправляет его обратно в заголовке `X-Telegram-Bot-Api-Secret-Token`. Сервер сверяет - так гарантируем, что webhook вызывает именно Telegram, а не кто-то знающий URL.

## Что делать когда гость хочет перепройти

```
/admin_reset <его telegramId>
```

Удаляет ответы, обнуляет прогресс. После этого он снова сможет открыть Mini App и пройти заново.

## SQLite

Файл БД живёт у Turso - бэкап делает Turso автоматически. Скачать локально для просмотра:

```bash
turso db shell dr-bot ".dump" > backup.sql
```

Или открыть прямо через CLI:

```bash
turso db shell dr-bot
> SELECT * FROM users;
> SELECT questionId, answer, COUNT(*) FROM answers GROUP BY questionId, answer;
```

## Стиль текстов

- Русский язык
- Живо, без канцелярита
- Не раскрывать заранее, что это про день рождения
- Финал интригующий, без лишних деталей
- Не использовать длинные тире - только обычный дефис
