import type {
  AnalyticsSnapshot,
  ApiClient,
  CatalogFilters,
  CatalogQuery,
  LoginInput,
  Notification,
  ProblemProduct,
  Product,
  RegisterInput,
  RegistryStatus,
  Review,
  ReviewInput,
  Session,
  SyncStatus,
  UserRole,
} from '../types'

/**
 * HTTP-реализация ApiClient.
 *
 * Токены:
 *  - access token живёт только в памяти модуля, в localStorage не попадает;
 *  - refresh token лежит в HttpOnly-cookie, поэтому JavaScript его не видит;
 *    все запросы идут с `credentials: 'include'`;
 *  - при 401 выполняется одна попытка обновления через /auth/refresh,
 *    после чего исходный запрос повторяется.
 *
 * DTO backend сюда не импортируются: адаптер сам приводит ответы API к типам
 * из `src/types.ts`, чтобы интерфейс не зависел от формы серверных данных.
 */

interface Envelope<T> {
  data: T
  meta?: Record<string, unknown>
}

interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  // Поля объявлены явно: tsconfig включает erasableSyntaxOnly, при котором
  // параметры-свойства конструктора недопустимы.
  readonly status: number
  readonly problem: ProblemDetails | null

  constructor(status: number, problem: ProblemDetails | null, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

/** Access token в памяти: перезагрузка страницы его теряет — это осознанно. */
let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null

/**
 * Признак того, что сессия, возможно, существует.
 *
 * Refresh token лежит в HttpOnly-cookie, и JavaScript не может проверить её
 * наличие. Без подсказки каждая загрузка страницы анонимным посетителем
 * заканчивалась бы заведомо безуспешным запросом к /auth/refresh и ошибкой
 * 401 в консоли. Здесь хранится только булев признак — ни токена, ни данных
 * пользователя, поэтому требование «токены в localStorage не хранить»
 * соблюдается. Признак может устареть (cookie истекла), и это не опасно:
 * сервер всё равно решает, действительна ли сессия.
 */
const SESSION_HINT_KEY = 'medizdeliya-session-hint'

function sessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1'
  } catch {
    // Хранилище недоступно — считаем, что сессия может быть, и спрашиваем сервер.
    return true
  }
}

function setSessionHint(value: boolean): void {
  try {
    if (value) localStorage.setItem(SESSION_HINT_KEY, '1')
    else localStorage.removeItem(SESSION_HINT_KEY)
  } catch {
    // Работа без хранилища допустима: будет лишний запрос к /auth/refresh.
  }
}

// --- Справочники соответствий между интерфейсом и API ------------------------

const COUNTRY_ISO: Record<string, string> = {
  Россия: 'RU',
  Япония: 'JP',
  Китай: 'CN',
  Германия: 'DE',
  США: 'US',
}

/** В интерфейсе классы риска записаны кириллицей, в справочнике — латиницей. */
const RISK_TO_API: Record<string, string> = { '1': '1', '2а': '2a', '2б': '2b', '3': '3' }
const RISK_TO_UI: Record<string, string> = { '1': '1', '2a': '2а', '2b': '2б', '3': '3' }

const PRICE_BUCKETS: Record<string, { min?: number; max?: number }> = {
  'under-300': { max: 300000 },
  '300-600': { min: 300000, max: 600000 },
  'over-600': { min: 600000 },
}

const EXPERIENCE_TO_API: Record<string, string> = {
  'Менее месяца': 'under_1_month',
  '1–6 месяцев': '1_to_6_months',
  'Более 6 месяцев': 'over_6_months',
  'Более 2 лет': 'over_6_months',
}

const EXPERIENCE_TO_UI: Record<string, string> = {
  under_1_month: 'Менее месяца',
  '1_to_6_months': '1–6 месяцев',
  over_6_months: 'Более 6 месяцев',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  // Intl для ru-RU добавляет « г.»; в оформлении интерфейса даты без него.
  return dateFormatter.format(parsed).replace(/\sг\.$/, '')
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return `${dateFormatter.format(parsed)}, ${parsed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/** Число с запятой в качестве разделителя, как в остальном интерфейсе. */
function formatNumber(value: number): string {
  return String(value).replace('.', ',')
}

// --- Ответы API (минимально необходимая форма) ------------------------------

interface ApiProductSummary {
  id: string
  name: string
  shortName: string
  registrationNumber: string
  verifiedAt: string | null
  manufacturer: { id: string; name: string; city: string | null; country: { name: string } }
  category: { name: string }
  riskClass: { code: string }
  originType: { code: string }
  registryStatus: { code: string }
  rating: { average: number | null; reviewCount: number; organizationReviewCount: number }
  price: { min: number | null; max: number | null }
  image: string | null
}

interface ApiCharacteristic {
  code: string
  name: string
  valueType: string
  value: string | number | boolean | null
  unit: { symbol: string | null } | null
}

interface ApiProductDetail extends Omit<ApiProductSummary, 'image'> {
  images: { storageKey: string }[]
  characteristics: ApiCharacteristic[]
}

interface ApiReview {
  id: string
  productId: string
  title: string
  body: string
  rating: number
  status: string
  createdAt: string
  experience: { code: string; name: string }
  author: { type: string }
  verifiedOrganization: boolean
}

export function createHttpApi(baseUrl: string): ApiClient {
  const root = baseUrl.replace(/\/+$/, '')

  async function rawRequest(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${root}${path}`, {
      ...init,
      // Нужно, чтобы refresh-cookie уходила вместе с запросом.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    })
  }

  /**
   * Обновление access token. Параллельные 401 ждут одного запроса к
   * /auth/refresh: иначе несколько одновременных обновлений считались бы
   * повторным использованием refresh token и отозвали бы сессию.
   */
  async function refreshAccessToken(): Promise<boolean> {
    refreshPromise ??= (async () => {
      try {
        const response = await fetch(`${root}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          accessToken = null
          setSessionHint(false)
          return false
        }
        const payload = (await response.json()) as Envelope<{ accessToken: string }>
        accessToken = payload.data.accessToken
        setSessionHint(true)
        return true
      } catch {
        accessToken = null
        return false
      } finally {
        refreshPromise = null
      }
    })()

    return refreshPromise
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    options: { retryOn401?: boolean } = {},
  ): Promise<T> {
    const retryOn401 = options.retryOn401 ?? true
    let response = await rawRequest(path, init)

    if (response.status === 401 && retryOn401) {
      const refreshed = await refreshAccessToken()
      if (refreshed) response = await rawRequest(path, init)
    }

    if (response.status === 204) return undefined as T

    const text = await response.text()
    const payload = text ? JSON.parse(text) : null

    if (!response.ok) {
      const problem = payload as ProblemDetails | null
      throw new ApiError(
        response.status,
        problem,
        problem?.detail ?? problem?.title ?? `Запрос завершился с кодом ${response.status}`,
      )
    }

    return (payload as Envelope<T>).data
  }

  // --- Преобразование ответов в типы интерфейса -----------------------------

  function imageUrl(storageKey: string | null): string {
    if (!storageKey) return ''
    // storage_key хранится как «products/имя-файла.jpg», а файлы лежат в
    // public/assets рядом со сборкой frontend.
    const fileName = storageKey.split('/').pop() ?? storageKey
    return `${import.meta.env.BASE_URL}assets/${fileName}`
  }

  function toOrigin(code: string): Product['origin'] {
    return code === 'domestic' ? 'Россия' : 'Импорт'
  }

  function toProduct(
    summary: ApiProductSummary,
    extras: { specs?: Record<string, string>; documents?: string[] } = {},
  ): Product {
    return {
      id: summary.id,
      name: summary.name,
      shortName: summary.shortName,
      category: summary.category.name,
      origin: toOrigin(summary.originType.code),
      manufacturer: {
        id: summary.manufacturer.id,
        name: summary.manufacturer.name,
        city: summary.manufacturer.city ?? '',
        country: summary.manufacturer.country.name,
      },
      registrationNumber: summary.registrationNumber,
      registryStatus: summary.registryStatus.code as RegistryStatus,
      verifiedAt: formatDate(summary.verifiedAt),
      riskClass: RISK_TO_UI[summary.riskClass.code] ?? summary.riskClass.code,
      // Изделие без действующих предложений показывается с нулевой ценой —
      // интерфейс отображает её как «цена не указана».
      priceMin: summary.price.min ?? 0,
      priceMax: summary.price.max ?? 0,
      rating: summary.rating.average ?? 0,
      reviewCount: summary.rating.reviewCount,
      organizationReviewCount: summary.rating.organizationReviewCount,
      image: imageUrl(summary.image),
      specs: extras.specs ?? {},
      documents: extras.documents ?? [],
    }
  }

  /** Характеристики приходят типизированными; строку собирает клиент. */
  function toSpecs(characteristics: ApiCharacteristic[]): Record<string, string> {
    const specs: Record<string, string> = {}

    for (const characteristic of characteristics) {
      if (characteristic.value === null) continue

      const symbol = characteristic.unit?.symbol ?? ''
      const value =
        typeof characteristic.value === 'number'
          ? formatNumber(characteristic.value)
          : typeof characteristic.value === 'boolean'
            ? characteristic.value
              ? 'да'
              : 'нет'
            : String(characteristic.value)

      // Буквенные единицы («ч», «шт.», «мес.») отделяются пробелом,
      // знаковые («″», «%», «°») пишутся слитно.
      const separator = /\p{L}/u.test(symbol) ? ' ' : ''
      specs[characteristic.name] = symbol ? `${value}${separator}${symbol}` : value
    }

    return specs
  }

  function toReview(review: ApiReview): Review {
    return {
      id: review.id,
      productId: review.productId,
      title: review.title,
      body: review.body,
      rating: review.rating,
      experience: EXPERIENCE_TO_UI[review.experience.code] ?? review.experience.name,
      authorType: review.author.type === 'organization' ? 'organization' : 'user',
      verifiedOrganization: review.verifiedOrganization,
      status: review.status as Review['status'],
      createdAt: review.createdAt,
    }
  }

  function toSession(user: {
    email: string
    displayName: string
    roles: string[]
    organizations: { id: string; verified: boolean }[]
  }): Session {
    const roles = user.roles as UserRole[]
    // Основная роль определяет кабинет: государственный раздел важнее
    // кабинета организации, тот — важнее обычного пользователя.
    const role: UserRole = roles.includes('government')
      ? 'government'
      : roles.includes('organization')
        ? 'organization'
        : roles.includes('admin')
          ? 'admin'
          : 'user'

    return {
      role,
      roles,
      email: user.email,
      displayName: user.displayName,
      verified: user.organizations.some((organization) => organization.verified),
      organizationId: user.organizations[0]?.id ?? null,
    }
  }

  function buildCatalogParams(query: CatalogQuery): URLSearchParams {
    const params = new URLSearchParams()

    if (query.search) params.set('search', query.search)

    for (const country of query.countries ?? []) {
      const iso2 = COUNTRY_ISO[country]
      if (iso2) params.append('countryIso2', iso2)
    }
    for (const status of query.statuses ?? []) params.append('status', status)
    for (const risk of query.risks ?? []) {
      params.append('riskClass', RISK_TO_API[risk] ?? risk)
    }

    // Несколько ценовых корзин объединяются в один диапазон: API принимает
    // границы, а не перечисление интервалов.
    const buckets = (query.price ?? []).map((key) => PRICE_BUCKETS[key]).filter(Boolean)
    if (buckets.length > 0) {
      const mins = buckets.map((bucket) => bucket.min ?? 0)
      const maxes = buckets.map((bucket) => bucket.max)
      params.set('priceMin', String(Math.min(...mins)))
      if (maxes.every((max) => max !== undefined)) {
        params.set('priceMax', String(Math.max(...(maxes as number[]))))
      }
    }

    if (query.sort && query.sort !== 'recommended') params.set('sort', query.sort)
    params.set('limit', '100')

    return params
  }

  return {
    mode: 'http',

    async getCatalog(query: CatalogQuery = {}) {
      // Демонстрационные состояния интерфейса сохраняются и на HTTP-пути:
      // они описывают поведение UI, а не данные источника.
      if (query.state === 'error') throw new Error('Не удалось получить данные каталога')
      if (query.state === 'empty') return []

      const products = await request<ApiProductSummary[]>(
        `/products?${buildCatalogParams(query).toString()}`,
      )
      return products.map((product) => toProduct(product))
    },

    async getProduct(id: string) {
      const [detail, documents] = await Promise.all([
        request<ApiProductDetail>(`/products/${id}`),
        request<{ title: string }[]>(`/products/${id}/documents`),
      ])

      return toProduct(
        { ...detail, image: detail.images[0]?.storageKey ?? null },
        {
          specs: toSpecs(detail.characteristics),
          documents: documents.map((document) => document.title),
        },
      )
    },

    async getProductReviews(id: string) {
      const reviews = await request<ApiReview[]>(`/products/${id}/reviews`)
      return reviews.map(toReview)
    },

    async getProductAnalogues(id: string) {
      const analogues = await request<ApiProductSummary[]>(`/products/${id}/analogues`)
      return analogues.map((product) => toProduct(product))
    },

    async getCatalogFilters() {
      return request<CatalogFilters>('/catalog/filters')
    },

    async submitReview(input: ReviewInput) {
      const review = await request<ApiReview>(`/products/${input.productId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          rating: input.rating,
          title: input.title,
          body: input.body,
          experience: EXPERIENCE_TO_API[input.experience] ?? 'over_6_months',
        }),
      })

      return toReview(review)
    },

    async getMyReviews() {
      const reviews = await request<ApiReview[]>('/me/reviews')
      return reviews.map(toReview)
    },

    async getOrganizationDashboard() {
      const dashboard = await request<{
        savedProducts: {
          id: string
          name: string
          shortName: string
          manufacturer: string
          registryStatus: string
          price: { min: number | null; max: number | null }
          rating: number | null
          image: string | null
        }[]
        notifications: {
          id: string
          title: string
          createdAt: string
          severity: string
          product: { name: string } | null
          read: boolean
        }[]
      }>('/organization/dashboard')

      return {
        notifications: dashboard.notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          productName: notification.product?.name ?? '',
          date: formatDateTime(notification.createdAt),
          severity: notification.severity as Notification['severity'],
          read: notification.read,
        })),
        // Карточка кабинета показывает сокращённые сведения, поэтому
        // недостающие поля заполняются пустыми значениями.
        saved: dashboard.savedProducts.map((product) => ({
          id: product.id,
          name: product.name,
          shortName: product.shortName,
          category: '',
          origin: 'Россия' as const,
          manufacturer: { id: '', name: product.manufacturer, city: '', country: '' },
          registrationNumber: '',
          registryStatus: product.registryStatus as RegistryStatus,
          verifiedAt: '',
          riskClass: '',
          priceMin: product.price.min ?? 0,
          priceMax: product.price.max ?? 0,
          rating: product.rating ?? 0,
          reviewCount: 0,
          organizationReviewCount: 0,
          image: imageUrl(product.image),
          specs: {},
          documents: [],
        })),
      }
    },

    async getNotifications() {
      const notifications = await request<
        {
          id: string
          title: string
          createdAt: string
          severity: string
          product: { name: string } | null
          read: boolean
        }[]
      >('/me/notifications')

      return notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        productName: notification.product?.name ?? '',
        date: formatDateTime(notification.createdAt),
        severity: notification.severity as Notification['severity'],
        read: notification.read,
      }))
    },

    async markNotificationRead(id: string) {
      await request<unknown>(`/me/notifications/${id}/read`, { method: 'PATCH' })
    },

    async getSavedProducts() {
      const lists = await request<{ id: string }[]>('/saved-lists')
      if (lists.length === 0) return []

      const detail = await request<{ items: { product: { id: string } }[] }>(
        `/saved-lists/${lists[0].id}`,
      )
      return detail.items.map((item) => item.product.id)
    },

    async setProductSaved(productId: string, saved: boolean) {
      let lists = await request<{ id: string }[]>('/saved-lists')

      if (lists.length === 0) {
        const created = await request<{ id: string }>('/saved-lists', {
          method: 'POST',
          body: JSON.stringify({ name: 'Сохранённые изделия' }),
        })
        lists = [created]
      }

      const listId = lists[0].id
      const detail = await request<{ items: { product: { id: string } }[] }>(
        `/saved-lists/${listId}/products/${productId}`,
        { method: saved ? 'POST' : 'DELETE' },
      )

      return detail.items.map((item) => item.product.id)
    },

    async getComparisonProducts() {
      const comparisons = await request<{ id: string }[]>('/comparisons')
      if (comparisons.length === 0) return []

      const detail = await request<{ items: { product: { id: string } }[] }>(
        `/comparisons/${comparisons[0].id}`,
      )
      return detail.items.map((item) => item.product.id)
    },

    async setProductCompared(productId: string, compared: boolean) {
      let comparisons = await request<{ id: string }[]>('/comparisons')

      if (comparisons.length === 0) {
        const created = await request<{ id: string }>('/comparisons', {
          method: 'POST',
          body: JSON.stringify({}),
        })
        comparisons = [created]
      }

      const comparisonId = comparisons[0].id
      const detail = await request<{ items: { product: { id: string } }[] }>(
        `/comparisons/${comparisonId}/products/${productId}`,
        { method: compared ? 'POST' : 'DELETE' },
      )

      return detail.items.map((item) => item.product.id)
    },

    async getAnalytics(period?: string, category?: string) {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      if (category) params.set('categoryId', category)

      const snapshot = await request<{
        refreshedAt: string | null
        domesticShare: number
        domesticDelta: number
        signals: number
        criticalSignals: number
        importSubstitution: { year: string; value: number }[]
        dependencies: { category: string; value: number }[]
      }>(`/government/analytics?${params.toString()}`)

      return snapshot satisfies AnalyticsSnapshot
    },

    async getProblemProducts() {
      return request<ProblemProduct[]>('/government/problem-products')
    },

    async getSyncStatus(state?: SyncStatus['state']) {
      if (state === 'error') throw new Error('Источник данных временно недоступен')

      const status = await request<{
        source: { name: string; isReal: boolean }
        state: 'current' | 'stale' | 'error' | 'empty'
        lastUpdatedAt: string | null
        records: number
        changes: number
        runs: { status: string; recordsRead: number; statusName: string }[]
      }>('/government/sync')

      return {
        lastUpdatedAt: formatDateTime(status.lastUpdatedAt),
        records: status.records,
        changes: status.changes,
        // «empty» в интерфейсе не предусмотрено — показывается как устаревшее.
        state: state ?? (status.state === 'empty' ? 'stale' : status.state),
        sources: status.runs.slice(0, 4).map((run) => ({
          name: run.statusName,
          records: run.recordsRead,
          state:
            run.status === 'success'
              ? ('success' as const)
              : run.status === 'failed'
                ? ('error' as const)
                : ('stale' as const),
        })),
        sourceIsReal: status.source.isReal,
      }
    },

    async runSync() {
      await request<unknown>('/government/sync/run', {
        method: 'POST',
        body: JSON.stringify({ scenario: 'success' }),
      })
    },

    async login(input: LoginInput) {
      const result = await request<{
        user: Parameters<typeof toSession>[0]
        accessToken: string
      }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email: input.email, password: input.password }) },
        { retryOn401: false },
      )

      accessToken = result.accessToken
      setSessionHint(true)
      return toSession(result.user)
    },

    async register(input: RegisterInput) {
      const result = await request<{
        user: Parameters<typeof toSession>[0]
        accessToken: string
      }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            displayName: input.organization || input.email,
            // Роли government и admin сервер при регистрации не выдаёт.
            role: input.role === 'organization' ? 'organization' : 'user',
            ...(input.role === 'organization'
              ? { organizationName: input.organization, organizationInn: input.inn }
              : {}),
          }),
        },
        { retryOn401: false },
      )

      accessToken = result.accessToken
      setSessionHint(true)
      return toSession(result.user)
    },

    async recover(email: string) {
      await request<unknown>(
        '/auth/recovery/request',
        { method: 'POST', body: JSON.stringify({ email }) },
        { retryOn401: false },
      )
      return { sent: true }
    },

    async logout() {
      try {
        await request<unknown>('/auth/logout', { method: 'POST' }, { retryOn401: false })
      } finally {
        accessToken = null
        setSessionHint(false)
      }
    },

    async getSession() {
      // Источник истины о сессии — сервер, а не localStorage. Без живого
      // access token сначала пробуем обновиться по refresh-cookie.
      if (!accessToken) {
        if (!sessionHint()) return null
        const refreshed = await refreshAccessToken()
        if (!refreshed) return null
      }

      try {
        const user = await request<Parameters<typeof toSession>[0]>('/auth/me')
        return toSession(user)
      } catch {
        accessToken = null
        setSessionHint(false)
        return null
      }
    },
  }
}
