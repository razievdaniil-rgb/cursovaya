# Handoff для Claude Code: backend и PostgreSQL в 3НФ

## Цель следующего этапа

Довести проект «Медицинские изделия России» до полноценного full-stack приложения:

- создать production-ready backend на NestJS + PostgreSQL;
- спроектировать и реализовать реляционную БД в третьей нормальной форме;
- заменить демонстрационный `MockApiClient` на HTTP-клиент без переписывания UI;
- реализовать авторизацию, RBAC, каталог, карточку изделия, сравнения, избранное, отзывы, кабинет медорганизации, аналитику и журнал загрузок;
- сохранить существующий дизайн, маршруты и адаптивность;
- не заявлять о реальном подключении к Росздравнадзору, пока внешний источник действительно не подключён.

Работай автономно: сначала изучи репозиторий, затем реализуй этапы ниже. Не заменяй существующий frontend другим фреймворком и не ломай GitHub Pages до появления отдельного хостинга API.

## Текущее состояние

- Репозиторий: `https://github.com/razievdaniil-rgb/cursovaya`
- Frontend: React + Vite + TypeScript.
- Маршрутизация: React Router.
- Серверное состояние: TanStack Query.
- Локальное состояние: Zustand с persistence.
- Формы: React Hook Form + Zod.
- Стили: CSS Modules.
- Текущий API-контракт: `src/types.ts`, интерфейс `ApiClient`.
- Демонстрационная реализация: `src/api/mockApi.ts`.
- Демонстрационные данные: `src/data/mockData.ts`.
- Все основные страницы уже реализованы.
- GitHub Pages публикует frontend из `main` через `.github/workflows/deploy-pages.yml`.
- Последний проверенный frontend-коммит перед backend-этапом: `234d0d8`.

Команды frontend, которые должны продолжать проходить:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

## Выбранная архитектура

Создай backend внутри `backend/`, не перемещая существующий frontend на первом этапе.

```text
backend/
  src/
    auth/
    users/
    organizations/
    catalog/
    products/
    manufacturers/
    reviews/
    saved-lists/
    comparisons/
    notifications/
    analytics/
    sync/
    files/
    common/
    prisma/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  test/
  Dockerfile
  package.json
docker-compose.yml
```

Технологии:

- NestJS с Fastify adapter;
- PostgreSQL 17;
- Prisma ORM и SQL-миграции;
- OpenAPI/Swagger;
- Zod или class-validator для входных DTO — выбери один подход и используй последовательно;
- Argon2id для паролей;
- JWT access token и ротация refresh token;
- Vitest/Jest для unit-тестов, Supertest для API e2e;
- Testcontainers PostgreSQL для интеграционных тестов, если окружение позволяет;
- Docker Compose для локального запуска.

## Правила 3НФ

1. Каждая таблица описывает одну сущность или одну связь.
2. Повторяющиеся справочные значения не хранятся строками в бизнес-таблицах.
3. Производитель, страна, город, категория, класс риска и статусы задаются внешними ключами.
4. Характеристики изделия не хранить одним JSON-объектом. Использовать определения характеристик и отдельные значения.
5. Документы, изображения, цены и регистрационные статусы не хранить массивами в строке изделия.
6. Рейтинг и количество отзывов не являются источником истины в `products`; рассчитывать запросом или materialized view.
7. Аналитические показатели строить из нормализованных таблиц. Materialized views допустимы как производный кэш, но не как единственное хранилище.
8. Историю изменения статуса не перезаписывать: хранить отдельными событиями.
9. Все внешние ключи индексировать там, где по ним выполняются выборки.
10. Денежные значения хранить как `numeric(14,2)`, даты — `timestamptz`, идентификаторы — UUID.

## Схема данных

Названия ниже являются обязательной смысловой моделью. Небольшие технические корректировки допустимы, но нельзя объединять независимые сущности в одну таблицу.

### Пользователи и доступ

`users`

- `id uuid PK`
- `email citext UNIQUE NOT NULL`
- `password_hash text NOT NULL`
- `display_name text NOT NULL`
- `account_status_id FK account_statuses`
- `email_verified_at timestamptz NULL`
- `created_at`, `updated_at`

`roles`: `id`, `code UNIQUE` (`user`, `organization`, `government`, `admin`), `name`.

`user_roles`: составной PK (`user_id`, `role_id`). Не хранить роль строкой в `users`.

`account_statuses`: `active`, `blocked`, `pending`.

`refresh_tokens`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `replaced_by_id`, `created_at`, `user_agent`, `ip_hash`.

`password_reset_tokens`: `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`.

### География и организации

`countries`: `id`, `iso2 UNIQUE`, `name UNIQUE`.

`regions`: `id`, `country_id`, `code`, `name`; UNIQUE (`country_id`, `code`).

`cities`: `id`, `region_id`, `name`; UNIQUE (`region_id`, `name`).

`organization_types`: `medical`, `government`, `supplier`, `manufacturer`.

`organization_verification_statuses`: `pending`, `verified`, `rejected`, `suspended`.

`organizations`: `id`, `organization_type_id`, `verification_status_id`, `name`, `short_name`, `inn`, `ogrn`, `city_id`, `address`, `created_at`, `updated_at`; `inn` и `ogrn` уникальны, если заполнены.

`organization_member_roles`: `member`, `manager`, `reviewer`, `analyst`, `administrator`.

`organization_members`: составной PK (`organization_id`, `user_id`), `member_role_id`, `joined_at`, `verified_at`.

### Каталог и регистрационные сведения

`manufacturers`: `id`, `organization_id NULL`, `name`, `country_id`, `city_id NULL`, `website NULL`, `created_at`, `updated_at`.

`product_categories`: `id`, `parent_id NULL self FK`, `name`, `slug UNIQUE`, `sort_order`.

`risk_classes`: `id`, `code UNIQUE` (`1`, `2a`, `2b`, `3`), `name`, `sort_order`.

`product_origin_types`: `domestic`, `imported`.

`registry_statuses`: `active`, `changed`, `expiring`, `expired`, `suspended`.

`products`:

- `id uuid PK`
- `manufacturer_id FK`
- `category_id FK`
- `risk_class_id FK`
- `origin_type_id FK`
- `current_registry_status_id FK`
- `name`, `short_name`
- `registration_number UNIQUE NOT NULL`
- `registration_date date NULL`
- `registration_expires_at date NULL`
- `verified_at timestamptz`
- `description text NULL`
- `created_at`, `updated_at`

`product_images`: `id`, `product_id`, `storage_key`, `alt_text`, `sort_order`, `created_at`; UNIQUE (`product_id`, `sort_order`).

`document_types`: `registration_certificate`, `instruction`, `declaration`, `manual`, `other`.

`product_documents`: `id`, `product_id`, `document_type_id`, `title`, `storage_key`, `document_number NULL`, `issued_at NULL`, `valid_until NULL`, `created_at`.

`registry_status_history`: `id`, `product_id`, `registry_status_id`, `effective_at`, `source_run_id NULL`, `comment NULL`, `created_at`. Текущее значение в `products` обновлять транзакционно вместе с добавлением истории.

### Характеристики без JSON

`measurement_units`: `id`, `code UNIQUE`, `name`, `symbol NULL`.

`characteristic_value_types`: `text`, `number`, `boolean`, `date`.

`characteristic_definitions`: `id`, `category_id NULL`, `code UNIQUE`, `name`, `value_type_id`, `unit_id NULL`, `is_comparable`, `sort_order`.

`product_characteristic_values`:

- `id`
- `product_id`
- `characteristic_definition_id`
- ровно одно из `text_value`, `numeric_value`, `boolean_value`, `date_value`
- UNIQUE (`product_id`, `characteristic_definition_id`)

Добавь SQL CHECK, гарантирующий заполнение ровно одного типизированного значения и соответствие `value_type` на уровне сервиса.

### Цены и поставщики

`currencies`: `id`, `code UNIQUE`, `name`, `symbol`.

`suppliers`: `id`, `organization_id UNIQUE`, `license_number NULL`, `created_at`.

`supplier_offers`: `id`, `product_id`, `supplier_id`, `currency_id`, `region_id NULL`, `price numeric(14,2)`, `valid_from`, `valid_until NULL`, `source_url NULL`, `created_at`.

Диапазон цен изделия рассчитывать как `min(price)`/`max(price)` только по действующим предложениям.

### Аналоги

`analogue_types`: `domestic`, `imported`, `functional`.

`product_analogues`: составной PK (`product_id`, `analogue_product_id`), `analogue_type_id`, `similarity_score numeric(5,4) NULL`, `created_at`.

Запретить связь изделия с самим собой. При необходимости симметричность поддерживать сервисом и транзакцией.

### Отзывы и модерация

`review_experience_periods`: справочник значений интерфейса.

`review_statuses`: `moderation`, `published`, `rejected`, `hidden`.

`reviews`: `id`, `product_id`, `author_user_id`, `author_organization_id NULL`, `experience_period_id`, `review_status_id`, `rating smallint CHECK 1..5`, `title`, `body`, `created_at`, `updated_at`, `published_at NULL`.

Подтверждённый бейдж не хранить отдельным boolean: он определяется по `author_organization_id` и текущему статусу верификации организации.

`review_moderation_events`: `id`, `review_id`, `moderator_user_id`, `from_status_id`, `to_status_id`, `comment NULL`, `created_at`.

### Избранное и сравнения

`saved_lists`: `id`, `owner_user_id`, `organization_id NULL`, `name`, `created_at`, `updated_at`.

`saved_list_items`: составной PK (`saved_list_id`, `product_id`), `added_at`.

`comparisons`: `id`, `owner_user_id`, `name NULL`, `created_at`, `updated_at`.

`comparison_items`: составной PK (`comparison_id`, `product_id`), `position smallint`, UNIQUE (`comparison_id`, `position`). Ограничение максимум три изделия обеспечить транзакцией в сервисе и покрыть конкурентным тестом.

### Уведомления

`notification_types`: `registry_status_changed`, `price_changed`, `registration_expiring`, `review_status_changed`, `sync_failed`.

`notification_severities`: `info`, `success`, `warning`, `danger`.

`notifications`: `id`, `notification_type_id`, `severity_id`, `product_id NULL`, `title`, `body`, `created_at`.

`notification_recipients`: составной PK (`notification_id`, `user_id`), `delivered_at NULL`, `read_at NULL`.

### Загрузки и будущая интеграция

`sync_sources`: `id`, `code UNIQUE`, `name`, `base_url NULL`, `is_enabled`.

`sync_run_statuses`: `running`, `success`, `partial`, `failed`.

`sync_runs`: `id`, `sync_source_id`, `status_id`, `started_at`, `finished_at NULL`, `records_read`, `records_changed`, `error_count`, `error_message NULL`, `initiated_by_user_id NULL`.

`sync_run_errors`: `id`, `sync_run_id`, `external_record_id NULL`, `error_code`, `message`, `payload_checksum NULL`, `created_at`.

Создай интерфейс `RegistryProvider` и реализацию `MockRegistryProvider`. Реальный HTTP-provider не реализовывать без официальной документации и доступа.

## Представления и аналитика

Создай SQL views/materialized views:

- `product_catalog_view`: карточка каталога с производителем, страной, категорией, статусом, рейтингом и диапазоном действующих цен;
- `product_rating_view`: средний рейтинг и число опубликованных отзывов;
- `category_import_dependency_view`: доля импортных изделий по категориям;
- `domestic_share_by_period_view`: доля российских изделий по периодам;
- `problem_products_view`: истекающая/приостановленная регистрация, критические отзывы, отсутствие актуальных предложений;
- `organization_dashboard_view`: сохранённые позиции, сравнения, отзывы и непрочитанные уведомления.

Materialized views обновлять после успешной загрузки данных и по расписанию. Исходные таблицы остаются нормализованными.

## HTTP API v1

Базовый путь: `/api/v1`. Ответы оборачивать последовательно; ошибки возвращать в формате RFC 9457 Problem Details.

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/recovery/request`
- `POST /auth/recovery/confirm`
- `GET /auth/me`

### Catalog

- `GET /products` — pagination, search, category, manufacturer, country, status, riskClass, priceMin, priceMax, sort.
- `GET /products/:id`
- `GET /products/:id/analogues`
- `GET /products/:id/reviews`
- `GET /products/:id/documents`
- `GET /catalog/filters`

Для списков используй cursor pagination или page/limit последовательно. Добавь полнотекстовый поиск PostgreSQL по названию, производителю и регистрационному номеру.

### Reviews

- `POST /products/:id/reviews`
- `GET /me/reviews`
- `PATCH /admin/reviews/:id/status` — moderator/admin.

### Saved and comparisons

- CRUD `/saved-lists`
- `POST/DELETE /saved-lists/:listId/products/:productId`
- CRUD `/comparisons`
- `POST/DELETE /comparisons/:comparisonId/products/:productId`

### Organization

- `GET /organization/dashboard`
- `GET /organization/notifications`
- `PATCH /organization/notifications/:id/read`

### Government

- `GET /government/analytics?period=&categoryId=`
- `GET /government/problem-products`
- `GET /government/sync`
- `POST /government/sync/run` — создаёт запуск mock provider, не выдаёт его за реальное API.

## Авторизация и безопасность

- Access token: 15 минут, передаётся как Bearer token.
- Refresh token: 30 дней, хранить hash в БД, передавать в `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Ротация refresh token с обнаружением повторного использования.
- Пароли: Argon2id с безопасными параметрами.
- RBAC guards для `user`, `organization`, `government`, `admin`.
- Проверка членства в организации для всех organization endpoints.
- Rate limit для login, register и recovery.
- CORS только из списка `FRONTEND_ORIGINS`.
- Helmet, request id, structured logs без паролей и токенов.
- Все mutation endpoints валидируют DTO и права доступа.
- Для загрузки файлов: whitelist MIME, лимит размера, случайный storage key; публичное имя файла не использовать как путь.

## Интеграция frontend

1. Расширь `ApiClient`, не импортируй backend DTO напрямую из NestJS.
2. Создай `src/api/httpApi.ts`, реализующий тот же интерфейс через `fetch`.
3. Создай `src/api/client.ts`, выбирающий HTTP или mock через `VITE_API_URL`/`VITE_USE_MOCK_API`.
4. Замени прямые импорты `mockApi` в страницах на общий `apiClient`.
5. Сессию больше не считать достоверной только из `localStorage`; при загрузке вызывать `/auth/me`.
6. В Zustand оставить UI-state, compare draft и безопасные пользовательские предпочтения. Токены в `localStorage` не хранить.
7. TanStack Query keys и invalidation настроить для reviews, saved lists, comparisons и notifications.
8. Сохранить возможность frontend-only demo на GitHub Pages через mock adapter, пока API не размещён публично.

## Seed

Seed должен быть идемпотентным и содержать:

- четыре существующих изделия из `src/data/mockData.ts`;
- производителей, страны, города, категории и классы риска;
- характеристики каждого изделия;
- документы и локальные пути изображений;
- несколько предложений поставщиков для вычисления диапазона цен;
- опубликованные и ожидающие модерации отзывы;
- три учётные записи: user, organization, government;
- подтверждённую медорганизацию и членство пользователя;
- уведомления, сравнение и список сохранённых изделий;
- несколько успешных и ошибочных sync runs.

Не хранить реальные пароли в репозитории. Seed-пароль брать из env или использовать явно обозначенный локальный dev-only пароль.

## Docker и окружение

`docker-compose.yml` должен поднимать:

- `postgres` с healthcheck и volume;
- `api` с ожиданием готовности БД;
- опционально `minio` только если файловое хранилище реально используется.

Добавь `.env.example`, но не коммить `.env`.

Минимальные переменные:

```env
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
FRONTEND_ORIGINS=http://localhost:5173
PORT=3000
STORAGE_DRIVER=local
```

## Миграции и доказательство 3НФ

Создай `backend/docs/database.md`:

- ER-диаграмма Mermaid;
- описание таблиц, PK/FK/UNIQUE/CHECK;
- функциональные зависимости для основных отношений;
- краткое доказательство 1НФ, 2НФ и 3НФ;
- список индексов и обоснование;
- перечень derived views, которые не являются источником истины.

Миграции должны создаваться и применяться с нуля одной командой. Добавь CI-проверку миграций на чистой PostgreSQL.

## Тесты

Обязательные сценарии:

- регистрация, login, refresh rotation, logout и recovery;
- RBAC и запрет доступа к чужой организации;
- каталог со всеми фильтрами, сортировкой, pagination и поиском;
- карточка с характеристиками, документами, ценами и аналогами;
- максимум три изделия в сравнении, включая конкурентные запросы;
- создание отзыва и переход по статусам модерации;
- verified badge вычисляется через организацию, а не принимается от клиента;
- сохранённые изделия и уведомления;
- аналитические показатели совпадают с seed-данными;
- current/stale/success/error состояния mock sync;
- миграция и seed на пустой базе;
- frontend smoke tests работают с HTTP API.

## Последовательность работы

1. Зафиксировать ADR и ERD, создать `backend/` и Docker Compose.
2. Реализовать Prisma schema, SQL constraints, migrations и seed.
3. Реализовать auth и RBAC.
4. Реализовать catalog/products и заменить JSON-характеристики нормализованными значениями.
5. Реализовать reviews, saved lists, comparisons и notifications.
6. Реализовать organization, analytics и mock sync.
7. Создать `HttpApiClient` и подключить frontend.
8. Добавить unit, integration и API e2e tests.
9. Обновить CI, README и OpenAPI.
10. Прогнать весь frontend и backend test matrix.

После каждого этапа оставляй рабочую сборку. Не удаляй mock adapter, пока HTTP-путь не покрыт тестами.

## Definition of Done

- PostgreSQL schema соответствует 3НФ и документирована.
- Миграции и seed поднимаются на пустой базе.
- Backend предоставляет OpenAPI и все необходимые endpoints.
- Авторизация и RBAC работают без хранения токенов в localStorage.
- Frontend работает через `HttpApiClient`, а GitHub Pages demo продолжает работать через mock.
- Нет прямых импортов `mockApi` из UI-компонентов.
- Все frontend проверки проходят.
- Все backend unit/integration/e2e проверки проходят.
- Docker Compose поднимает рабочую систему одной документированной командой.
- Реальный внешний API не имитируется и не заявляется подключённым.

## Первый запрос для Claude

Используй этот текст после открытия репозитория:

> Прочитай `CLAUDE.md`, `README.md`, `src/types.ts`, `src/api/mockApi.ts` и текущие страницы. Реализуй backend и PostgreSQL по этапам из `CLAUDE.md`. Начни с ADR, ERD, Docker Compose, Prisma schema, миграций и идемпотентного seed. Затем запусти базу, докажи применимость миграций на пустом PostgreSQL и только после этого переходи к auth. Не переписывай существующий frontend и не удаляй mock adapter. Фиксируй выполненные этапы и команды проверки в README.
