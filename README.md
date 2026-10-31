# Медицинские изделия России

Full-stack приложение каталогизации и мониторинга медицинских изделий:
React-интерфейс и NestJS + PostgreSQL backend с реляционной схемой в 3НФ.

> Данные реестра — демонстрационные. Внешний государственный источник
> (Росздравнадзор) **не подключён**: загрузки выполняет `MockRegistryProvider`,
> и API помечает источник как `isReal: false`. См.
> [ADR 0008](backend/docs/adr/0008-registry-provider.md).

## Структура

```text
.                     frontend: React + Vite + TypeScript
backend/              API: NestJS (Fastify) + Prisma + PostgreSQL 17
docker-compose.yml    postgres + api
```

---

## Frontend

Адаптивный интерфейс: 11 маршрутов, три демонстрационные роли, каталог,
сравнение, отзывы, кабинеты и аналитические состояния.

```bash
npm install
npm run dev
```

Проверки и production-сборка:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Демонстрационные состояния

- `/catalog?state=empty` — пустая выдача.
- `/catalog?state=error` — ошибка каталога.
- `/government/sync?state=stale` — устаревшие данные.
- `/government/sync?state=error` — недоступный источник.

### Источник данных

Frontend по-прежнему работает через mock-адаптер `src/api/mockApi.ts`.
HTTP-клиент появится на этапе 7 (см. ниже); до тех пор демо на GitHub Pages
собирается и публикуется без изменений. Mock-адаптер не удаляется и после
перехода на HTTP — он остаётся реализацией `ApiClient` для Pages и
unit-тестов ([ADR 0007](backend/docs/adr/0007-mock-adapter-and-pages.md)).

---

## Backend

### Запуск через Docker Compose

```bash
cp .env.example .env
```

Заполните секреты в `.env` (сгенерировать:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`),
затем одной командой:

```bash
docker compose up -d --build
```

Compose поднимает `postgres` с healthcheck и volume, затем `api`, который
перед стартом применяет миграции (`prisma migrate deploy`). После этого:

```bash
docker compose exec api npx tsx prisma/seed.ts
```

- API: <http://localhost:3000/api/v1>
- OpenAPI (Swagger UI): <http://localhost:3000/api/v1/docs>
- OpenAPI JSON: <http://localhost:3000/api/v1/docs.json>
- Healthcheck: <http://localhost:3000/api/v1/health>

### Запуск без Docker

Если Docker недоступен, нужен любой PostgreSQL 17 — пошаговая инструкция для
портативной установки без прав администратора есть в
[backend/docs/local-postgres-without-docker.md](backend/docs/local-postgres-without-docker.md).

**Важно:** база должна быть
создана с UTF-8-совместимым `lc_ctype` (`C.UTF-8`, `ru-RU` или
`ru_RU.UTF-8`). При `--locale=C` PostgreSQL не приводит кириллицу к нижнему
регистру, и полнотекстовый поиск по русским словам молча перестаёт находить
совпадения. Проверка этого есть в `test/verify-schema-objects.ts`.

```bash
cd backend
npm install
export DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/medizdeliya?schema=public"
export JWT_ACCESS_SECRET="...не короче 32 символов..."
export JWT_REFRESH_SECRET="...не короче 32 символов..."
npm run db:setup     # migrate deploy + generate + seed
npm run start:dev
```

### Демонстрационные учётные записи

Пароль берётся из `SEED_DEV_PASSWORD`; если переменная не задана, seed
использует явно помеченный dev-only пароль и печатает предупреждение.
Реальных паролей в репозитории нет.

| Адрес | Роли | Назначение |
| --- | --- | --- |
| `user@medizdeliya.local` | `user` | обычный пользователь |
| `clinic@medizdeliya.local` | `user`, `organization` | подтверждённая медорганизация |
| `gov@medizdeliya.local` | `user`, `government` | государственная аналитика |
| `admin@medizdeliya.local` | `user`, `admin` | модерация отзывов |

Роли `government` и `admin` **нельзя получить самостоятельной регистрацией** —
при регистрации доступны только `user` и `organization`, а созданная
организация получает статус `pending`
([ADR 0005](backend/docs/adr/0005-auth-tokens.md)).

### Команды backend

```bash
npm run typecheck
npm run lint
npm run test                 # unit + integration (нужна поднятая БД)
npm run build

npm run db:migrate:deploy    # применить миграции с нуля
npm run db:seed              # идемпотентный seed
npm run db:refresh-views     # обновить materialized views аналитики
npm run db:migrate:reset     # пересоздать базу целиком
```

---

## База данных

Полное описание — [`backend/docs/database.md`](backend/docs/database.md):
ER-диаграммы, таблицы с PK/FK/UNIQUE/CHECK, функциональные зависимости,
доказательство 1НФ/2НФ/3НФ, список индексов с обоснованием и перечень
производных представлений.

50 отношений: 18 справочников и 32 таблицы предметной области.

Ключевые решения:

- справочные значения — отдельные таблицы с внешними ключами, не строки и не
  enum;
- характеристики изделий — `characteristic_definitions` +
  `product_characteristic_values`, JSON-колонок в схеме нет;
- рейтинг, число отзывов и диапазон цен в `products` не хранятся: их дают
  `product_rating_view` и `product_price_range_view`;
- бейдж «подтверждённая организация» у отзыва вычисляется, а не хранится;
- история статусов регистрации не перезаписывается
  (`registry_status_history`);
- аналитика — два materialized view, обновляемые после успешной загрузки и по
  расписанию.

### Архитектурные решения

| ADR | Тема |
| --- | --- |
| [0001](backend/docs/adr/0001-backend-stack.md) | NestJS + Fastify в `backend/` |
| [0002](backend/docs/adr/0002-postgresql-prisma.md) | PostgreSQL 17 + Prisma с SQL-миграциями |
| [0003](backend/docs/adr/0003-third-normal-form.md) | Справочники вместо строк, отказ от JSON |
| [0004](backend/docs/adr/0004-zod-validation.md) | Zod как единственная валидация DTO |
| [0005](backend/docs/adr/0005-auth-tokens.md) | Argon2id, access/refresh токены, ротация |
| [0006](backend/docs/adr/0006-derived-views.md) | Производные данные только во views |
| [0007](backend/docs/adr/0007-mock-adapter-and-pages.md) | Mock-адаптер и GitHub Pages |
| [0008](backend/docs/adr/0008-registry-provider.md) | `RegistryProvider` без реальной интеграции |

---

## Выполненные этапы

Этапы из `CLAUDE.md`:

- [x] **1. ADR и ERD, `backend/`, Docker Compose** — 8 ADR, ER-диаграммы и
      доказательство 3НФ в `backend/docs/database.md`, `docker-compose.yml`
      с healthcheck и volume, `.env.example`.
- [x] **2. Prisma schema, SQL-ограничения, миграции и seed** — 50 таблиц,
      17 CHECK-ограничений, 5 views, 2 materialized view, триггеры поискового
      индекса, идемпотентный seed.
- [x] **3. Auth и RBAC** — регистрация, вход, ротация refresh token с
      обнаружением повторного использования, выход, восстановление пароля,
      `GET /auth/me`, guard-ы ролей и проверка членства в организации.
- [ ] 4. Catalog и products.
- [ ] 5. Reviews, saved lists, comparisons, notifications.
- [ ] 6. Organization, analytics, mock sync.
- [ ] 7. `HttpApiClient` и подключение frontend.
- [ ] 8. Расширение unit/integration/e2e тестов.
- [ ] 9. CI, README и OpenAPI по всем разделам.
- [ ] 10. Полный прогон frontend и backend матрицы тестов.

### Что проверено

Проверка миграций на **пустой** PostgreSQL 17.6 (локально) и в CI
(`.github/workflows/backend-ci.yml`, отдельный workflow — публикация на
GitHub Pages не затронута):

```bash
cd backend
npm run db:migrate:deploy                      # 2 миграции на чистой базе
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code                                  # "No difference detected"
npm run db:seed
npx tsx test/verify-schema-objects.ts          # ограничения, триггеры, views
npx tsx test/verify-seed-idempotent.ts         # повторный seed + сверка views
npm run test                                   # 26 integration-тестов
```

Результаты:

| Проверка | Результат |
| --- | --- |
| `migrate deploy` на пустой базе | 2 миграции применены, 50 таблиц |
| расхождение `schema.prisma` и миграций | нет (`No difference detected`) |
| расширения, CHECK, триггеры, views, индексы | 17 CHECK, 5 views, 2 matview, 2 триггера, 4 функции |
| CHECK-ограничения в действии | отклоняют два значения характеристики, аналог самому себе, 4-ю позицию сравнения, оценку 7 |
| идемпотентность seed | повторный запуск — 205 строк в 50 таблицах без изменений |
| `priceMin`/`priceMax` против `mockData.ts` | совпадают; истёкшее предложение исключено |
| рейтинг по опубликованным отзывам | МП-12 — 4.50 из 2 отзывов; отзыв на модерации не учитывается |
| полнотекстовый поиск | находит по названию, производителю и регистрационному номеру |
| аналитика | 75 % отечественных, 25 % импорта в «Диагностике» |
| auth и RBAC | 26 тестов: ротация, обнаружение кражи токена, запрет самоназначения ролей, rate limit |
| frontend `typecheck` / `lint` / `test` / `build` | проходят, файлы frontend не изменялись |

Рейтинги и счётчики отзывов намеренно отличаются от демонстрационных чисел в
`src/data/mockData.ts` (`rating: 4.8`, `reviewCount: 128`): по правилу 6 из
`CLAUDE.md` они не являются источником истины и считаются из фактических
отзывов в `reviews`.
