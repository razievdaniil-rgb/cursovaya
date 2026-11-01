-- System dictionaries required for production, independent of demonstration seed.
-- Existing identities/labels are preserved on upgrades. Deterministic UUIDs match seed.

INSERT INTO "account_statuses" ("id", "code", "name") VALUES
  ('90c8afdf-39aa-5a8c-8e25-d0fe6c2ca735', 'active', 'Активен'),
  ('52792007-bd73-5868-9450-0d982e255fec', 'blocked', 'Заблокирован'),
  ('b471b32f-359a-5095-98f5-26ee44df3815', 'pending', 'Ожидает подтверждения')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "roles" ("id", "code", "name") VALUES
  ('4d69e994-eac1-572b-9983-2adfd7e00087', 'user', 'Пользователь'),
  ('d2d00011-b798-59f0-9e1f-0876424171ce', 'organization', 'Медицинская организация'),
  ('53854726-5632-58d3-b03b-d9de4fcb2b1c', 'government', 'Государственный орган'),
  ('75e96459-0e84-51a8-87b4-82743772047e', 'admin', 'Администратор')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "organization_types" ("id", "code", "name") VALUES
  ('fe01935f-3a34-5a22-a615-82ee560d7262', 'medical', 'Медицинская организация'),
  ('5a9cc29d-d682-5112-abcf-e71eb27fe7b2', 'government', 'Государственный орган'),
  ('06b59fb1-6a4a-5294-8da3-c32abe355913', 'supplier', 'Поставщик'),
  ('a84b01b3-153a-5008-9259-a9b3b07cbe1f', 'manufacturer', 'Производитель')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "organization_verification_statuses" ("id", "code", "name") VALUES
  ('c6abcb42-e4eb-53a3-8556-a747fe8e9101', 'pending', 'На проверке'),
  ('44da9a12-5265-5f3b-83f0-d9eee55fe7bf', 'verified', 'Подтверждена'),
  ('5347e4fe-ddac-5bb5-b89b-584d49ce1dc2', 'rejected', 'Отклонена'),
  ('dac26ad6-b1ed-5c94-99bc-889ad72beda6', 'suspended', 'Приостановлена')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "organization_member_roles" ("id", "code", "name") VALUES
  ('01e6fbbe-74b5-5f0b-bffb-650ca2014ca4', 'member', 'Сотрудник'),
  ('41fd5f64-0cf9-52bc-9ec9-db32ea4fe091', 'manager', 'Менеджер'),
  ('2cc3b1a2-e66a-5ef0-80ba-cb2ed94f744f', 'reviewer', 'Автор отзывов'),
  ('c564bcb6-45d8-588a-8ab2-030f25238fd7', 'analyst', 'Аналитик'),
  ('0cfe4a84-c78f-57de-a183-aaf7b0cd8409', 'administrator', 'Администратор организации')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "risk_classes" ("id", "code", "name", "sort_order") VALUES
  ('8684823a-3ac9-5f83-bdfe-0544c4481fcf', '1', '1', 1),
  ('089f7320-6645-5bdd-ade1-c254e1e1d706', '2a', '2а', 2),
  ('8ea624f7-6913-51fc-b3bc-6c2e0c02987c', '2b', '2б', 3),
  ('0c4cffe8-7f1d-52b9-a6d1-b3555e7b44ce', '3', '3', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO "product_origin_types" ("id", "code", "name") VALUES
  ('2be7d4ad-5571-5219-8f19-ada8ee24782d', 'domestic', 'Россия'),
  ('3c107127-0812-5c8e-bf20-37ab5e721e0e', 'imported', 'Импорт')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "registry_statuses" ("id", "code", "name") VALUES
  ('7eae3dc5-dbb8-5e89-b853-b158e5909192', 'active', 'Действует'),
  ('a41d2916-3ab4-546c-911b-e456d1d866eb', 'changed', 'Изменён'),
  ('aa9e790f-1afa-5908-9d8f-63b0d5d71446', 'expiring', 'Истекает'),
  ('dae9fb1b-f3ac-556e-8073-7f0a3de2e5c6', 'expired', 'Истёк'),
  ('a5952ec4-59c2-58d3-8672-1e06a28f7b47', 'suspended', 'Приостановлен')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "document_types" ("id", "code", "name") VALUES
  ('be803990-9235-5e64-8754-9e493743aacb', 'registration_certificate', 'Регистрационное удостоверение'),
  ('c196d293-973e-5f89-9b89-6f120706ea94', 'instruction', 'Инструкция по применению'),
  ('2d7818a6-428a-59fc-8277-021d0e15f414', 'declaration', 'Декларация соответствия'),
  ('c1327436-5d5c-5fd3-a876-cebca6e48762', 'manual', 'Руководство оператора'),
  ('b86349b7-4e52-5b65-8b6e-cc8b3d1e3f09', 'other', 'Прочий документ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "characteristic_value_types" ("id", "code", "name") VALUES
  ('c1e1a666-0bcd-518e-856a-a2c74e72a1dd', 'text', 'Строка'),
  ('e85818df-f866-55c5-ba8d-788e0ff618b8', 'number', 'Число'),
  ('7189ec1c-1e0f-5eaa-b04e-d5cb8d6c3166', 'boolean', 'Да/нет'),
  ('28c0c9f1-e761-5141-bc33-93472f3b647d', 'date', 'Дата')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "measurement_units" ("id", "code", "name", "symbol") VALUES
  ('cd27651b-0757-5e36-8e4b-21a93e2bba31', 'pcs', 'Штука', 'шт.'),
  ('b370f607-0f6c-5fcd-b0ad-9b9ff3958e95', 'inch', 'Дюйм', '″'),
  ('6a5b8ad7-37c6-57b7-8cb0-e0ed1de8df04', 'hour', 'Час', 'ч'),
  ('a832c06f-1a59-5f97-af56-1dcfff3360b8', 'month', 'Месяц', 'мес.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "analogue_types" ("id", "code", "name") VALUES
  ('4dbfa0ba-7826-5c9b-b92f-6867a61b3e15', 'domestic', 'Отечественный аналог'),
  ('82f90b32-7c6c-57e1-9df4-e1cb62049924', 'imported', 'Импортный аналог'),
  ('c8d48dea-8e42-5287-827d-604b3306d5a5', 'functional', 'Функциональный аналог')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "review_experience_periods" ("id", "code", "name", "sort_order") VALUES
  ('7030166e-a680-54a8-85fd-3b3067f3b7a1', 'under_1_month', 'Менее месяца', 1),
  ('a9f1e896-3d4b-5dea-b5bd-6d65b329f312', '1_to_6_months', '1–6 месяцев', 2),
  ('5c581614-b399-5de7-b344-f7ebb9d2103b', 'over_6_months', 'Более 6 месяцев', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO "review_statuses" ("id", "code", "name") VALUES
  ('99779d58-3e00-56e6-a7de-f02724f812d0', 'moderation', 'На модерации'),
  ('56bf4f61-cd73-5721-afbe-d387375b453b', 'published', 'Опубликован'),
  ('4edee3a5-2817-55fd-bad4-b83305265a7e', 'rejected', 'Отклонён'),
  ('4d66c5e4-a36e-519d-92ab-7243e0a9e413', 'hidden', 'Скрыт')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "notification_types" ("id", "code", "name") VALUES
  ('fcae4d47-528e-5cd0-bb1f-9626eb0703a4', 'registry_status_changed', 'Изменение статуса регистрации'),
  ('ee62d7e1-3bea-516e-96c4-66d662505098', 'price_changed', 'Изменение цены'),
  ('ffec2260-1ce7-5b07-a43c-04466a7ceb7b', 'registration_expiring', 'Истекает регистрация'),
  ('0178f8be-93ef-512e-91d5-18dbf18adb2c', 'review_status_changed', 'Изменение статуса отзыва'),
  ('4669f7e4-04f0-5035-a283-f81da4a22ee5', 'sync_failed', 'Ошибка загрузки данных')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "notification_severities" ("id", "code", "name") VALUES
  ('033a5a6b-b188-5125-bb80-0fcc942ee83a', 'info', 'Информация'),
  ('10d0dbd9-ee46-588d-b0ea-b32656e6c5e3', 'success', 'Успешно'),
  ('50efc17c-0e6b-5e06-ad8d-0bf3e6beac95', 'warning', 'Предупреждение'),
  ('71a7d5d1-5565-5568-bd7d-3c4c4035172f', 'danger', 'Критично')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "sync_run_statuses" ("id", "code", "name") VALUES
  ('3bef6a84-f192-593a-a872-3a3cccd6afdf', 'running', 'Выполняется'),
  ('9730fd74-5d06-5eef-8f8e-24a7b01b06ec', 'success', 'Успешно'),
  ('56d01430-018e-598c-8723-5215867fc8e0', 'partial', 'Частично'),
  ('cde3ad12-194b-58d3-9a2d-6bac5b0a23a2', 'failed', 'Ошибка')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "currencies" ("id", "code", "name", "symbol") VALUES
  ('8aaec63a-1312-5555-89b5-30a5caa6c861', 'RUB', 'Российский рубль', '₽')
ON CONFLICT (code) DO NOTHING;

