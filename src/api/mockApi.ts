import { analytics, notifications, products, syncStatus } from '../data/mockData'
import type { ApiClient, CatalogQuery, Session, SyncStatus, UserRole } from '../types'

const wait = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms))
const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').trim()

export const mockApi: ApiClient = {
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
  async getProduct(id) { await wait(150); const product = products.find((item) => item.id === id); if (!product) throw new Error('Изделие не найдено'); return product },
  async submitReview(input) { await wait(360); return { ...input, id: crypto.randomUUID(), verifiedOrganization: input.authorType === 'organization', status: 'moderation', createdAt: new Date().toISOString() } },
  async getOrganizationDashboard() { await wait(); return { notifications, saved: products.slice(0, 3) } },
  async getAnalytics() { await wait(); return analytics },
  async getSyncStatus(state?: SyncStatus['state']) { await wait(); if (state === 'error') throw new Error('Источник данных временно недоступен'); return { ...syncStatus, state: state ?? syncStatus.state } },
  async login(email: string, role: UserRole) { await wait(); const names = { user: 'Алексей Смирнов', organization: 'ГБУЗ «ГКБ № 52 ДЗМ»', government: 'Аналитический центр' }; return { role, email, displayName: names[role], verified: role !== 'user' } satisfies Session },
  async register(email: string, role: UserRole, organization?: string) { await wait(); return { role, email, displayName: organization || 'Новый пользователь', verified: role === 'user' } },
  async recover() { await wait(); return { sent: true } },
  async logout() { await wait(80) },
}
