/**
 * Интеграционные тесты каталога и карточки изделия.
 *
 * Работают против реальной PostgreSQL с применённым seed: четыре изделия,
 * из которых три отечественных и одно импортное, все в категории
 * «Диагностика». Ожидаемые значения сверяются с src/data/mockData.ts.
 */

import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { ResponseInterceptor } from '../src/common/response.interceptor';

let app: NestFastifyApplication;

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

/** Короткие имена изделий в выдаче — удобнее сравнивать, чем UUID. */
function shortNames(body: any): string[] {
  return body.data.map((item: { shortName: string }) => item.shortName);
}

beforeAll(async () => {
  process.env.THROTTLE_DISABLED = 'true';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('GET /products', () => {
  it('возвращает все seed-изделия с метаданными пагинации', async () => {
    const result = await get('/products');

    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(4);
    expect(result.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 4,
      totalPages: 1,
    });
  });

  it('отдаёт рейтинг и диапазон цен из представлений', async () => {
    const result = await get('/products');
    const mp12 = result.body.data.find(
      (item: { shortName: string }) => item.shortName === 'МП-12',
    );

    // Совпадает с priceMin/priceMax из mockData.ts.
    expect(mp12.price.min).toBe(284000);
    expect(mp12.price.max).toBe(319000);
    // Истёкшее предложение не учитывается: действующих ровно два из трёх.
    expect(mp12.price.activeOfferCount).toBe(2);
    // Рейтинг считается по двум опубликованным отзывам (5 и 4).
    expect(mp12.rating.average).toBe(4.5);
    expect(mp12.rating.reviewCount).toBe(2);
    expect(mp12.rating.organizationReviewCount).toBe(1);
  });

  it('не содержит рейтинг и цены как поля изделия', async () => {
    const result = await get('/products');
    const [item] = result.body.data;

    // Производные величины сгруппированы и приходят из views, а не из products.
    expect(item.rating).toBeTypeOf('object');
    expect(item.price).toBeTypeOf('object');
    expect(item.priceMin).toBeUndefined();
    expect(item.reviewCount).toBeUndefined();
  });

  describe('пагинация', () => {
    it('режет выдачу по limit и считает totalPages', async () => {
      const result = await get('/products?limit=2&page=1');

      expect(result.body.data).toHaveLength(2);
      expect(result.body.meta).toMatchObject({ total: 4, totalPages: 2, page: 1 });
    });

    it('вторая страница не повторяет первую', async () => {
      const first = await get('/products?limit=2&page=1&sort=name-asc');
      const second = await get('/products?limit=2&page=2&sort=name-asc');

      expect(shortNames(first.body)).not.toEqual(shortNames(second.body));
      expect(
        shortNames(first.body).filter((name) => shortNames(second.body).includes(name)),
      ).toHaveLength(0);
    });

    it('страница за пределами выдачи возвращает пустой массив, а не ошибку', async () => {
      const result = await get('/products?page=99');

      expect(result.status).toBe(200);
      expect(result.body.data).toEqual([]);
      expect(result.body.meta.total).toBe(4);
    });

    it('отклоняет недопустимые значения', async () => {
      expect((await get('/products?limit=0')).status).toBe(422);
      expect((await get('/products?page=0')).status).toBe(422);
      expect((await get('/products?limit=1000')).status).toBe(422);
    });
  });

  describe('поиск', () => {
    it('находит по названию', async () => {
      const result = await get('/products?search=монитор');

      expect(result.body.data.length).toBeGreaterThan(0);
      expect(shortNames(result.body)).toContain('МП-12');
    });

    it('находит по названию производителя', async () => {
      const result = await get('/products?search=Биосигнал');

      expect(shortNames(result.body)).toEqual(['Вектор-8']);
    });

    it('находит по полному регистрационному номеру', async () => {
      const result = await get(
        `/products?search=${encodeURIComponent('РЗН 2024/21851')}`,
      );

      expect(shortNames(result.body)).toContain('МП-12');
    });

    it('находит по фрагменту регистрационного номера', async () => {
      const result = await get('/products?search=21851');

      expect(shortNames(result.body)).toEqual(['МП-12']);
    });

    it('не зависит от регистра', async () => {
      const lower = await get('/products?search=биосигнал');
      const upper = await get('/products?search=БИОСИГНАЛ');

      expect(shortNames(lower.body)).toEqual(shortNames(upper.body));
      expect(shortNames(lower.body)).toEqual(['Вектор-8']);
    });

    it('по несуществующему запросу возвращает пустой список', async () => {
      const result = await get('/products?search=кардиостимулятор-которого-нет');

      expect(result.status).toBe(200);
      expect(result.body.data).toEqual([]);
      expect(result.body.meta.total).toBe(0);
    });
  });

  describe('фильтры', () => {
    it('по стране производителя', async () => {
      const japan = await get('/products?countryIso2=JP');
      expect(shortNames(japan.body)).toEqual(['Vismo']);

      const russia = await get('/products?countryIso2=RU');
      expect(russia.body.meta.total).toBe(3);
    });

    it('по происхождению', async () => {
      const imported = await get('/products?originType=imported');
      expect(shortNames(imported.body)).toEqual(['Vismo']);

      const domestic = await get('/products?originType=domestic');
      expect(domestic.body.meta.total).toBe(3);
    });

    it('по статусу регистрации', async () => {
      const changed = await get('/products?status=changed');
      expect(shortNames(changed.body)).toEqual(['МИТАР-01']);

      const active = await get('/products?status=active');
      expect(active.body.meta.total).toBe(3);
    });

    it('по классу риска', async () => {
      const result = await get('/products?riskClass=2a');
      expect(shortNames(result.body)).toEqual(['МИТАР-01']);
    });

    it('по категории', async () => {
      const diagnostics = await get('/products?categorySlug=diagnostics');
      expect(diagnostics.body.meta.total).toBe(4);

      const surgery = await get('/products?categorySlug=surgery');
      expect(surgery.body.meta.total).toBe(0);
    });

    it('по диапазону цены', async () => {
      const cheap = await get('/products?priceMax=300000');
      expect(shortNames(cheap.body).sort()).toEqual(['МИТАР-01', 'МП-12']);

      const expensive = await get('/products?priceMin=600000');
      expect(cheap.body.meta.total).toBe(2);
      expect(expensive.body.data).toEqual([]);
    });

    it('принимает повторяющийся параметр и список через запятую одинаково', async () => {
      const repeated = await get('/products?status=active&status=changed');
      const commaSeparated = await get('/products?status=active,changed');

      expect(repeated.body.meta.total).toBe(4);
      expect(commaSeparated.body.meta.total).toBe(4);
    });

    it('комбинирует фильтры через И', async () => {
      const result = await get('/products?originType=domestic&riskClass=2b');

      expect(shortNames(result.body).sort()).toEqual(['Вектор-8', 'МП-12']);
    });

    it('отклоняет priceMin больше priceMax', async () => {
      const result = await get('/products?priceMin=900000&priceMax=100000');

      expect(result.status).toBe(422);
      expect(result.body.errors.priceMin).toBeDefined();
    });
  });

  describe('сортировка', () => {
    it('price-asc по возрастанию минимальной цены', async () => {
      const result = await get('/products?sort=price-asc');

      expect(shortNames(result.body)).toEqual([
        'МИТАР-01',
        'МП-12',
        'Вектор-8',
        'Vismo',
      ]);
    });

    it('price-desc обратен price-asc', async () => {
      const asc = await get('/products?sort=price-asc');
      const desc = await get('/products?sort=price-desc');

      expect(shortNames(desc.body)).toEqual([...shortNames(asc.body)].reverse());
    });

    it('rating-desc ставит изделия без отзывов в конец', async () => {
      const result = await get('/products?sort=rating-desc');
      const items: { shortName: string; rating: { average: number | null } }[] =
        result.body.data;

      // Проверяется само свойство порядка, а не конкретные позиции изделий:
      // другие наборы тестов могут публиковать отзывы и менять рейтинги.
      const rated = items.filter((item) => item.rating.average !== null);
      const unrated = items.filter((item) => item.rating.average === null);

      // Оценённые идут по убыванию рейтинга.
      const averages = rated.map((item) => item.rating.average as number);
      expect(averages).toEqual([...averages].sort((a, b) => b - a));

      // Все изделия без отзывов стоят после оценённых (NULLS LAST).
      expect(items.slice(0, rated.length)).toEqual(rated);
      expect(items.slice(rated.length)).toEqual(unrated);
    });

    it('name-asc по названию', async () => {
      const result = await get('/products?sort=name-asc');
      const names: string[] = result.body.data.map((item: { name: string }) => item.name);

      // Взаимный порядок латиницы и кириллицы задаёт коллация БД (в ru-RU
      // латиница идёт первой), поэтому сравнивать весь список с результатом
      // localeCompare из JS нельзя — у него другое правило. Проверяем то, что
      // от коллации не зависит: кириллические названия упорядочены между собой.
      const cyrillic = names.filter((name) => /^[А-Яа-яЁё]/.test(name));

      expect(cyrillic.length).toBeGreaterThan(1);
      expect(cyrillic).toEqual(
        [...cyrillic].sort((a, b) => a.localeCompare(b, 'ru')),
      );
    });

    it('отклоняет неизвестный порядок', async () => {
      expect((await get('/products?sort=by-vibes')).status).toBe(422);
    });
  });
});

describe('GET /products/:id', () => {
  let productId: string;

  beforeAll(async () => {
    const list = await get('/products?search=21851');
    productId = list.body.data[0].id;
  });

  it('возвращает карточку с нормализованными характеристиками', async () => {
    const result = await get(`/products/${productId}`);

    expect(result.status).toBe(200);
    expect(result.body.data.registrationNumber).toBe('РЗН 2024/21851');

    const characteristics = result.body.data.characteristics;
    expect(characteristics.length).toBe(6);

    // Каждая характеристика — отдельная запись с типом и единицей измерения,
    // а не ключ в JSON-объекте.
    const ecg = characteristics.find((c: { code: string }) => c.code === 'ecg_channels');
    expect(ecg).toMatchObject({
      name: 'Каналы ЭКГ',
      valueType: 'number',
      value: 12,
      isComparable: true,
    });
    expect(ecg.unit.symbol).toBe('шт.');

    const diagonal = characteristics.find(
      (c: { code: string }) => c.code === 'screen_diagonal',
    );
    expect(diagonal.value).toBe(12.1);
    expect(diagonal.unit.symbol).toBe('″');

    const country = characteristics.find(
      (c: { code: string }) => c.code === 'production_country',
    );
    expect(country).toMatchObject({ valueType: 'text', value: 'Россия', unit: null });
  });

  it('не отдаёт specs как единый объект', async () => {
    const result = await get(`/products/${productId}`);

    expect(result.body.data.specs).toBeUndefined();
    expect(Array.isArray(result.body.data.characteristics)).toBe(true);
  });

  it('содержит изображения, историю статусов и справочники', async () => {
    const result = await get(`/products/${productId}`);
    const product = result.body.data;

    expect(product.images.length).toBeGreaterThan(0);
    expect(product.images[0].storageKey).toContain('products/');
    expect(product.statusHistory.length).toBeGreaterThan(0);
    expect(product.riskClass).toMatchObject({ code: '2b' });
    expect(product.originType).toMatchObject({ code: 'domestic' });
    expect(product.registryStatus).toMatchObject({ code: 'active' });
    expect(product.manufacturer.country).toMatchObject({ iso2: 'RU', name: 'Россия' });
    expect(product.manufacturer.city).toBe('Казань');
  });

  it('отдаёт 404 для неизвестного UUID', async () => {
    const result = await get('/products/00000000-0000-4000-8000-000000000000');

    expect(result.status).toBe(404);
    expect(result.body.type).toContain('not-found');
  });

  it('отдаёт 422 для некорректного идентификатора', async () => {
    const result = await get('/products/mp-12');

    expect(result.status).toBe(422);
  });
});

describe('GET /products/:id/analogues', () => {
  it('возвращает аналоги с типом и степенью схожести', async () => {
    const list = await get('/products?countryIso2=JP');
    const vismoId = list.body.data[0].id;

    const result = await get(`/products/${vismoId}/analogues`);

    expect(result.status).toBe(200);
    expect(result.body.data.length).toBe(2);
    expect(shortNames(result.body)).toEqual(['МП-12', 'Вектор-8']);
    expect(result.body.data[0]).toMatchObject({
      analogueType: 'domestic',
      similarityScore: 0.92,
    });
  });

  it('не включает само изделие', async () => {
    const list = await get('/products?search=21851');
    const id = list.body.data[0].id;

    const result = await get(`/products/${id}/analogues`);
    expect(result.body.data.map((item: { id: string }) => item.id)).not.toContain(id);
  });
});

describe('GET /products/:id/documents', () => {
  it('возвращает документы с типом из справочника', async () => {
    const list = await get('/products?search=21851');
    const id = list.body.data[0].id;

    const result = await get(`/products/${id}/documents`);

    expect(result.status).toBe(200);
    expect(result.body.data.length).toBe(3);

    const certificate = result.body.data.find(
      (document: { type: { code: string } }) =>
        document.type.code === 'registration_certificate',
    );
    expect(certificate).toMatchObject({
      title: 'Регистрационное удостоверение.pdf',
      documentNumber: 'РЗН 2024/21851',
    });
    expect(certificate.storageKey).toContain('documents/');
  });
});

describe('GET /products/:id/reviews', () => {
  it('отдаёт только опубликованные отзывы', async () => {
    const list = await get('/products?search=21851');
    const id = list.body.data[0].id;

    const result = await get(`/products/${id}/reviews`);

    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(2);
    expect(
      result.body.data.every((review: { status: string }) => review.status === 'published'),
    ).toBe(true);
  });

  it('не показывает отзыв на модерации', async () => {
    const list = await get('/products?search=Биосигнал');
    const vectorId = list.body.data[0].id;

    const result = await get(`/products/${vectorId}/reviews`);

    // Единственный отзыв Вектор-8 находится на модерации.
    expect(result.body.data).toEqual([]);
    expect(result.body.meta.total).toBe(0);
  });

  it('вычисляет verifiedOrganization из статуса организации', async () => {
    const list = await get('/products?search=21851');
    const id = list.body.data[0].id;

    const result = await get(`/products/${id}/reviews`);

    const fromOrganization = result.body.data.find(
      (review: { organization: unknown }) => review.organization !== null,
    );
    expect(fromOrganization.organization.verificationStatus).toBe('verified');
    expect(fromOrganization.verifiedOrganization).toBe(true);

    const fromUser = result.body.data.find(
      (review: { organization: unknown }) => review.organization === null,
    );
    expect(fromUser.verifiedOrganization).toBe(false);
  });
});

describe('GET /catalog/filters', () => {
  it('возвращает справочники со счётчиками из таблиц', async () => {
    const result = await get('/catalog/filters');

    expect(result.status).toBe(200);
    const filters = result.body.data;

    expect(filters.totalProducts).toBe(4);

    const russia = filters.countries.find((c: { iso2: string }) => c.iso2 === 'RU');
    expect(russia.productCount).toBe(3);

    const diagnostics = filters.categories.find(
      (c: { slug: string }) => c.slug === 'diagnostics',
    );
    expect(diagnostics.productCount).toBe(4);

    // Пустые категории остаются в списке со счётчиком 0.
    const surgery = filters.categories.find((c: { slug: string }) => c.slug === 'surgery');
    expect(surgery.productCount).toBe(0);

    expect(filters.riskClasses.map((r: { code: string }) => r.code)).toEqual([
      '1',
      '2a',
      '2b',
      '3',
    ]);
    expect(filters.price).toMatchObject({ currency: 'RUB', min: 246000, max: 590000 });
    expect(filters.sortOptions.length).toBeGreaterThan(0);
  });
});
