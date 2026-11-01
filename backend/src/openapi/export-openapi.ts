/**
 * Экспорт OpenAPI-описания в файл и проверка полноты.
 *
 * Приложение поднимается без сетевого слушателя, документ строится из тех же
 * контроллеров и схем Zod, что обслуживают запросы, поэтому расхождение
 * между документацией и поведением невозможно.
 *
 * Запускается из собранного кода: npm run openapi:export
 *
 * Через tsx запускать нельзя — esbuild не генерирует emitDecoratorMetadata,
 * без которой NestJS не видит типы зависимостей и падает на внедрении
 * PrismaService в SyncService.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../app.module';

/** Эндпоинты из раздела «HTTP API v1» в CLAUDE.md. */
const REQUIRED_OPERATIONS: [string, string][] = [
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/refresh'],
  ['post', '/api/v1/auth/logout'],
  ['post', '/api/v1/auth/recovery/request'],
  ['post', '/api/v1/auth/recovery/confirm'],
  ['get', '/api/v1/auth/me'],

  ['get', '/api/v1/products'],
  ['get', '/api/v1/products/{id}'],
  ['get', '/api/v1/products/{id}/analogues'],
  ['get', '/api/v1/products/{id}/reviews'],
  ['get', '/api/v1/products/{id}/documents'],
  ['get', '/api/v1/catalog/filters'],

  ['post', '/api/v1/products/{id}/reviews'],
  ['get', '/api/v1/me/reviews'],
  ['patch', '/api/v1/admin/reviews/{id}/status'],

  ['get', '/api/v1/saved-lists'],
  ['post', '/api/v1/saved-lists'],
  ['get', '/api/v1/saved-lists/{listId}'],
  ['patch', '/api/v1/saved-lists/{listId}'],
  ['delete', '/api/v1/saved-lists/{listId}'],
  ['post', '/api/v1/saved-lists/{listId}/products/{productId}'],
  ['delete', '/api/v1/saved-lists/{listId}/products/{productId}'],

  ['get', '/api/v1/comparisons'],
  ['post', '/api/v1/comparisons'],
  ['get', '/api/v1/comparisons/{comparisonId}'],
  ['patch', '/api/v1/comparisons/{comparisonId}'],
  ['delete', '/api/v1/comparisons/{comparisonId}'],
  ['post', '/api/v1/comparisons/{comparisonId}/products/{productId}'],
  ['delete', '/api/v1/comparisons/{comparisonId}/products/{productId}'],

  ['get', '/api/v1/organization/dashboard'],
  ['get', '/api/v1/organization/notifications'],
  ['patch', '/api/v1/organization/notifications/{id}/read'],

  ['get', '/api/v1/government/analytics'],
  ['get', '/api/v1/government/problem-products'],
  ['get', '/api/v1/government/sync'],
  ['post', '/api/v1/government/sync/run'],
  ['post', '/api/v1/government/sync/nomenclature/run'],

  ['get', '/api/v1/nomenclature'],
  ['get', '/api/v1/nomenclature/sections'],
  ['get', '/api/v1/nomenclature/summary'],
  ['get', '/api/v1/nomenclature/{code}'],
];

async function main(): Promise<void> {
  const target = resolve(process.argv[2] ?? 'docs/openapi.json');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api/v1');
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Медицинские изделия России — API')
    .setDescription("HTTP API платформы каталогизации медицинских изделий.\n\n**Формат ответов.** Успешный ответ всегда обёрнут в объект `{ \"data\": ... }`;\nсписки добавляют `meta` с полями `page`, `limit`, `total`, `totalPages`.\nОшибки возвращаются в формате RFC 9457 с типом содержимого\n`application/problem+json` и полями `type`, `title`, `status`, `detail`,\n`instance`, `requestId`; при 422 добавляется `errors` с сообщениями по полям.\n\n**Авторизация.** Access token передаётся заголовком `Authorization: Bearer`\nи живёт 15 минут. Refresh token выдаётся в HttpOnly-cookie и обновляется\nчерез `POST /auth/refresh`; повторное использование уже обменянного токена\nотзывает все сессии пользователя. Роли `government` и `admin` при\nсамостоятельной регистрации не выдаются.\n\n**Данные реестра демонстрационные.** Внешний государственный источник не\nподключён: загрузки выполняет MockRegistryProvider, и `GET /government/sync`\nвозвращает `source.isReal = false`\n(см. backend/docs/adr/0008-registry-provider.md).")
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const paths = document.paths ?? {};

  const missing = REQUIRED_OPERATIONS.filter(([method, path]) => {
    const entry = paths[path] as Record<string, unknown> | undefined;
    return !entry || !entry[method];
  });

  const operationCount = Object.values(paths).reduce(
    (sum, entry) =>
      sum +
      Object.keys(entry as Record<string, unknown>).filter((key) =>
        ['get', 'post', 'patch', 'put', 'delete'].includes(key),
      ).length,
    0,
  );

  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log(`Путей: ${Object.keys(paths).length}, операций: ${operationCount}`);
  console.log(`Документ записан: ${target}`);

  if (missing.length > 0) {
    console.error('\nВ OpenAPI нет обязательных операций из CLAUDE.md:');
    for (const [method, path] of missing) {
      console.error(`  - ${method.toUpperCase()} ${path}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Все ${REQUIRED_OPERATIONS.length} обязательных операций описаны.`);
  }

  await app.close();
}

main().catch((error) => {
  console.error('Не удалось построить OpenAPI:', error);
  process.exitCode = 1;
});
