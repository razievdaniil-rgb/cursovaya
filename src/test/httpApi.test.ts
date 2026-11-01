import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpApi } from '../api/httpApi'

/**
 * Unit-тесты HTTP-адаптера: проверяется приведение ответов API к типам
 * интерфейса. `fetch` подменяется, backend не нужен.
 *
 * Эти тесты страхуют от расхождения двух реализаций ApiClient: mock и HTTP
 * обязаны отдавать интерфейсу одинаково устроенные объекты.
 */

const API = 'http://api.test/api/v1'

interface StubCall {
  url: string
  init: RequestInit
}

let calls: StubCall[] = []
let responder: (url: string, init: RequestInit) => { status?: number; body?: unknown }

function stubFetch() {
  return vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })

    const result = responder(url, init)
    const status = result.status ?? 200

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (result.body === undefined ? '' : JSON.stringify(result.body)),
      json: async () => result.body,
    } as Response
  })
}

const productSummary = {
  id: 'p1',
  name: 'Монитор пациента МП-12',
  shortName: 'МП-12',
  registrationNumber: 'РЗН 2024/21851',
  verifiedAt: '2026-09-10T09:42:00.000Z',
  manufacturer: { id: 'm1', name: 'АО «Медтехника»', city: 'Казань', country: { name: 'Россия' } },
  category: { name: 'Диагностика' },
  riskClass: { code: '2b' },
  originType: { code: 'domestic' },
  registryStatus: { code: 'active' },
  rating: { average: 4.5, reviewCount: 2, organizationReviewCount: 1 },
  price: { min: 284000, max: 319000 },
  image: 'products/product-monitor-main.jpg',
}

beforeEach(() => {
  calls = []
  responder = () => ({ body: { data: [] } })
  localStorage.clear()
  vi.stubGlobal('fetch', stubFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpApi: каталог', () => {
  it('requests one bounded page and preserves backend totals', async () => {
    responder = () => ({ body: { data: [productSummary], meta: { page: 3, limit: 10, total: 1864, totalPages: 187 } } })
    const result = await createHttpApi(API).getCatalogPage({ page: 3, limit: 10, countries: ['Россия'] })
    expect(result).toMatchObject({ page: 3, limit: 10, total: 1864, totalPages: 187, items: [{ id: 'p1' }] })
    expect(calls).toHaveLength(1)
    const params = new URL(calls[0].url).searchParams
    expect(params.get('page')).toBe('3')
    expect(params.get('limit')).toBe('10')
    expect(params.get('countryIso2')).toBe('RU')
  })

  it('bounds pagination and keeps demo states local', async () => {
    responder = () => ({ body: { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } } })
    const api = createHttpApi(API)
    await api.getCatalogPage({ page: -2, limit: 1000 })
    expect(new URL(calls[0].url).searchParams.get('limit')).toBe('100')
    expect(new URL(calls[0].url).searchParams.get('page')).toBe('1')
    await expect(api.getCatalogPage({ state: 'empty' })).resolves.toMatchObject({ items: [], total: 0 })
    await expect(api.getCatalogPage({ state: 'error' })).rejects.toThrow('Не удалось получить данные каталога')
    expect(calls).toHaveLength(1)
  })

  it.each([
    { category: null, riskClass: null, originType: null, country: null },
    { category: { name: null }, riskClass: { code: null }, originType: { code: null }, country: { name: null } },
  ])('не выдумывает происхождение для неполной записи реестра: %j', async (missing) => {
    responder = () => ({ body: { data: [{
      ...productSummary,
      category: missing.category,
      riskClass: missing.riskClass,
      originType: missing.originType,
      manufacturer: { ...productSummary.manufacturer, country: missing.country },
      registryStatus: { code: 'invalid' },
    }] } })

    const [product] = await createHttpApi(API).getCatalog()
    expect(product.origin).toBe('Не указано')
    expect(product.manufacturer.country).toBe('Не указана')
    expect(product.category).toBe('Без категории')
    expect(product.riskClass).toBe('Не указан')
    expect(product.registryStatus).toBe('invalid')
  })

  it('приводит карточку API к типу Product', async () => {
    responder = () => ({ body: { data: [productSummary] } })

    const [product] = await createHttpApi(API).getCatalog()

    expect(product.id).toBe('p1')
    expect(product.category).toBe('Диагностика')
    // domestic → «Россия» для бейджа происхождения.
    expect(product.origin).toBe('Россия')
    expect(product.manufacturer.country).toBe('Россия')
    // Латинский код класса риска показывается кириллицей.
    expect(product.riskClass).toBe('2б')
    expect(product.priceMin).toBe(284000)
    expect(product.rating).toBe(4.5)
    expect(product.reviewCount).toBe(2)
    // storage_key превращается в путь к файлу рядом со сборкой.
    expect(product.image).toContain('assets/product-monitor-main.jpg')
    expect(product.verifiedAt).toBe('10 сентября 2026')
  })

  it('импортное изделие получает признак «Импорт»', async () => {
    responder = () => ({
      body: { data: [{ ...productSummary, originType: { code: 'imported' } }] },
    })

    const [product] = await createHttpApi(API).getCatalog()
    expect(product.origin).toBe('Импорт')
  })

  it('изделие без действующих предложений приходит с нулевой ценой', async () => {
    responder = () => ({
      body: {
        data: [
          {
            ...productSummary,
            price: { min: null, max: null },
            rating: { average: null, reviewCount: 0, organizationReviewCount: 0 },
          },
        ],
      },
    })

    const [product] = await createHttpApi(API).getCatalog()

    expect(product.priceMin).toBe(0)
    expect(product.priceMax).toBe(0)
    expect(product.rating).toBe(0)
  })

  it('переводит фильтры интерфейса в параметры API', async () => {
    responder = () => ({ body: { data: [] } })

    await createHttpApi(API).getCatalog({
      search: 'монитор',
      countries: ['Россия', 'Япония'],
      statuses: ['active', 'changed'],
      risks: ['2б'],
      price: ['under-300'],
      sort: 'price-asc',
    })

    const url = calls[0].url
    expect(url).toContain('search=')
    // Названия стран становятся кодами ISO.
    expect(url).toContain('countryIso2=RU')
    expect(url).toContain('countryIso2=JP')
    expect(url).toContain('status=active')
    expect(url).toContain('status=changed')
    // Кириллический класс риска — латинским кодом справочника.
    expect(url).toContain('riskClass=2b')
    expect(url).toContain('priceMax=300000')
    expect(url).toContain('sort=price-asc')
  })

  it('объединяет несколько ценовых корзин в один диапазон', async () => {
    await createHttpApi(API).getCatalog({ price: ['under-300', '300-600'] })

    const url = calls[0].url
    expect(url).toContain('priceMin=0')
    expect(url).toContain('priceMax=600000')
  })

  it('не отправляет запрос для демонстрационных состояний', async () => {
    const api = createHttpApi(API)

    await expect(api.getCatalog({ state: 'empty' })).resolves.toEqual([])
    await expect(api.getCatalog({ state: 'error' })).rejects.toThrow(
      'Не удалось получить данные каталога',
    )
    expect(calls).toHaveLength(0)
  })
})

describe('httpApi: карточка изделия', () => {
  it('собирает specs из типизированных характеристик с единицами', async () => {
    responder = (url) => {
      if (url.includes('/documents')) {
        return { body: { data: [{ title: 'Инструкция по применению.pdf' }] } }
      }
      return {
        body: {
          data: {
            ...productSummary,
            images: [{ storageKey: 'products/product-monitor-main.jpg' }],
            characteristics: [
              { code: 'ecg', name: 'Каналы ЭКГ', valueType: 'number', value: 12, unit: { symbol: 'шт.' } },
              { code: 'diag', name: 'Диагональ', valueType: 'number', value: 12.1, unit: { symbol: '″' } },
              { code: 'batt', name: 'Автономность', valueType: 'number', value: 4, unit: { symbol: 'ч' } },
              { code: 'country', name: 'Страна производства', valueType: 'text', value: 'Россия', unit: null },
              { code: 'cert', name: 'Сертифицировано', valueType: 'boolean', value: true, unit: null },
              { code: 'skip', name: 'Пустая', valueType: 'text', value: null, unit: null },
            ],
          },
        },
      }
    }

    const product = await createHttpApi(API).getProduct('p1')

    // Буквенная единица отделяется пробелом, знаковая пишется слитно.
    expect(product.specs['Каналы ЭКГ']).toBe('12 шт.')
    expect(product.specs['Диагональ']).toBe('12,1″')
    expect(product.specs['Автономность']).toBe('4 ч')
    expect(product.specs['Страна производства']).toBe('Россия')
    expect(product.specs['Сертифицировано']).toBe('да')
    // Незаполненная характеристика в specs не попадает.
    expect(product.specs['Пустая']).toBeUndefined()

    expect(product.documents).toEqual(['Инструкция по применению.pdf'])
  })
})

describe('httpApi: отзывы', () => {
  it('приводит отзыв к типу интерфейса', async () => {
    responder = () => ({
      body: {
        data: [
          {
            id: 'r1',
            productId: 'p1',
            title: 'Надёжная работа',
            body: 'Используем восемь месяцев.',
            rating: 5,
            status: 'published',
            createdAt: '2026-09-02T08:00:00.000Z',
            experience: { code: 'over_6_months', name: 'Более 6 месяцев' },
            author: { type: 'organization' },
            verifiedOrganization: true,
          },
        ],
      },
    })

    const [review] = await createHttpApi(API).getProductReviews('p1')

    expect(review.authorType).toBe('organization')
    expect(review.experience).toBe('Более 6 месяцев')
    // Бейдж приходит с сервера вычисленным, клиент его не выводит сам.
    expect(review.verifiedOrganization).toBe(true)
    expect(review.status).toBe('published')
  })

  it('переводит срок использования в код справочника', async () => {
    responder = () => ({
      body: {
        data: {
          id: 'r2',
          productId: 'p1',
          title: 'Заголовок',
          body: 'Текст отзыва',
          rating: 4,
          status: 'moderation',
          createdAt: '2026-10-01T00:00:00.000Z',
          experience: { code: '1_to_6_months', name: '1–6 месяцев' },
          author: { type: 'user' },
          verifiedOrganization: false,
        },
      },
    })

    await createHttpApi(API).submitReview({
      productId: 'p1',
      title: 'Заголовок',
      body: 'Текст отзыва',
      experience: '1–6 месяцев',
      authorType: 'user',
      rating: 4,
    })

    const body = JSON.parse(String(calls[0].init.body))
    expect(body.experience).toBe('1_to_6_months')
    // Статус и бейдж клиент не отправляет.
    expect(body.status).toBeUndefined()
    expect(body.verifiedOrganization).toBeUndefined()
  })
})

describe('httpApi: авторизация', () => {
  const user = {
    email: 'clinic@example.test',
    displayName: 'ГБУЗ',
    roles: ['user', 'organization'],
    organizations: [{ id: 'o1', verified: true }],
  }

  it('выбирает основную роль и не хранит токен в localStorage', async () => {
    responder = () => ({ body: { data: { user, accessToken: 'access-token-value' } } })

    const session = await createHttpApi(API).login({
      email: 'clinic@example.test',
      password: 'VeryLongPassword1',
    })

    expect(session.role).toBe('organization')
    expect(session.roles).toEqual(['user', 'organization'])
    expect(session.verified).toBe(true)

    // В хранилище допустим только служебный признак, но не токен.
    const stored = JSON.stringify(localStorage)
    expect(stored).not.toContain('access-token-value')
  })

  it('государственная роль важнее роли организации', async () => {
    responder = () => ({
      body: {
        data: {
          user: { ...user, roles: ['user', 'organization', 'government'] },
          accessToken: 'token',
        },
      },
    })

    const session = await createHttpApi(API).login({
      email: 'gov@example.test',
      password: 'VeryLongPassword1',
    })

    expect(session.role).toBe('government')
  })

  it('все запросы уходят с credentials: include', async () => {
    responder = () => ({ body: { data: [] } })

    await createHttpApi(API).getCatalog()

    // Без этого refresh-cookie не дошла бы до сервера.
    expect(calls[0].init.credentials).toBe('include')
  })

  it('getSession без признака сессии не обращается к серверу', async () => {
    const session = await createHttpApi(API).getSession()

    expect(session).toBeNull()
    // Заведомо безуспешный /auth/refresh не отправляется.
    expect(calls).toHaveLength(0)
  })

  it('после входа getSession подтверждает сессию через /auth/me', async () => {
    responder = (url) => {
      if (url.endsWith('/auth/login')) {
        return { body: { data: { user, accessToken: 'token' } } }
      }
      if (url.endsWith('/auth/me')) return { body: { data: user } }
      return { body: { data: [] } }
    }

    const api = createHttpApi(API)
    await api.login({ email: 'clinic@example.test', password: 'VeryLongPassword1' })

    calls = []
    const session = await api.getSession()

    expect(session?.email).toBe('clinic@example.test')
    expect(calls.some((call) => call.url.endsWith('/auth/me'))).toBe(true)
  })

  it('восстанавливает сессию по refresh-cookie одним обновлением', async () => {
    responder = (url) => {
      if (url.endsWith('/auth/refresh')) {
        return { body: { data: { accessToken: 'refreshed-token' } } }
      }
      if (url.endsWith('/auth/me')) return { body: { data: user } }
      return { body: { data: [] } }
    }

    localStorage.setItem('medizdeliya-session-hint', '1')
    const session = await createHttpApi(API).getSession()

    expect(session?.email).toBe('clinic@example.test')
    expect(calls.filter((call) => call.url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('истёкший access token обновляется, и запрос повторяется', async () => {
    let reviewsAttempts = 0
    responder = (url) => {
      if (url.endsWith('/auth/login')) {
        return { body: { data: { user, accessToken: 'expired-token' } } }
      }
      if (url.endsWith('/auth/refresh')) {
        return { body: { data: { accessToken: 'refreshed-token' } } }
      }
      if (url.endsWith('/me/reviews')) {
        reviewsAttempts += 1
        // Первая попытка — с истёкшим токеном, вторая — с обновлённым.
        return reviewsAttempts === 1
          ? { status: 401, body: { title: 'Требуется авторизация' } }
          : { body: { data: [] } }
      }
      return { body: { data: [] } }
    }

    const api = createHttpApi(API)
    await api.login({ email: 'clinic@example.test', password: 'VeryLongPassword1' })
    calls = []

    await expect(api.getMyReviews()).resolves.toEqual([])

    expect(reviewsAttempts).toBe(2)
    expect(calls.filter((call) => call.url.endsWith('/auth/refresh'))).toHaveLength(1)
    // Повторный запрос ушёл уже с новым токеном.
    const retry = calls.filter((call) => call.url.endsWith('/me/reviews')).at(-1)
    expect(retry).toBeDefined()
    const headers = retry!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer refreshed-token')
  })

  it('параллельные 401 обновляют токен один раз', async () => {
    responder = (url) => {
      if (url.endsWith('/auth/login')) {
        return { body: { data: { user, accessToken: 'expired-token' } } }
      }
      if (url.endsWith('/auth/refresh')) {
        return { body: { data: { accessToken: 'refreshed-token' } } }
      }
      // Пока токен не обновлён, защищённые эндпоинты отвечают 401.
      const authorization = (
        calls.at(-1)?.init.headers as Record<string, string> | undefined
      )?.Authorization
      if (authorization === 'Bearer expired-token') {
        return { status: 401, body: { title: 'Требуется авторизация' } }
      }
      return { body: { data: [] } }
    }

    const api = createHttpApi(API)
    await api.login({ email: 'clinic@example.test', password: 'VeryLongPassword1' })
    calls = []

    await Promise.all([api.getMyReviews(), api.getNotifications(), api.getSavedProducts()])

    // Несколько одновременных обновлений сервер счёл бы повторным
    // использованием refresh token и отозвал бы всю цепочку сессий.
    expect(calls.filter((call) => call.url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('неуспешное обновление сбрасывает признак сессии', async () => {
    responder = () => ({ status: 401, body: { title: 'Требуется авторизация' } })
    localStorage.setItem('medizdeliya-session-hint', '1')

    const session = await createHttpApi(API).getSession()

    expect(session).toBeNull()
    expect(localStorage.getItem('medizdeliya-session-hint')).toBeNull()
  })
})

describe('httpApi: ошибки', () => {
  it('разбирает Problem Details и сохраняет статус', async () => {
    responder = () => ({
      status: 422,
      body: {
        type: 'https://medizdeliya.local/problems/validation-failed',
        title: 'Некорректные данные запроса',
        status: 422,
        detail: 'Проверьте перечисленные поля.',
        errors: { rating: ['Оценка от 1 до 5'] },
      },
    })

    await expect(
      createHttpApi(API).submitReview({
        productId: 'p1',
        title: 'Заголовок',
        body: 'Текст отзыва достаточной длины',
        experience: 'Более 6 месяцев',
        authorType: 'user',
        rating: 9,
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Проверьте перечисленные поля.',
      problem: { errors: { rating: ['Оценка от 1 до 5'] } },
    })
  })
})

describe('httpApi: журнал загрузок', () => {
  it('передаёт признак демонстрационного источника в интерфейс', async () => {
    responder = () => ({
      body: {
        data: {
          source: { name: 'Демонстрационный источник', isReal: false },
          state: 'current',
          lastUpdatedAt: '2026-10-31T03:04:12.000Z',
          records: 1864,
          changes: 11,
          runs: [{ status: 'success', statusName: 'Успешно', recordsRead: 1864 }],
        },
      },
    })

    const status = await createHttpApi(API).getSyncStatus()

    // Интерфейс обязан показать данные как демонстрационные (ADR 0008).
    expect(status.sourceIsReal).toBe(false)
    expect(status.records).toBe(1864)
    expect(status.sources[0].state).toBe('success')
  })

  it('состояние empty показывается как устаревшее', async () => {
    responder = () => ({
      body: {
        data: {
          source: { name: 'Источник', isReal: false },
          state: 'empty',
          lastUpdatedAt: null,
          records: 0,
          changes: 0,
          runs: [],
        },
      },
    })

    const status = await createHttpApi(API).getSyncStatus()
    expect(status.state).toBe('stale')
  })
})
