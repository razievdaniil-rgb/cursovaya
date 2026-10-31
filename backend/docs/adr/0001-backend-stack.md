# ADR 0001. NestJS + Fastify как backend-стек, размещённый в `backend/`

- Дата: 2026-10-31
- Статус: принято

## Контекст

В репозитории уже есть работающий frontend (React + Vite + TypeScript), который
публикуется на GitHub Pages из ветки `main`. Нужно добавить production-ready API,
не ломая текущую публикацию и не переписывая UI.

## Решение

1. Backend живёт в каталоге `backend/` как отдельный npm-пакет со своим
   `package.json`, `tsconfig.json` и `Dockerfile`. Корневой `package.json`
   frontend не трогаем — `npm ci` и `npm run build` в корне продолжают работать,
   а значит workflow `deploy-pages.yml` остаётся валидным.
2. Фреймворк — NestJS с адаптером Fastify (`@nestjs/platform-fastify`).
   NestJS даёт DI, модульную структуру, guards/interceptors и генерацию OpenAPI;
   Fastify даёт более высокую пропускную способность и нативную поддержку
   схем сериализации по сравнению с Express.
3. Монорепо-инструменты (nx, turborepo, npm workspaces) не вводим. Два
   независимых пакета — минимальное изменение, которое не затрагивает lock-файл
   frontend и CI GitHub Pages.

## Последствия

- Плюс: frontend-сборка и Pages-деплой не зависят от backend-зависимостей.
- Плюс: модули NestJS один к одному ложатся на разделы API из `CLAUDE.md`.
- Минус: два `node_modules` и два lock-файла; общие типы приходится
  дублировать в `src/types.ts` (frontend) вместо импорта из backend. Это
  осознанный выбор: `ApiClient` остаётся единственным контрактом (см. ADR 0007).
