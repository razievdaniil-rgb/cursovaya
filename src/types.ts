export type UserRole = 'user' | 'organization' | 'government' | 'admin'
export type RegistryStatus = 'active' | 'changed' | 'expiring' | 'expired' | 'suspended'

export interface Manufacturer {
  id: string
  name: string
  city: string
  country: string
}

export interface Product {
  id: string
  name: string
  shortName: string
  category: string
  origin: 'Россия' | 'Импорт'
  manufacturer: Manufacturer
  registrationNumber: string
  registryStatus: RegistryStatus
  verifiedAt: string
  riskClass: string
  priceMin: number
  priceMax: number
  rating: number
  reviewCount: number
  organizationReviewCount: number
  image: string
  specs: Record<string, string>
  documents: string[]
}

export interface Review {
  id: string
  productId: string
  title: string
  body: string
  rating: number
  experience: string
  authorType: 'user' | 'organization'
  verifiedOrganization: boolean
  status: 'moderation' | 'published' | 'rejected' | 'hidden'
  createdAt: string
}

export interface Comparison {
  productIds: string[]
  updatedAt: string
}

export interface Notification {
  id: string
  title: string
  productName: string
  date: string
  severity: 'info' | 'success' | 'warning' | 'danger'
  read?: boolean
}

export interface AnalyticsSnapshot {
  domesticShare: number
  domesticDelta: number
  signals: number
  criticalSignals: number
  importSubstitution: { year: string; value: number }[]
  dependencies: { category: string; value: number }[]
  /**
   * Время последнего обновления кэша аналитики. Есть только у HTTP-адаптера:
   * показатели читаются из materialized views и могут отставать от записи.
   */
  refreshedAt?: string | null
}

export interface ProblemProduct {
  id: string
  name: string
  registrationNumber: string
  registryStatus: string
  reasons: {
    registrationExpired: boolean
    registrationExpiring: boolean
    statusBlocking: boolean
    criticalReviews: boolean
    withoutActiveOffers: boolean
  }
  averageRating: number | null
  criticalReviewCount: number
  activeOfferCount: number
}

export interface SyncStatus {
  lastUpdatedAt: string
  records: number
  changes: number
  state: 'current' | 'stale' | 'success' | 'error'
  sources: { name: string; records: number; state: 'success' | 'stale' | 'error' }[]
  /**
   * Подключён ли настоящий внешний реестр. У демонстрационного источника —
   * false; интерфейс обязан показывать данные как демонстрационные.
   */
  sourceIsReal?: boolean
}

export interface Session {
  role: UserRole
  email: string
  displayName: string
  verified: boolean
  /** Все роли пользователя; `role` — основная для навигации. */
  roles?: UserRole[]
  organizationId?: string | null
}

export interface CatalogQuery {
  search?: string
  countries?: string[]
  statuses?: RegistryStatus[]
  risks?: string[]
  price?: string[]
  sort?: 'recommended' | 'price-asc' | 'rating-desc'
  state?: 'default' | 'empty' | 'error'
}

export interface CatalogFilters {
  totalProducts: number
  countries: { id: string; iso2: string; name: string; productCount: number }[]
  categories: { id: string; name: string; slug: string; productCount: number }[]
  riskClasses: { id: string; code: string; name: string; productCount: number }[]
  registryStatuses: { id: string; code: string; name: string; productCount: number }[]
  originTypes: { id: string; code: string; name: string; productCount: number }[]
  manufacturers: { id: string; name: string; country: string; productCount: number }[]
  price: { currency: string; min: number | null; max: number | null }
}

export interface SavedProductList {
  id: string
  name: string
  productCount: number
  productIds: string[]
}

export interface LoginInput {
  email: string
  password: string
  /**
   * Используется только демонстрационным адаптером: там роль выбирается в
   * форме. HTTP-адаптер роль игнорирует — её определяет сервер по user_roles.
   */
  role?: UserRole
}

export interface RegisterInput {
  email: string
  password: string
  role: UserRole
  organization?: string
  inn?: string
}

export type ReviewInput = Pick<
  Review,
  'productId' | 'title' | 'body' | 'experience' | 'authorType' | 'rating'
>

/**
 * Единственный контракт между интерфейсом и источником данных.
 *
 * Реализаций две: `mockApi` (демонстрационные данные, работает на GitHub
 * Pages без backend) и `httpApi` (реальный API). Страницы импортируют только
 * `apiClient` из `src/api/client.ts`, который выбирает реализацию по
 * переменным сборки. DTO из NestJS во frontend не импортируются.
 */
export interface ApiClient {
  /** Какая реализация активна — нужно интерфейсу для демонстрационных состояний. */
  readonly mode: 'mock' | 'http'

  getCatalog(query?: CatalogQuery): Promise<Product[]>
  getProduct(id: string): Promise<Product>
  getProductReviews(id: string): Promise<Review[]>
  getProductAnalogues(id: string): Promise<Product[]>
  getCatalogFilters(): Promise<CatalogFilters>

  submitReview(review: ReviewInput): Promise<Review>
  getMyReviews(): Promise<Review[]>

  getOrganizationDashboard(): Promise<{ notifications: Notification[]; saved: Product[] }>
  getNotifications(): Promise<Notification[]>
  markNotificationRead(id: string): Promise<void>

  getSavedProducts(): Promise<string[]>
  setProductSaved(productId: string, saved: boolean): Promise<string[]>

  getComparisonProducts(): Promise<string[]>
  setProductCompared(productId: string, compared: boolean): Promise<string[]>

  getAnalytics(period?: string, category?: string): Promise<AnalyticsSnapshot>
  getProblemProducts(): Promise<ProblemProduct[]>
  getSyncStatus(state?: SyncStatus['state']): Promise<SyncStatus>
  runSync(): Promise<void>

  login(input: LoginInput): Promise<Session>
  register(input: RegisterInput): Promise<Session>
  recover(email: string): Promise<{ sent: boolean }>
  logout(): Promise<void>
  /** Восстановление сессии при загрузке приложения. */
  getSession(): Promise<Session | null>
}
