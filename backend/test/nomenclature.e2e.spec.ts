/**
 * Интеграционные тесты номенклатурной классификации (ADR 0009).
 *
 * Загрузка идёт из локальной фикстуры: CI не должен зависеть от доступности
 * сайта Росздравнадзора. Обращение к сети проверяется отдельным тестом,
 * который включается переменной NOMENCLATURE_NETWORK_TEST.
 *
 * Таблицы номенклатуры seed не заполняет, поэтому тесты наполняют их сами и
 * очищают за собой.
 */

import fastifyCookie from '@fastify/cookie';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { NomenclatureSyncService } from '../src/sync/nomenclature/nomenclature-sync.service';
import { RoszdravnadzorNomenclatureProvider } from '../src/sync/nomenclature/roszdravnadzor-nomenclature.provider';

const FIXTURE = resolve(__dirname, 'fixtures/nomenclature-sample.xml');

let app: NestFastifyApplication;
let prisma: PrismaService;
let sync: NomenclatureSyncService;
let provider: RoszdravnadzorNomenclatureProvider;
let syncRunIdsBefore: string[] = [];

interface Result {
  status: number;
  body: any;
}

async function get(path: string): Promise<Result> {
  const response = await app.inject({ method: 'GET', url: `/api/v1${path}` });
  return {
    status: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined,
  };
}

beforeAll(async () => {
  process.env.THROTTLE_DISABLED = 'true';
  // Источник подменяется локальным файлом, а не адресом в сети.
  process.env.NOMENCLATURE_LOCAL_FILE = FIXTURE;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(fastifyCookie);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  sync = app.get(NomenclatureSyncService);
  provider = app.get(RoszdravnadzorNomenclatureProvider);

  syncRunIdsBefore = (await prisma.syncRun.findMany({ select: { id: true } })).map(
    (row) => row.id,
  );

  await prisma.nomenclatureTypeSection.deleteMany();
  await prisma.nomenclatureType.deleteMany();
  await prisma.nomenclatureSection.deleteMany();
}, 60_000);

afterAll(async () => {
  if (prisma) {
    await prisma.nomenclatureTypeSection.deleteMany();
    await prisma.nomenclatureType.deleteMany();
    await prisma.nomenclatureSection.deleteMany();
    // Сначала запуски источника (вместе с ними каскадом уходят их ошибки),
    // только потом сам источник: иначе внешний ключ не даст его удалить.
    await prisma.syncRun.deleteMany({
      where: { syncSource: { code: RoszdravnadzorNomenclatureProvider.CODE } },
    });
    await prisma.syncRun.deleteMany({ where: { id: { notIn: syncRunIdsBefore } } });
    await prisma.syncSource.deleteMany({
      where: { code: RoszdravnadzorNomenclatureProvider.CODE },
    });
  }

  delete process.env.NOMENCLATURE_LOCAL_FILE;
  await app?.close();
});

describe('Источник номенклатуры', () => {
  it('объявляет себя настоящим, в отличие от демонстрационного реестра', () => {
    const description = provider.describe();

    // Главное отличие от MockRegistryProvider.
    expect(description.isReal).toBe(true);
    expect(description.code).toBe('roszdravnadzor-nomenclature');
    expect(description.baseUrl).toContain('roszdravnadzor.gov.ru');
  });

  it('по умолчанию берёт выгрузку за первое число текущего месяца', () => {
    // Схема имени выведена из перечня версий на странице набора.
    expect(provider.fileName(new Date('2026-07-17T10:00:00Z'))).toBe(
      'data-20260701-structure-20180615.zip',
    );
  });
});

describe('Загрузка номенклатуры', () => {
  it('записывает виды, разделы и связи', async () => {
    const result = await sync.run(null);

    // Шесть записей фикстуры дают пять видов: один код встречается дважды.
    expect(result.recordsRead).toBe(6);
    expect(result.typesUpserted).toBe(5);
    expect(result.source.isReal).toBe(true);

    expect(await prisma.nomenclatureType.count()).toBe(5);
    expect(await prisma.nomenclatureSection.count()).toBe(8);
  });

  it('строит дерево разделов с родителями', async () => {
    const deep = await prisma.nomenclatureSection.findFirst({
      where: { number: '5.04.02' },
      select: { parent: { select: { number: true, parent: { select: { number: true } } } } },
    });

    expect(deep?.parent?.number).toBe('5.04');
    expect(deep?.parent?.parent?.number).toBe('5');
  });

  it('связывает вид с несколькими разделами', async () => {
    const type = await prisma.nomenclatureType.findUnique({
      where: { code: 100260 },
      select: { sections: { select: { section: { select: { number: true } } } } },
    });

    const numbers = type?.sections.map((link) => link.section.number).sort();
    expect(numbers).toEqual(['12.07', '12.08.05']);
  });

  it('пишет расхождения источника в журнал загрузок', async () => {
    const run = await prisma.syncRun.findFirst({
      where: { syncSource: { code: RoszdravnadzorNomenclatureProvider.CODE } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, errorCount: true, status: { select: { code: true } } },
    });

    // Дефекты источника — это partial, а не отказ: данные приняты.
    expect(run?.status.code).toBe('partial');
    expect(run?.errorCount).toBeGreaterThan(0);

    const errors = await prisma.syncRunError.findMany({
      where: { syncRunId: run!.id },
      select: { errorCode: true },
    });
    const codes = new Set(errors.map((error) => error.errorCode));

    expect(codes).toContain('EMPTY_SECTION_NUMBER');
    expect(codes).toContain('SECTION_NAME_LOOKS_LIKE_NUMBER');
  });

  it('повторная загрузка не создаёт дубликатов', async () => {
    const before = {
      types: await prisma.nomenclatureType.count(),
      sections: await prisma.nomenclatureSection.count(),
      links: await prisma.nomenclatureTypeSection.count(),
    };

    await sync.run(null);

    expect(await prisma.nomenclatureType.count()).toBe(before.types);
    expect(await prisma.nomenclatureSection.count()).toBe(before.sections);
    expect(await prisma.nomenclatureTypeSection.count()).toBe(before.links);
  });
});

describe('GET /nomenclature', () => {
  it('отдаёт виды с пагинацией', async () => {
    const result = await get('/nomenclature');

    expect(result.status).toBe(200);
    expect(result.body.meta.total).toBe(5);
    expect(result.body.data[0].code).toBeTypeOf('number');
  });

  it('ищет по названию', async () => {
    const result = await get('/nomenclature?search=денситометрии');

    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].code).toBe(100260);
  });

  it('ищет по коду', async () => {
    const result = await get('/nomenclature?search=100010');

    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].name).toContain('RA33');
  });

  it('фильтр по разделу включает подразделы', async () => {
    // Раздел 12 должен вернуть виды из 12.07 и 12.08.05.
    const parent = await get('/nomenclature?sectionNumber=12');
    expect(parent.body.meta.total).toBe(1);

    const leaf = await get('/nomenclature?sectionNumber=12.08.05');
    expect(leaf.body.meta.total).toBe(1);

    const unrelated = await get('/nomenclature?sectionNumber=5.04.02');
    expect(unrelated.body.data[0].code).toBe(100010);
  });

  it('отклоняет некорректный номер раздела', async () => {
    expect((await get('/nomenclature?sectionNumber=abc')).status).toBe(422);
  });

  it('открыт без авторизации', async () => {
    // Классификация публична, поэтому эндпоинт не требует входа.
    expect((await get('/nomenclature')).status).toBe(200);
  });
});

describe('GET /nomenclature/:code', () => {
  it('восстанавливает полный путь раздела из дерева', async () => {
    const result = await get('/nomenclature/100010');

    expect(result.status).toBe(200);
    // В базе хранится только самый глубокий раздел; путь выводится обходом.
    expect(result.body.data.sectionPaths).toHaveLength(1);
    expect(result.body.data.sectionPaths[0].map((s: { number: string }) => s.number)).toEqual([
      '5',
      '5.04',
      '5.04.02',
    ]);
  });

  it('отдаёт все пути вида, входящего в несколько разделов', async () => {
    const result = await get('/nomenclature/100260');

    expect(result.body.data.sectionPaths).toHaveLength(2);
  });

  it('отдаёт 404 для неизвестного кода', async () => {
    expect((await get('/nomenclature/999999')).status).toBe(404);
  });

  it('отклоняет нечисловой код', async () => {
    expect((await get('/nomenclature/abc')).status).toBe(422);
  });
});

describe('GET /nomenclature/sections и /summary', () => {
  it('отдаёт дерево разделов', async () => {
    const result = await get('/nomenclature/sections');

    expect(result.status).toBe(200);
    expect(result.body.data.total).toBe(8);

    const root5 = result.body.data.roots.find(
      (node: { number: string }) => node.number === '5',
    );
    expect(root5.children.map((c: { number: string }) => c.number)).toEqual(['5.04']);
    expect(root5.children[0].children[0].number).toBe('5.04.02');
  });

  it('сводка показывает последнюю загрузку', async () => {
    const result = await get('/nomenclature/summary');

    expect(result.body.data.types).toBe(5);
    expect(result.body.data.sections).toBe(8);
    expect(result.body.data.lastRun.status).toBe('partial');
  });
});

describe('Разделение источников в журнале', () => {
  it('журнал показывает демонстрационный и настоящий источники раздельно', async () => {
    // Для доступа нужна роль government.
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'gov@medizdeliya.local',
        password: process.env.SEED_DEV_PASSWORD ?? 'DevOnly-Seed-Password-2026',
      },
    });
    const token = JSON.parse(login.body).data.accessToken;

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/government/sync',
      headers: { authorization: `Bearer ${token}` },
    });

    const sources = JSON.parse(response.body).data.sources as {
      code: string;
      isReal: boolean;
    }[];

    const mock = sources.find((source) => source.code === 'mock-registry');
    const real = sources.find((source) => source.code === 'roszdravnadzor-nomenclature');

    expect(mock?.isReal).toBe(false);
    expect(real?.isReal).toBe(true);
  });
});

describe('Загрузка из сети', () => {
  // Включается переменной: CI не должен падать из-за недоступности сайта.
  const enabled = process.env.NOMENCLATURE_NETWORK_TEST === 'true';

  it.skipIf(!enabled)(
    'скачивает и разбирает настоящую выгрузку Росздравнадзора',
    async () => {
      delete process.env.NOMENCLATURE_LOCAL_FILE;
      try {
        const result = await provider.fetchNomenclature();

        // В выгрузке десятки тысяч видов; точные числа меняются каждый месяц.
        expect(result.recordsRead).toBeGreaterThan(20000);
        expect(result.types.length).toBeGreaterThan(20000);
        expect(result.sections.length).toBeGreaterThan(100);
      } finally {
        process.env.NOMENCLATURE_LOCAL_FILE = FIXTURE;
      }
    },
    120_000,
  );
});
