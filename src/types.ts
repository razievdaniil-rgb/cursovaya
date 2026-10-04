export type UserRole = 'user' | 'organization' | 'government'
export type RegistryStatus = 'active' | 'changed' | 'expiring' | 'expired'

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
  status: 'moderation' | 'published'
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
  severity: 'success' | 'warning' | 'danger'
}

export interface AnalyticsSnapshot {
  domesticShare: number
  domesticDelta: number
  signals: number
  criticalSignals: number
  importSubstitution: { year: string; value: number }[]
  dependencies: { category: string; value: number }[]
}

export interface SyncStatus {
  lastUpdatedAt: string
  records: number
  changes: number
  state: 'current' | 'stale' | 'success' | 'error'
  sources: { name: string; records: number; state: 'success' | 'stale' | 'error' }[]
}

export interface Session {
  role: UserRole
  email: string
  displayName: string
  verified: boolean
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

export interface ApiClient {
  getCatalog(query?: CatalogQuery): Promise<Product[]>
  getProduct(id: string): Promise<Product>
  submitReview(review: Omit<Review, 'id' | 'status' | 'createdAt' | 'verifiedOrganization'>): Promise<Review>
  getOrganizationDashboard(): Promise<{ notifications: Notification[]; saved: Product[] }>
  getAnalytics(period?: string, category?: string): Promise<AnalyticsSnapshot>
  getSyncStatus(state?: SyncStatus['state']): Promise<SyncStatus>
  login(email: string, role: UserRole): Promise<Session>
  register(email: string, role: UserRole, organization?: string): Promise<Session>
  recover(email: string): Promise<{ sent: boolean }>
  logout(): Promise<void>
}
