# ADR 0003. Справочники вместо строковых значений и отказ от JSON-характеристик

- Дата: 2026-10-31
- Статус: принято

## Контекст

Демонстрационная модель `src/data/mockData.ts` хранит в одной записи изделия:
страну и город производителя строками, `riskClass` строкой, `specs` как
`Record<string, string>`, `documents` как массив имён файлов, `priceMin`/`priceMax`,
`rating`, `reviewCount` и `registryStatus`. Это нарушает 1НФ (массивы и
key-value-объект в атрибуте) и 3НФ (транзитивные зависимости через производителя
и производные агрегаты).

## Решение

1. Каждое повторяющееся значение выносится в справочную таблицу:
   `account_statuses`, `roles`, `organization_types`,
   `organization_verification_statuses`, `organization_member_roles`,
   `risk_classes`, `product_origin_types`, `registry_statuses`, `document_types`,
   `characteristic_value_types`, `measurement_units`, `currencies`,
   `analogue_types`, `review_statuses`, `review_experience_periods`,
   `notification_types`, `notification_severities`, `sync_run_statuses`.
2. Характеристики описываются парой таблиц: `characteristic_definitions`
   (что это за характеристика, тип значения, единица измерения, участвует ли в
   сравнении) и `product_characteristic_values` (одно значение на изделие и
   определение, в типизированной колонке). JSON-колонок в схеме нет.
3. Документы, изображения, цены и история статусов — отдельные таблицы с
   внешним ключом на `products`, а не массивы в строке изделия.
4. Производные показатели (рейтинг, число отзывов, диапазон цен, доля импорта)
   в базовых таблицах не хранятся. Они вычисляются представлениями
   (см. ADR 0006).
5. Роль пользователя не хранится строкой в `users`: связь many-to-many через
   `user_roles` с составным первичным ключом.
6. Бейдж «подтверждённая организация» у отзыва не хранится как boolean. Он
   вычисляется из `reviews.author_organization_id` и текущего
   `organizations.verification_status_id`, иначе при смене статуса организации
   бейдж стал бы устаревшим и зависел бы от данных клиента.

## Последствия

- Плюс: схема в 3НФ, доказательство в `docs/database.md`.
- Плюс: сравнение изделий работает по `characteristic_definitions.is_comparable`,
  а не по совпадению ключей JSON.
- Минус: выборка карточки каталога требует 6–8 JOIN. Компенсируется
  представлением `product_catalog_view` и индексами по всем внешним ключам,
  участвующим в фильтрации.
