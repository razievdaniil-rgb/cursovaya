/**
 * Unit-тесты разбора записей государственного реестра (ADR 0010).
 *
 * Сеть не нужна: страница ответа берётся из фикстуры, собранной из настоящих
 * записей реестра и дополненной краевыми случаями, которые в реестре
 * действительно встречаются.
 */

import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoszdravnadzorRegistryProvider } from '../../src/sync/registry/roszdravnadzor-registry.provider';
import type { RegistryEntry } from '../../src/sync/registry/registry.types';

const FIXTURE = resolve(__dirname, '../fixtures/registry-page.json');

/** ConfigService, отдающий только то, что нужно провайдеру. */
function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function localProvider(): RoszdravnadzorRegistryProvider {
  return new RoszdravnadzorRegistryProvider(
    configWith({ REGISTRY_LOCAL_FILE: FIXTURE }),
  );
}

function byNumber(entries: RegistryEntry[], registrationNumber: string) {
  return entries.find((entry) => entry.registrationNumber === registrationNumber);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RoszdravnadzorRegistryProvider.describe', () => {
  it('объявляет источник настоящим, в отличие от демонстрационного реестра', () => {
    const description = localProvider().describe();

    expect(description.code).toBe('roszdravnadzor-registry');
    expect(description.isReal).toBe(true);
    expect(description.baseUrl).toBe('https://elk.roszdravnadzor.gov.ru');
  });

  it('позволяет подменить адрес источника и убирает хвостовой слеш', () => {
    const provider = new RoszdravnadzorRegistryProvider(
      configWith({ REGISTRY_SOURCE_URL: 'https://example.test/gateway/' }),
    );

    expect(provider.describe().baseUrl).toBe('https://example.test/gateway');
  });
});

describe('RoszdravnadzorRegistryProvider.fetchPage', () => {
  it('сохраняет пагинацию источника как есть', async () => {
    const page = await localProvider().fetchPage(0, 500);

    expect(page.totalElements).toBe(7);
    expect(page.totalPages).toBe(1);
    expect(page.page).toBe(0);
    expect(page.last).toBe(true);
  });

  it('отбрасывает запись без регистрационного номера: он естественный ключ', async () => {
    const page = await localProvider().fetchPage(0, 500);

    // В фикстуре семь записей, но у одной noRu пустой.
    expect(page.entries).toHaveLength(6);
    expect(page.entries.map((entry) => entry.externalId)).not.toContain(999002);
    // totalElements остаётся числом источника, а не количеством разобранных.
    expect(page.totalElements).toBe(7);
  });

  it('читает настоящую запись реестра целиком', async () => {
    const page = await localProvider().fetchPage(0, 500);
    const entry = byNumber(page.entries, 'ФС 022а1307/0383-04');

    expect(entry).toMatchObject({
      externalId: 42305,
      statusCode: 'deadline_has_expired',
      statusName: 'Срок действия истек',
      legalSystem: 'RUSSIA',
      registrationDate: '2004-08-04',
      expiresAt: '2013-08-04',
      frnsiId: 'o26333',
    });
    expect(entry?.name).toContain('Оптодан');
    expect(entry?.producer?.name).toBe('ООО НПП "ВЕНД"');
    expect(entry?.producer?.actualAddress).toBe('Саратов');
    expect(entry?.nomenclatureIds).toEqual(['3306965748378768392']);
  });

  it('берёт dateRu, когда dateRegistrationRu не заполнен', async () => {
    const page = await localProvider().fetchPage(0, 500);
    const entry = byNumber(page.entries, 'ФС 99999/0001-26');

    // У этой записи есть только dateRu.
    expect(entry?.registrationDate).toBe('2021-05-05');
    expect(entry?.expiresAt).toBeNull();
  });

  it('оставляет производителя пустым, когда его нет в записи', async () => {
    const page = await localProvider().fetchPage(0, 500);
    const entry = byNumber(page.entries, 'ФС 99999/0001-26');

    // Выдумывать производителя нельзя: в реестре его действительно нет.
    expect(entry?.producer).toBeNull();
  });

  it('переносит даты источника без исправления, даже если срок раньше регистрации', async () => {
    const page = await localProvider().fetchPage(0, 500);
    const entry = byNumber(page.entries, 'ФС 01012002/9999-06');

    // Такие записи в реестре есть; провайдер не «чинит» их молча.
    expect(entry?.registrationDate).toBe('2006-02-07');
    expect(entry?.expiresAt).toBe('2000-02-07');
  });

  it('передаёт неизвестный код статуса дальше, а не подменяет своим', async () => {
    const page = await localProvider().fetchPage(0, 500);
    const entry = byNumber(page.entries, 'ФС 99999/0002-26');

    // Решение, что делать с незнакомым статусом, принимает загрузчик.
    expect(entry?.statusCode).toBe('some_new_status');
  });
});

describe('RoszdravnadzorRegistryProvider.iterate', () => {
  it('останавливается на последней странице источника', async () => {
    const pages = [];
    for await (const page of localProvider().iterate(500)) pages.push(page);

    expect(pages).toHaveLength(1);
  });
});

describe('Ошибки обращения к источнику', () => {
  it('объясняет недоверие к сертификату национального УЦ', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    const failure = new Error('fetch failed', {
      cause: new Error('unable to verify the first certificate'),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(failure)),
    );

    // Иначе в журнале загрузок остаётся бесполезное «fetch failed».
    await expect(provider.fetchPage(0)).rejects.toThrow(/NODE_EXTRA_CA_CERTS/);
    await expect(provider.fetchPage(0)).rejects.toThrow(/Минцифры/);
  });

  it('сообщает код ответа, если источник ответил ошибкой', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)),
    );

    // attempts = 1: повторы проверяются отдельным тестом.
    await expect(provider.fetchPage(7, 200, 1)).rejects.toThrow(/503/);
    await expect(provider.fetchPage(7, 200, 1)).rejects.toThrow(/страница 7/);
  });

  it('не повторяет запрос, если источник ответил 4xx', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 400 } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    // 400 — это ответ по существу, повтор даст то же самое.
    await expect(provider.fetchPage(0, 200, 4)).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('повторяет запрос, когда источник разорвал соединение', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    // Полный обход — 164 запроса подряд, и источник рвёт соединение на
    // середине. Один разрыв не должен обесценивать загруженные записи.
    const page = {
      content: [{ id: 1, noRu: 'ФС 1/1-26', status: { code: 'active' } }],
      totalElements: 1,
      totalPages: 1,
      last: true,
      number: 0,
    };

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('fetch failed', { cause: new Error('other side closed') }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.fetchPage(0, 200, 4);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.entries).toHaveLength(1);
  });

  it('сдаётся после исчерпания попыток и сообщает причину', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    const fetchMock = vi.fn(() =>
      Promise.reject(new Error('fetch failed', { cause: new Error('other side closed') })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider.fetchPage(0, 200, 2)).rejects.toThrow(/other side closed/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('не выдаёт сетевой сбой за проблему с сертификатом', async () => {
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))),
    );

    const error: unknown = await provider
      .fetchPage(0, 200, 1)
      .then(() => null)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/ENOTFOUND/);
    expect((error as Error).message).not.toMatch(/NODE_EXTRA_CA_CERTS/);
  });
});

describe('Registry response contract and traversal', () => {
  const entry = { id: 1, noRu: 'RU 1', status: { code: 'active' } };
  const page = (content: unknown[], number = 0, last = true) => ({
    content, number, last, totalElements: last && number === 0 ? content.length : 2,
    totalPages: last && number === 0 ? 1 : 2,
  });
  function network(...pages: unknown[]) {
    const fetchMock = vi.fn();
    for (const raw of pages) fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => raw,
    });
    vi.stubGlobal('fetch', fetchMock);
    return { provider: new RoszdravnadzorRegistryProvider(configWith({})), fetchMock };
  }
  it.each([{}, null, { content: [] }, { ...page([]), last: false },
    { ...page([entry]), number: 2 }, { ...page([entry]), totalElements: -1 }])(
    'rejects malformed or inconsistent pagination instead of an empty success: %j', async (raw) => {
      const { provider } = network(raw);
      await expect(provider.fetchPage(0, 500, 1)).rejects.toThrow();
    },
  );
  it('counts rejected rows and continues past a fully rejected non-final page', async () => {
    const { provider, fetchMock } = network(
      page([{ ...entry, noRu: '' }], 0, false),
      page([{ ...entry, id: 2 }], 1, true),
    );
    const pages = [];
    for await (const result of provider.iterate()) pages.push(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pages[0]).toMatchObject({ entries: [], rawCount: 1, rejected: [{ index: 0 }] });
    expect(pages[1]?.entries[0]?.externalId).toBe(2);
  });
  it('rejects invalid field types, dates and out-of-range source ids per row', async () => {
    const { provider } = network(page([
      { ...entry, id: 2147483648 }, { ...entry, noRu: 42 },
      { ...entry, dateRegistrationRu: '2026-02-30' }, { ...entry, producer: { name: 12 } },
      entry,
    ]));
    const result = await provider.fetchPage(0);
    expect(result.rawCount).toBe(5);
    expect(result.rejected).toHaveLength(4);
    expect(result.entries).toHaveLength(1);
  });
  it('bounds a stalled response body as well as receipt of headers', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new Error('aborted')));
      }) };
    }));
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));
    const result = expect(provider.fetchPage(0, 500, 1)).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
    expect(signal?.aborted).toBe(true);
  });
  it('retries a failed body read rather than losing the run after headers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('body reset'); } })
      .mockResolvedValueOnce({ ok: true, json: async () => page([entry]) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new RoszdravnadzorRegistryProvider(configWith({}));
    const pending = provider.fetchPage(0, 500, 2);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).entries).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
