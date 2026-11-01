# ADR 0005. Argon2id, короткий access token и ротация refresh token в cookie

- Дата: 2026-10-31
- Статус: принято

## Контекст

Сейчас «сессия» frontend — объект в `localStorage`, который можно подделать из
консоли. Нужна настоящая авторизация, при которой токены недоступны JavaScript.

## Решение

1. Пароли — Argon2id, параметры: `memoryCost = 19456 KiB`, `timeCost = 2`,
   `parallelism = 1` (профиль OWASP minimum для Argon2id). Соль встроена в
   формат `$argon2id$`.
2. Access token — JWT, срок жизни 15 минут, передаётся заголовком
   `Authorization: Bearer`. В payload — `sub`, `roles`, `jti`, `sid`.
3. Refresh token — случайные 32 байта; в БД хранится только SHA-256-хеш
   (`refresh_tokens.token_hash`). Клиенту уходит в cookie
   `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, срок 30 дней.
4. Ротация: каждый `POST /auth/refresh` помечает старую запись `revoked_at` и
   проставляет `replaced_by_id` на новую. Повторное предъявление уже
   использованного токена трактуется как кража: вся цепочка токенов
   пользователя отзывается, возвращается 401.
5. `users` не хранит роль. Роли читаются из `user_roles` при логине и
   проверяются guard-ами `user`, `organization`, `government`, `admin`.
6. Токены на frontend в `localStorage` не попадают. Access token живёт в памяти
   React-приложения, восстановление сессии — через `GET /auth/me` по
   refresh-cookie.
7. Rate limit на `/auth/login`, `/auth/register`, `/auth/recovery/*`.

## Последствия

- Плюс: XSS не даёт прямого доступа к долгоживущему токену.
- Плюс: обнаружение повторного использования refresh token.
- Минус: нужен CORS с `credentials: true` и строгий `FRONTEND_ORIGINS`;
  cross-site demo на GitHub Pages через API работать не будет — для Pages
  остаётся mock-адаптер (см. ADR 0007).
