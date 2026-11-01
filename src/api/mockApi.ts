import { analytics, initialReviews, notifications, products, syncStatus } from '../data/mockData'
import type {
  ApiClient,
  CatalogFilters,
  CatalogQuery,
  LoginInput,
  Notification,
  ProblemProduct,
  Product,
  RegisterInput,
  Review,
  ReviewInput,
  Session,
  SyncStatus,
  UserRole,
} from '../types'

/**
 * Демонстрационная реализация ApiClient.
 *
 * Не удаляется и после подключения HTTP-адаптера (ADR 0007): на ней работает
 * демо на GitHub Pages, пока API не размещён публично, и на ней же держатся
 * unit-тесты, которым не нужна база.
 *
 * Состояние живёт в памяти модуля: сохранённые позиции, сравнение и
 * отправленные отзывы сбрасываются при перезагрузке страницы.
 */

const wait = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms))
const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').trim()

const DEMO_NAMES: Record<UserRole, string> = {
  user: 'Алексей Смирнов',
  organization: 'ГБУЗ «ГКБ № 52 ДЗМ»',
  government: 'Аналитический центр',
  admin: 'Модератор каталога',
}

/**
 * Демонстрационная сессия переживает перезагрузку страницы.
 *
 * Это не противоречит требованию «токены в localStorage не хранить»: токенов
 * у mock-адаптера нет, здесь лежит только отображаемое имя и роль. В
 * HTTP-режиме хранилище не используется вообще — там сессию подтверждает
 * `/auth/me`.
 */
const DEMO_SESSION_KEY = 'medizdeliya-demo-session'

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function writeStoredSession(value: Session | null): void {
  try {
    if (value) localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(value))
    else localStorage.removeItem(DEMO_SESSION_KEY)
  } catch {
    // Приватный режим или заблокированное хранилище — демо работает и без него.
  }
}

let session: Session | null = null
let submittedReviews: Review[] = []
let savedIds: string[] = ['mp-12', 'vector-8']
let comparedIds: string[] = ['mp-12', 'vismo']

export const mockApi: ApiClient = {
  mode: 'mock',

  async getCatalog(query: CatalogQuery = {}) {
    await wait()
    if (query.state === 'error') throw new Error('Не удалось получить данные каталога')
    if (query.state === 'empty') return []
    let result = [...products]
    if (query.search) {
      const term = normalize(query.search)
      result = result.filter((product) => normalize(`${product.name} ${product.manufacturer.name} ${product.registrationNumber}`).includes(term))
    }
    if (query.countries?.length) result = result.filter((p) => query.countries!.includes(p.manufacturer.country))
    if (query.statuses?.length) result = result.filter((p) => query.statuses!.includes(p.registryStatus))
    if (query.risks?.length) result = result.filter((p) => query.risks!.includes(p.riskClass))
    if (query.price?.includes('under-300')) result = result.filter((p) => p.priceMin < 300000)
    if (query.price?.includes('300-600')) result = result.filter((p) => p.priceMin >= 300000 && p.priceMin <= 600000)
    if (query.price?.includes('over-600')) result = result.filter((p) => p.priceMin > 600000)
    if (query.sort === 'price-asc') result.sort((a, b) => a.priceMin - b.priceMin)
    if (query.sort === 'rating-desc') result.sort((a, b) => b.rating - a.rating)
    return result
  },

  async getCatalogPage(query: CatalogQuery = {}) {
    const page = Number.isSafeInteger(query.page) && query.page! > 0 ? query.page! : 1
    const limit = Number.isSafeInteger(query.limit) && query.limit! > 0 ? Math.min(query.limit!, 100) : 20
    const items = await mockApi.getCatalog(query)
    return { items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)) }
  },

  async getProduct(id) {
    await wait(150)
    const product = products.find((item) => item.id === id)
    if (!product) throw new Error('Изделие не найдено')
    return product
  },

  async getProductReviews(id) {
    await wait(150)
    return [...submittedReviews, ...initialReviews].filter((review) => review.productId === id)
  },

  async getProductAnalogues(id) {
    await wait(150)
    return products.filter((product) => product.id !== id).slice(0, 2)
  },

  async getCatalogFilters(): Promise<CatalogFilters> {
    await wait(120)
    const countries = [...new Set(products.map((product) => product.manufacturer.country))]
    const categories = [...new Set(products.map((product) => product.category))]
    const risks = [...new Set(products.map((product) => product.riskClass))]

    return {
      totalProducts: products.length,
      countries: countries.map((name) => ({
        id: name,
        iso2: name === 'Россия' ? 'RU' : 'JP',
        name,
        productCount: products.filter((p) => p.manufacturer.country === name).length,
      })),
      categories: categories.map((name) => ({
        id: name,
        name,
        slug: name,
        productCount: products.filter((p) => p.category === name).length,
      })),
      riskClasses: risks.map((code) => ({
        id: code,
        code,
        name: code,
        productCount: products.filter((p) => p.riskClass === code).length,
      })),
      registryStatuses: [
        { id: 'active', code: 'active', name: 'Действует', productCount: products.filter((p) => p.registryStatus === 'active').length },
        { id: 'changed', code: 'changed', name: 'Изменён', productCount: products.filter((p) => p.registryStatus === 'changed').length },
      ],
      originTypes: [
        { id: 'domestic', code: 'domestic', name: 'Россия', productCount: products.filter((p) => p.origin === 'Россия').length },
        { id: 'imported', code: 'imported', name: 'Импорт', productCount: products.filter((p) => p.origin === 'Импорт').length },
      ],
      manufacturers: [...new Map(products.map((p) => [p.manufacturer.id, p])).values()].map((p) => ({
        id: p.manufacturer.id,
        name: p.manufacturer.name,
        country: p.manufacturer.country,
        productCount: products.filter((item) => item.manufacturer.id === p.manufacturer.id).length,
      })),
      price: {
        currency: 'RUB',
        min: Math.min(...products.map((p) => p.priceMin)),
        max: Math.max(...products.map((p) => p.priceMax)),
      },
    }
  },

  async submitReview(input: ReviewInput) {
    await wait(360)
    const review: Review = {
      ...input,
      id: crypto.randomUUID(),
      // Бейдж и статус назначает «сервер», а не форма.
      verifiedOrganization: input.authorType === 'organization',
      status: 'moderation',
      createdAt: new Date().toISOString(),
    }
    submittedReviews = [review, ...submittedReviews]
    return review
  },

  async getMyReviews() {
    await wait(150)
    return submittedReviews
  },

  async getOrganizationDashboard() {
    await wait()
    return {
      notifications,
      saved: products.filter((product) => savedIds.includes(product.id)),
      organization: { name: session?.displayName ?? 'Демонстрационная организация', city: 'Москва', verified: session?.verified ?? false, verificationStatusName: session?.verified ? 'Подтверждена' : 'Ожидает подтверждения' },
      counters: { savedProducts: savedIds.length, comparisons: comparedIds.length ? 1 : 0, reviews: submittedReviews.length, reviewsOnModeration: submittedReviews.filter((r) => r.status === 'moderation').length, unreadNotifications: notifications.filter((n) => !n.read).length, members: 1 },
    }
  },

  async getNotifications(): Promise<Notification[]> {
    await wait(150)
    return notifications
  },

  async markNotificationRead() {
    await wait(80)
  },

  async getSavedCollections() { return [{ id: 'demo-saved', name: 'Сохранённые изделия' }] },
  async getComparisonCollections() { return [{ id: 'demo-comparison', name: 'Сравнение изделий' }] },

  async getSavedProducts() {
    await wait(80)
    return [...savedIds]
  },

  async setProductSaved(productId: string, saved: boolean) {
    await wait(80)
    savedIds = saved
      ? [...new Set([...savedIds, productId])]
      : savedIds.filter((id) => id !== productId)
    return [...savedIds]
  },

  async getComparisonProducts() {
    await wait(80)
    return [...comparedIds]
  },

  async setProductCompared(productId: string, compared: boolean) {
    await wait(80)
    if (!compared) {
      comparedIds = comparedIds.filter((id) => id !== productId)
      return [...comparedIds]
    }
    if (comparedIds.includes(productId)) return [...comparedIds]
    if (comparedIds.length >= 3) {
      throw new Error('Для сравнения можно выбрать не более трёх изделий')
    }
    comparedIds = [...comparedIds, productId]
    return [...comparedIds]
  },

  async getAnalytics() {
    await wait()
    return analytics
  },

  async getProblemProducts(): Promise<ProblemProduct[]> {
    await wait(150)
    return products
      .filter((product) => product.registryStatus !== 'active')
      .map((product) => ({
        id: product.id,
        name: product.name,
        registrationNumber: product.registrationNumber,
        registryStatus: product.registryStatus,
        reasons: {
          registrationExpired: product.registryStatus === 'expired',
          registrationExpiring: product.registryStatus === 'expiring',
          statusBlocking: product.registryStatus === 'suspended',
          criticalReviews: false,
          withoutActiveOffers: false,
        },
        averageRating: product.rating,
        criticalReviewCount: 0,
        activeOfferCount: 1,
      }))
  },

  async getSyncStatus(state?: SyncStatus['state']) {
    await wait()
    if (state === 'error') throw new Error('Источник данных временно недоступен')
    // Демонстрационный источник: внешний реестр не подключён.
    return { ...syncStatus, state: state ?? syncStatus.state, sourceIsReal: false }
  },

  async runSync() {
    await wait(400)
  },

  async login(input: LoginInput) {
    await wait()
    const role = input.role ?? 'user'
    session = {
      role,
      email: input.email,
      displayName: DEMO_NAMES[role],
      verified: role !== 'user',
      roles: [role],
    }
    writeStoredSession(session)
    return session
  },

  async register(input: RegisterInput) {
    await wait()
    session = {
      role: input.role,
      email: input.email,
      displayName: input.organization || 'Новый пользователь',
      verified: input.role === 'user',
      roles: [input.role],
    }
    writeStoredSession(session)
    return session
  },

  async recover() {
    await wait()
    return { sent: true }
  },

  async confirmRecovery() { await wait(100) },

  async logout() {
    await wait(80)
    session = null
    writeStoredSession(null)
  },

  async getSession() {
    // Демо восстанавливает сессию из локального хранилища: внешнего
    // источника истины здесь нет.
    session ??= readStoredSession()
    return session
  },
}

/** Используется тестами для сброса состояния между проверками. */
export function resetMockApiState(): void {
  session = null
  writeStoredSession(null)
  submittedReviews = []
  savedIds = ['mp-12', 'vector-8']
  comparedIds = ['mp-12', 'vismo']
}

/** Продукты-заглушки для mock-реализации getProduct из сравнения. */
export function mockProducts(): Product[] {
  return products
}
