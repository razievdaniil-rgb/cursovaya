# Медицинские изделия России

Full-stack приложение каталогизации и мониторинга медицинских изделий:
React-интерфейс и NestJS + PostgreSQL backend с реляционной схемой в 3НФ.

Текущий порядок запуска и эксплуатации — [operations.md](backend/docs/operations.md).
Полный стек включает интерфейс Nginx (`localhost:8080`), API и PostgreSQL;
системные справочники входят в миграции, поэтому production не требует demo seed.
Внешний реестр проверен 01.11.2026 запросом публичных записей и ограниченной
загрузкой через API → PostgreSQL → каталог. Количество записей источника меняется.
Токены восстановления пароля больше не выводятся в лог; для отправки письма
оператор настраивает email API через `RECOVERY_EMAIL_*`.

> **Три источника данных, и API не путает их между собой.**
>
> *Государственный реестр медицинских изделий* — настоящий: публичный API
> Росздравнадзора, 81 566 регистрационных записей, `isReal: true`. Хост
> отдаёт сертификат национального УЦ Минцифры, поэтому процессу нужен
> `NODE_EXTRA_CA_CERTS` (см. ниже) — проверка сертификатов при этом не
> отключается.
>
> *Номенклатурная классификация по видам* — настоящая: открытые данные
> Росздравнадзора, 25 708 видов и 591 раздел, `isReal: true`.
>
> *`MockRegistryProvider`* остаётся ради frontend-only демонстрации на
> GitHub Pages и помечен `isReal: false`. Признак берётся из описания
> провайдера, а не из базы, поэтому подменить его записью в таблице нельзя.
>
> Подробности: [ADR 0008](backend/docs/adr/0008-registry-provider.md),
> [ADR 0009](backend/docs/adr/0009-roszdravnadzor-open-data.md) и
> [ADR 0010](backend/docs/adr/0010-real-registry-integration.md).

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
npm run test:unit            # только unit, база не нужна
npm run test:integration     # только integration, нужна поднятая БД
npm run build

npm run db:migrate:deploy    # применить миграции с нуля
npm run db:seed              # идемпотентный seed
npm run db:refresh-views     # обновить materialized views аналитики
npm run openapi:export       # пересобрать backend/docs/openapi.json
npm run db:migrate:reset     # пересоздать базу целиком
```

Переменные внешних источников (все необязательные):

```env
# Каталог набора открытых данных; по умолчанию официальный адрес.
NOMENCLATURE_SOURCE_URL=https://roszdravnadzor.gov.ru/opendata/7710537160-mi_types
# Конкретная версия выгрузки; по умолчанию первое число текущего месяца.
NOMENCLATURE_FILE_NAME=data-20261101-structure-20180615.zip
# Локальный архив или XML вместо обращения к сети (используется тестами).
NOMENCLATURE_LOCAL_FILE=

# Адрес API государственного реестра; по умолчанию официальный.
REGISTRY_SOURCE_URL=https://elk.roszdravnadzor.gov.ru
# Локальная страница ответа вместо обращения к сети (используется тестами).
REGISTRY_LOCAL_FILE=
```

### Доверие к сертификату национального УЦ

`elk.roszdravnadzor.gov.ru` предъявляет сертификат, выданный национальным
удостоверяющим центром Минцифры. В наборе доверенных корней Node его нет,
поэтому без дополнительной настройки загрузка реестра падает — а сообщение
об ошибке объясняет, что именно нужно сделать.

Корень и промежуточный сертификат лежат в [`backend/certs/`](backend/certs/)
вместе с описанием происхождения и отпечатков. Процессу они передаются
переменной:

```bash
NODE_EXTRA_CA_CERTS=./certs/russian-trusted-ca.pem npm run start:dev
```

Переменная **добавляет** корень к доверенным и не отключает проверку
сертификатов, а действует только на тот процесс, которому передана. В
`docker-compose.yml` она уже прописана. Устанавливать корень в хранилище
системы не нужно: это дало бы этому УЦ право подтверждать сертификаты для
любого домена на всей машине. Отключать проверку
(`NODE_TLS_REJECT_UNAUTHORIZED=0`) нельзя — см.
[ADR 0010](backend/docs/adr/0010-real-registry-integration.md).

Без переменной работает всё, кроме загрузки реестра.

---

## HTTP API

Базовый путь — `/api/v1`. Полное описание генерируется из кода:
[`backend/docs/openapi.json`](backend/docs/openapi.json), интерактивно —
<http://localhost:3000/api/v1/docs>.

Успешный ответ всегда обёрнут в `{ "data": ... }`; списки добавляют `meta`
с `page`, `limit`, `total`, `totalPages`. Ошибки — RFC 9457
(`application/problem+json`) с полями `type`, `title`, `status`, `detail`,
`instance`, `requestId`; при 422 добавляется `errors` с сообщениями по полям.

### Авторизация

| Метод | Путь | Доступ |
| --- | --- | --- |
| POST | `/auth/register` | открыт, 5 запросов в минуту |
| POST | `/auth/login` | открыт, 10 запросов в минуту |
| POST | `/auth/refresh` | по refresh-cookie |
| POST | `/auth/logout` | открыт |
| POST | `/auth/recovery/request` | открыт, 3 запроса в минуту |
| POST | `/auth/recovery/confirm` | открыт, 5 запросов в минуту |
| GET | `/auth/me` | авторизованный |

### Каталог

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/products` | открыт |
| GET | `/products/:id` | открыт |
| GET | `/products/:id/analogues` | открыт |
| GET | `/products/:id/reviews` | открыт |
| GET | `/products/:id/documents` | открыт |
| GET | `/catalog/filters` | открыт |

Фильтры `/products`: `search`, `categorySlug`, `categoryId`,
`manufacturerId`, `countryIso2`, `status`, `riskClass`, `originType`,
`priceMin`, `priceMax`. Сортировка `sort`: `recommended`, `price-asc`,
`price-desc`, `rating-desc`, `name-asc`, `newest`. Пагинация `page`/`limit`.
Повторяющийся параметр и значения через запятую равнозначны.

### Номенклатурная классификация

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/nomenclature` | открыт |
| GET | `/nomenclature/sections` | открыт |
| GET | `/nomenclature/summary` | открыт |
| GET | `/nomenclature/:code` | открыт |

Фильтр `sectionNumber` включает подразделы: `12.08` вернёт и `12.08.05`.
У вида может быть несколько путей разделов; полный путь восстанавливается
обходом дерева, потому что в базе хранится только самый глубокий раздел.
### Отзывы

| Метод | Путь | Доступ |
| --- | --- | --- |
| POST | `/products/:id/reviews` | авторизованный |
| GET | `/me/reviews` | авторизованный |
| GET | `/admin/reviews` | `admin` |
| PATCH | `/admin/reviews/:id/status` | `admin` |
| GET | `/admin/reviews/:id/history` | `admin` |

### Списки и сравнения

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET POST | `/saved-lists` | авторизованный |
| GET PATCH DELETE | `/saved-lists/:listId` | владелец |
| POST DELETE | `/saved-lists/:listId/products/:productId` | владелец |
| GET POST | `/comparisons` | авторизованный |
| GET PATCH DELETE | `/comparisons/:comparisonId` | владелец |
| POST DELETE | `/comparisons/:comparisonId/products/:productId` | владелец |

### Уведомления

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/me/notifications` | авторизованный |
| PATCH | `/me/notifications/:id/read` | получатель |
| PATCH | `/me/notifications/read-all` | авторизованный |

### Кабинет организации

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/organization/dashboard` | `organization` + членство |
| GET | `/organization/members` | `organization` + членство |
| GET | `/organization/notifications` | `organization` + членство |
| PATCH | `/organization/notifications/:id/read` | `organization` + членство |

### Государственный раздел

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/government/analytics` | `government`, `admin` |
| POST | `/government/analytics/refresh` | `government`, `admin` |
| GET | `/government/problem-products` | `government`, `admin` |
| GET | `/government/sync` | `government`, `admin` |
| GET | `/government/sync/runs/:runId/errors` | `government`, `admin` |
| POST | `/government/sync/run` | `government`, `admin` |
| POST | `/government/sync/nomenclature/run` | `government`, `admin` |
| POST | `/government/sync/registry/run` | `government`, `admin` |

### Служебное

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | `/health` | открыт |
| GET | `/docs`, `/docs.json` | открыт |

Описания запросов в OpenAPI строятся из тех же схем Zod, которыми выполняется
валидация, поэтому документация не может разойтись с поведением сервера.
Схемы успешных ответов отдельными моделями пока не объявлены — форма ответа
описана в общем виде выше.

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

- [x] **1. ADR и ERD, `backend/`, Docker Compose** — 10 ADR, ER-диаграммы и
      доказательство 3НФ в `backend/docs/database.md`, `docker-compose.yml`
      с healthcheck и volume, `.env.example`.
- [x] **2. Prisma schema, SQL-ограничения, миграции и seed** — 53 таблицы,
      17 CHECK-ограничений, 5 views, 2 materialized view, триггеры поискового
      индекса, идемпотентный seed.
- [x] **3. Auth и RBAC** — регистрация, вход, ротация refresh token с
      обнаружением повторного использования, выход, восстановление пароля,
      `GET /auth/me`, guard-ы ролей и проверка членства в организации.
- [x] **4. Catalog и products** — список с фильтрами, сортировкой,
      пагинацией и полнотекстовым поиском по названию, производителю и
      регистрационному номеру; карточка с характеристиками в
      `product_characteristic_values` вместо JSON, документами, ценами и
      аналогами; `GET /catalog/filters`.
- [x] **5. Reviews, saved lists, comparisons, notifications** — создание
      отзыва и переходы по статусам модерации с журналом событий,
      подтверждённый бейдж выводится из организации автора, ограничение
      «не более трёх изделий» в сравнении держится транзакцией, списки
      сохранённых изделий и уведомления с отметкой о прочтении.
- [x] **6. Organization, analytics и загрузки** — кабинет медорганизации,
      аналитика из materialized views с отметкой `refreshedAt`, проблемные
      изделия, журнал загрузок и три источника: демонстрационный реестр,
      настоящая номенклатура и настоящий государственный реестр
      ([ADR 0010](backend/docs/adr/0010-real-registry-integration.md)).
- [x] **7. `HttpApiClient` и подключение frontend** — адаптер через fetch,
      выбор реализации по переменным сборки, страницы без прямых импортов
      mock-адаптера, сессия восстанавливается через `/auth/me`.
- [x] **8. Unit, integration и e2e тесты** — 282 пройденных backend-теста и один пропущенный сетевой,
      53 unit на frontend, 26 браузерных тестов через API и 12 e2e демо.
- [x] **9. CI, README и OpenAPI** — описания запросов построены из схем Zod,
      `backend/docs/openapi.json` экспортируется командой и проверяется в CI
      на полноту и расхождение с кодом, список эндпоинтов приведён выше.
- [x] **10. Полный прогон матрицы** — все проверки выполнены на заново
      созданной базе; результаты в таблице ниже.

### Матрица проверок — 1 ноября 2026

Проверки выполнены на отдельных PostgreSQL 17.6: с demo seed и на чистой
production-схеме без demo seed. Пользовательские базы не очищались.

| Проверка | Результат |
| --- | --- |
| Миграции на пустой БД | 9 миграций, 53 нормализованные таблицы |
| Prisma schema против миграций | No difference detected |
| Ограничения и derived views | 17 CHECK, 5 views, 2 materialized views; проверки seed и повторного seed пройдены |
| Backend | typecheck, lint, build; 282 теста пройдены, 1 сетевой тест номенклатуры пропущен |
| OpenAPI | 43 обязательные операции, 52 операции всего |
| Frontend | typecheck, lint, 53 теста, сборка для GitHub Pages |
| Демо без backend | 12 браузерных тестов desktop/mobile |
| Интерфейс через HTTP | 26 браузерных тестов desktop/mobile |
| Реальный внешний API | TLS-проверка включена; две записи Росздравнадзора загружены через API в чистую БД и доступны в каталоге |
| Production bootstrap | создание администратора и регистрация без demo seed |

Ограниченный импорт двух записей имеет статус partial: он проверяет всю
цепочку, но не выдаётся за полную загрузку реестра. Полный импорт запускает
оператор. Настройка почты и восстановление worker описаны в
[operations.md](backend/docs/operations.md).

Сетевые тесты включаются REGISTRY_NETWORK_TEST=true и
NOMENCLATURE_NETWORK_TEST=true. Для реестра нужен NODE_EXTRA_CA_CERTS.
CI проверяет провайдеры на fixtures, не зависит от доступности ведомства.
Для тестов с очисткой fixtures нужна отдельная БД с безопасным именем и
REGISTRY_TEST_DATABASE_NAME — см. operations.md.

Браузерные тесты используют THROTTLE_DISABLED=true; production запрещает
этот флаг. Настоящие ограничения частоты проверяются backend-тестами.

### Проверки в CI

[Backend CI](.github/workflows/backend-ci.yml) содержит четыре задания:

| Задание | Что проверяет |
| --- | --- |
| Миграции и seed | чистая БД, schema diff, ограничения, повторный seed |
| Типы, линтер и тесты | backend, полнота и актуальность OpenAPI |
| Frontend через HTTP API | интерфейс против настоящего API и PostgreSQL |
| Docker Compose | сборка web/API, миграции, healthcheck, SPA и регистрация без seed |

Workflow запускается на main, feat/**, fix/** и pull request.
GitHub Pages публикуется отдельным workflow только из main, с mock API.

### Эксплуатация

Заполнить .env по .env.example, затем:

```bash
docker compose up --build -d --wait
```

Интерфейс: http://localhost:8080. Администратор создаётся отдельной
командой; demo seed для рабочего запуска не нужен. Подробности —
[operations.md](backend/docs/operations.md).

Публичный backend не развёрнут: GitHub Pages продолжает работать как демо.
Письма восстановления требуют настроенного почтового HTTPS API;
реальная отправка без учётных данных оператора не проверялась.
Схемы успешных ответов OpenAPI описаны общим контрактом, без отдельных DTO.
Docker Desktop локально недоступен; проверка контейнеров выполняется в CI.

### Что проверено ранее по этапам

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
