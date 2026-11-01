import { API_DESCRIPTION } from './openapi/description';
import 'reflect-metadata';

import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';

import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { ResponseInterceptor } from './common/response.interceptor';

const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    // Request id попадает в каждую запись лога и в тело Problem Details.
    genReqId: () => randomUUID(),
    // Directly exposed API must not trust client-supplied X-Forwarded-For.
    trustProxy: false,
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const origins = config.getOrThrow<string[]>('FRONTEND_ORIGINS');
  const port = config.getOrThrow<number>('PORT');

  await app.register(helmet, {
    // Swagger UI подключает свои стили и скрипты инлайн.
    contentSecurityPolicy: false,
  });
  await app.register(fastifyCookie);

  // Cookie с refresh token требует credentials: true, поэтому список
  // источников должен быть точным — wildcard здесь недопустим.
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();

  const openapi = new DocumentBuilder()
    .setTitle('Медицинские изделия России — API')
    .setDescription(API_DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  SwaggerModule.setup(
    `${API_PREFIX}/docs`,
    app,
    SwaggerModule.createDocument(app, openapi),
    { jsonDocumentUrl: `${API_PREFIX}/docs.json` },
  );

  await app.listen({ port, host: '0.0.0.0' });

  const logger = new Logger('Bootstrap');
  logger.log(`API слушает http://0.0.0.0:${port}/${API_PREFIX}`);
  logger.log(`OpenAPI: http://0.0.0.0:${port}/${API_PREFIX}/docs`);
  logger.log(`CORS разрешён для: ${origins.join(', ')}`);
}

void bootstrap();
