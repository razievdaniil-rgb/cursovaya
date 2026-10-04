import type { AnalyticsSnapshot, Notification, Product, Review, SyncStatus } from '../types'

const manufacturer = (id: string, name: string, city: string, country = 'Россия') => ({ id, name, city, country })
const publicAsset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

export const products: Product[] = [
  {
    id: 'mp-12', name: 'Монитор пациента МП-12', shortName: 'МП-12', category: 'Диагностика', origin: 'Россия',
    manufacturer: manufacturer('medtech', 'АО «Медтехника»', 'Казань'), registrationNumber: 'РЗН 2024/21851', registryStatus: 'active',
    verifiedAt: '10 сентября 2026', riskClass: '2б', priceMin: 284000, priceMax: 319000, rating: 4.8, reviewCount: 128, organizationReviewCount: 74,
    image: publicAsset('product-monitor-main.jpg'),
    specs: { 'Каналы ЭКГ': '12', 'Диагональ': '12,1″', 'Автономность': '4 часа', 'Гарантия': '24 месяца', 'Сервисных центров': '32', 'Страна производства': 'Россия' },
    documents: ['Регистрационное удостоверение.pdf', 'Инструкция по применению.pdf', 'Декларация соответствия.pdf'],
  },
  {
    id: 'vector-8', name: 'Кардиомонитор «Вектор-8»', shortName: 'Вектор-8', category: 'Диагностика', origin: 'Россия',
    manufacturer: manufacturer('biosignal', 'НПП «Биосигнал»', 'Москва'), registrationNumber: 'РЗН 2023/19704', registryStatus: 'active',
    verifiedAt: '9 сентября 2026', riskClass: '2б', priceMin: 319000, priceMax: 352000, rating: 4.6, reviewCount: 86, organizationReviewCount: 45,
    image: publicAsset('product-monitor-compact.jpg'),
    specs: { 'Каналы ЭКГ': '8', 'Диагональ': '10,4″', 'Автономность': '5 часов', 'Гарантия': '24 месяца', 'Сервисных центров': '24', 'Страна производства': 'Россия' },
    documents: ['Регистрационное удостоверение.pdf', 'Руководство оператора.pdf'],
  },
  {
    id: 'vismo', name: 'Patient Monitor Vismo', shortName: 'Vismo', category: 'Диагностика', origin: 'Импорт',
    manufacturer: manufacturer('nihon', 'Nihon Kohden', 'Токио', 'Япония'), registrationNumber: 'РЗН 2022/16487', registryStatus: 'active',
    verifiedAt: '8 сентября 2026', riskClass: '2б', priceMin: 512000, priceMax: 590000, rating: 4.9, reviewCount: 164, organizationReviewCount: 91,
    image: publicAsset('product-monitor-premium.jpg'),
    specs: { 'Каналы ЭКГ': '12', 'Диагональ': '12,1″', 'Автономность': '6 часов', 'Гарантия': '12 месяцев', 'Сервисных центров': '11', 'Страна производства': 'Япония' },
    documents: ['Регистрационное удостоверение.pdf', 'Инструкция по применению.pdf'],
  },
  {
    id: 'mitar-01', name: 'Монитор МИТАР-01', shortName: 'МИТАР-01', category: 'Диагностика', origin: 'Россия',
    manufacturer: manufacturer('mitar', 'ООО «МИТАР»', 'Санкт-Петербург'), registrationNumber: 'РЗН 2024/22410', registryStatus: 'changed',
    verifiedAt: '7 сентября 2026', riskClass: '2а', priceMin: 246000, priceMax: 278000, rating: 4.5, reviewCount: 62, organizationReviewCount: 29,
    image: publicAsset('product-monitor-portable.jpg'),
    specs: { 'Каналы ЭКГ': '8', 'Диагональ': '9,7″', 'Автономность': '7 часов', 'Гарантия': '18 месяцев', 'Сервисных центров': '18', 'Страна производства': 'Россия' },
    documents: ['Регистрационное удостоверение.pdf', 'Руководство оператора.pdf'],
  },
]

export const initialReviews: Review[] = [
  { id: 'r1', productId: 'mp-12', title: 'Надёжная работа в реанимации', body: 'Используем монитор восемь месяцев. Показания стабильны, интерфейс понятен персоналу.', rating: 5, experience: 'Более 6 месяцев', authorType: 'organization', verifiedOrganization: true, status: 'published', createdAt: '2026-09-02' },
  { id: 'r2', productId: 'mp-12', title: 'Удобная настройка', body: 'Быстрое подключение модулей и понятные тревоги.', rating: 4, experience: '1–6 месяцев', authorType: 'user', verifiedOrganization: false, status: 'published', createdAt: '2026-08-24' },
]

export const notifications: Notification[] = [
  { id: 'n1', title: 'Регистрационное удостоверение обновлено', productName: 'Монитор пациента МП-12', date: 'Сегодня, 09:42', severity: 'success' },
  { id: 'n2', title: 'Изменился диапазон цен', productName: 'Аппарат ИВЛ «Авента-М»', date: 'Вчера, 16:18', severity: 'warning' },
  { id: 'n3', title: 'Регистрация истекает через 30 дней', productName: 'Дефибриллятор ДКИ-Н-11', date: '8 сентября', severity: 'danger' },
]

export const analytics: AnalyticsSnapshot = {
  domesticShare: 62.4, domesticDelta: 4.8, signals: 37, criticalSignals: 9,
  importSubstitution: ['2020','2021','2022','2023','2024','2025','2026'].map((year, i) => ({ year, value: [38,43,46,52,55,58,62.4][i] })),
  dependencies: [{ category: 'МРТ и КТ', value: 82 }, { category: 'Эндоскопия', value: 68 }, { category: 'УЗИ', value: 54 }],
}

export const syncStatus: SyncStatus = {
  lastUpdatedAt: 'Сегодня, 09:42', records: 1864, changes: 14, state: 'current',
  sources: [
    { name: 'Регистрационные записи', records: 1864, state: 'success' },
    { name: 'Справочник производителей', records: 428, state: 'success' },
    { name: 'Предложения поставщиков', records: 2918, state: 'stale' },
    { name: 'Документы', records: 5612, state: 'error' },
  ],
}

export const categories = [
  { name: 'Диагностика', count: 312, icon: 'diagnostics' }, { name: 'Реанимация', count: 186, icon: 'heart' },
  { name: 'Хирургия', count: 274, icon: 'surgery' }, { name: 'Лаборатории', count: 421, icon: 'lab' },
  { name: 'Реабилитация', count: 153, icon: 'rehab' },
]
