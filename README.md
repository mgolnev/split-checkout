# Split checkout — UX-прототип

Интерактивный прототип оформления заказа с расчётом **split** по правилам, админкой для тестовых данных и режимом **override** для коридорных тестов.

Стек: **Next.js 15**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **Prisma 6**, **SQLite**.

## Запуск

```bash
npm install
cp .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000/checkout](http://localhost:3000/checkout) и [http://localhost:3000/admin/login](http://localhost:3000/admin/login).

В `.env` достаточно **`DATABASE_URL`** (см. `.env.example`). Пароль в URL лучше не собирать вручную — `npm run supabase:urls` выдаёт строки с уже закодированными символами.

### Деплой (Vercel) и миграции

Сборка **`npm run build`** = только **Next.js** (без `prisma migrate deploy`). На этапе билда к базе не подключаемся — деплой не «висит» на Supabase, как при отдельном `DIRECT_URL` / migrate в CI.

После изменений в `prisma/migrations` примените миграции к продовой БД **один раз**:

- локально: `DATABASE_URL="…из Vercel…" npm run db:migrate:deploy`, или
- **GitHub Actions** → workflow **«Migrate database»** (секрет `PRODUCTION_DATABASE_URL` = тот же `DATABASE_URL`, что в Vercel).

### Демо для клиентов (дешевле облака Yandex)

Если нужно просто **выложить прототип** для показов с телефона и сбора фидбека, а **Vercel не устраивает по TTFB из РФ** — разумный минимум: **небольшой VPS** (например Hetzner HEL / бюджетный тариф у российского провайдера) + тот же **`Dockerfile`**. База может остаться на **Supabase**. Кратко: **`deploy/demo-testing.md`**.

### Onreza и похожие прокси (Server Actions)

Если в логах **`x-forwarded-host` does not match `origin`** и **Invalid Server Actions request**, прокси отдаёт внутренний хост (например `10.x.x.x:порт`), а браузер шлёт публичный `Origin`. В переменных окружения деплоя задайте **`SERVER_ACTION_TRUSTED_ORIGINS`** — список хостов через запятую или шаблон **`*.onreza.app`**. Host из **`NEXT_PUBLIC_APP_URL`** тоже считается доверенным (если переменная задана). Правка заголовка делается в **`middleware.ts`** только для «внутренних» `X-Forwarded-Host` и только если `Origin` проходит allowlist.

Отдельно: **`PrismaClientInitializationError` / Can't reach database server`** значит, что из контейнера Onreza **недоступен** хост из **`DATABASE_URL`** (сеть, файрвол, неверный URL, БД выключена). Нужна рабочая строка подключения из той же сети, что и рантайм, или публичный pooler (Neon/Supabase и т.д.).

### Yandex Cloud

Полноценный деплой в YC (Managed PostgreSQL, Container Registry, ВМ) — см. **`deploy/yandex/README.md`**, если позже понадобится именно это.

### Supabase: `MaxClientsInSessionMode`

Если в логах runtime появится лимит сессий пула, в **`DATABASE_URL`** на Vercel используйте **Transaction pooler :6543** с `pgbouncer=true` (строка из `npm run supabase:urls`, блок «VERCEL runtime»).

## Пароль админки

Задаётся в `.env`: переменная `ADMIN_PASSWORD` (в `.env.example` — `admin`).

## Наполнение базы

- Схема: `prisma/schema.prisma`
- Сид: `prisma/seed.ts` — упрощённый конфиг: только Москва, 5 товаров, источники, остатки, правила, ПВЗ, пример override (выключен)
- Повторный сид перезаписывает данные (через `deleteMany` в начале сида)

```bash
npm run db:seed
```

Просмотр и правка «вручную»: `npm run db:studio`.

## Добавить товар

1. **Админка** → «Товары» — форма создания и переключение активности.
2. Либо Prisma Studio / прямой SQL.

После добавления товара добавьте строки в `Inventory` для нужных источников (курьер / самовывоз / ПВЗ).

## Как формируется корзина

Checkout больше не использует сущность тестовых корзин. Корзина формируется автоматически из **активных товаров с остатком > 0** в выбранном городе.

## Логистические правила

Модель `ShippingRule`: одна строка на пару **город + способ получения** (`DeliveryMethod`). Поля: сроки, стоимость доставки, порог бесплатной доставки, флаги использования склада / магазинов / click & collect.

Правка доступна и в админке, и через Prisma Studio.

## Override-сценарий

Таблица `ScenarioOverride`: совпадение по `cityId`, `deliveryMethod` (`courier` | `pickup` | `pvz`) и `isEnabled: true` **полностью заменяет** результат движка.

`payloadJson` — JSON вида:

```json
{
  "parts": [
    {
      "key": "part1",
      "sourceId": "src_wh_pod",
      "mode": "courier",
      "leadTimeLabel": "Завтра",
      "items": [{ "productId": "p_kurtka", "quantity": 1 }],
      "defaultIncluded": true,
      "canToggle": true
    }
  ],
  "remainder": [{ "productId": "p_futbolka", "quantity": 1 }],
  "informers": ["Произвольный текст для UX-теста"]
}
```

В админке можно **включить/выключить** готовый override; тело JSON удобно править в Studio.

## Движок split (кратко)

- **`lib/split-engine.ts`** — расчёт сценария по корзине, городу, способу и остаткам.
- **Курьер**: приоритет склада (Москва), полное покрытие → одна часть; иначе порог **40%** объёма со склада + вторая часть из **одного** магазина, если возможно; иначе упрощённый сценарий и остаток в корзине (не более двух отправлений по умолчанию).
- **Самовывоз**: сначала сток выбранного магазина (click & reserve), затем склад → магазин (click & collect), если у города `hasClickCollect` и правило разрешает; иначе остаток в корзине.
- **ПВЗ**: только складские позиции с флагом `availableForPVZ`; ПВЗ с `requiresPrepayment` не показываются в списке на checkout.

Подробнее — в ТЗ и комментариях в `split-engine.ts`.

Промокод **APP20** (−20%) и **1000 ₽ бонусов** на checkout взаимоисключающие.

## Маршруты

| Путь | Назначение |
|------|------------|
| `/checkout` | Клиентский прототип |
| `/thank-you` | Итог (данные из `sessionStorage`, заказы в БД не пишутся) |
| `/admin/*` | Админка (cookie после логина) |
| `/api/bootstrap` | Справочники для checkout |
| `/api/checkout/scenario` | POST: пересчёт сценария |
| `/api/cart-lines` | Состав корзины и суммы |

## Критерии готовности (из ТЗ)

Локальный запуск, редактируемые данные, расчёт split, курьер / самовывоз / ПВЗ, остаток в корзине, сид, override, thank you — реализованы в объёме MVP прототипа.
