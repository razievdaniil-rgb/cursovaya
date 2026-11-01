# Локальный PostgreSQL без Docker

На машине, где Docker Desktop не стартует (например, в WSL не установлен ни
один дистрибутив), базу можно поднять из официальных zip-бинарников EDB — без
прав администратора, без службы и без изменений в системе.

Так была выполнена проверка миграций для этого репозитория.

## Установка

```bash
# 1. Скачать бинарники PostgreSQL 17 (~315 МБ) в отдельную папку
mkdir -p ~/pg17-portable && cd ~/pg17-portable
curl -LO https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip
unzip postgresql-17.6-1-windows-x64-binaries.zip   # распакуется в ./pgsql
```

## Инициализация

Локаль обязательна. При `--locale=C` PostgreSQL не приводит кириллицу к
нижнему регистру, и `to_tsvector('russian', 'НПП Биосигнал')` вернёт
неотстеммленное `'НПП'` — полнотекстовый поиск по русским словам молча
перестанет находить совпадения. Подходят `ru-RU` (Windows), `C.UTF-8` или
`ru_RU.UTF-8` (Linux).

```bash
cd ~/pg17-portable
echo -n "medizdeliya_local" > pw.txt
./pgsql/bin/initdb -D data -U postgres --pwfile=pw.txt --encoding=UTF8 --locale=ru-RU
rm pw.txt

# Порт, чтобы не конфликтовать с возможным системным PostgreSQL
printf "\nport = 55432\nlisten_addresses = '127.0.0.1'\n" >> data/postgresql.conf
```

## Запуск и остановка

```bash
cd ~/pg17-portable
./pgsql/bin/pg_ctl -D data -l server.log start
./pgsql/bin/pg_isready -h 127.0.0.1 -p 55432 -U postgres

./pgsql/bin/pg_ctl -D data -m fast stop
```

На Windows запускайте `pg_ctl` отдельным процессом (`Start-Process`), иначе
сервер завершится вместе с родительской оболочкой.

## Применение схемы

```bash
cd backend
export PGPASSWORD=medizdeliya_local
~/pg17-portable/pgsql/bin/psql -h 127.0.0.1 -p 55432 -U postgres \
  -c "CREATE DATABASE medizdeliya ENCODING 'UTF8';"

export DATABASE_URL="postgresql://postgres:medizdeliya_local@127.0.0.1:55432/medizdeliya?schema=public"
export JWT_ACCESS_SECRET="local_dev_access_secret_at_least_32_chars"
export JWT_REFRESH_SECRET="local_dev_refresh_secret_at_least_32_chars"
export SEED_DEV_PASSWORD="LocalDev-Password-2026"

npm run db:migrate:deploy
npm run db:seed
npx tsx test/verify-schema-objects.ts
npx tsx test/verify-seed-idempotent.ts
npm run test
```

## Удаление

Удалить папку `~/pg17-portable` целиком. В системе ничего не остаётся:
служба не регистрируется, PATH не меняется, реестр не затрагивается.

## Когда Docker заработает

`docker-compose.yml` остаётся основным способом запуска и не зависит от
описанного здесь. Чтобы починить Docker Desktop на Windows, нужен компонент
WSL2:

```bash
wsl --install --no-distribution
```

Команда требует прав администратора и, как правило, перезагрузки.
