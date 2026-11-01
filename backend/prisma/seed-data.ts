/**
 * Исходные данные seed.
 *
 * Четыре изделия, производители и характеристики взяты из
 * `src/data/mockData.ts` frontend-приложения, но разложены по нормализованным
 * отношениям: строковые значения стали справочниками, `specs` — определениями
 * характеристик и типизированными значениями, `documents` — отдельными
 * записями, `priceMin`/`priceMax` — предложениями поставщиков.
 */

import { createHash } from 'node:crypto';

/**
 * Детерминированный UUID (RFC 4122 v5, namespace — фиксированный для seed).
 * Благодаря ему повторный запуск seed обновляет те же строки, а не создаёт
 * дубликаты у сущностей без естественного ключа (сравнения, списки, запуски).
 */
const SEED_NAMESPACE = '6f2f4a1c-9f6d-5a3b-8c1e-2d7b4e9a0c35';

export function seedId(name: string): string {
  const namespaceBytes = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // версия 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // вариант RFC 4122

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export interface RefRow {
  code: string;
  name: string;
  sortOrder?: number;
  symbol?: string | null;
}

export const accountStatuses: RefRow[] = [
  { code: 'active', name: 'Активен' },
  { code: 'blocked', name: 'Заблокирован' },
  { code: 'pending', name: 'Ожидает подтверждения' },
];

export const roles: RefRow[] = [
  { code: 'user', name: 'Пользователь' },
  { code: 'organization', name: 'Медицинская организация' },
  { code: 'government', name: 'Государственный орган' },
  { code: 'admin', name: 'Администратор' },
];

export const organizationTypes: RefRow[] = [
  { code: 'medical', name: 'Медицинская организация' },
  { code: 'government', name: 'Государственный орган' },
  { code: 'supplier', name: 'Поставщик' },
  { code: 'manufacturer', name: 'Производитель' },
];

export const organizationVerificationStatuses: RefRow[] = [
  { code: 'pending', name: 'На проверке' },
  { code: 'verified', name: 'Подтверждена' },
  { code: 'rejected', name: 'Отклонена' },
  { code: 'suspended', name: 'Приостановлена' },
];

export const organizationMemberRoles: RefRow[] = [
  { code: 'member', name: 'Сотрудник' },
  { code: 'manager', name: 'Менеджер' },
  { code: 'reviewer', name: 'Автор отзывов' },
  { code: 'analyst', name: 'Аналитик' },
  { code: 'administrator', name: 'Администратор организации' },
];

export const riskClasses: RefRow[] = [
  { code: '1', name: '1', sortOrder: 1 },
  { code: '2a', name: '2а', sortOrder: 2 },
  { code: '2b', name: '2б', sortOrder: 3 },
  { code: '3', name: '3', sortOrder: 4 },
];

export const productOriginTypes: RefRow[] = [
  { code: 'domestic', name: 'Россия' },
  { code: 'imported', name: 'Импорт' },
];

export const registryStatuses: RefRow[] = [
  { code: 'active', name: 'Действует' },
  { code: 'changed', name: 'Изменён' },
  { code: 'expiring', name: 'Истекает' },
  { code: 'expired', name: 'Истёк' },
  { code: 'suspended', name: 'Приостановлен' },
];

export const documentTypes: RefRow[] = [
  { code: 'registration_certificate', name: 'Регистрационное удостоверение' },
  { code: 'instruction', name: 'Инструкция по применению' },
  { code: 'declaration', name: 'Декларация соответствия' },
  { code: 'manual', name: 'Руководство оператора' },
  { code: 'other', name: 'Прочий документ' },
];

export const characteristicValueTypes: RefRow[] = [
  { code: 'text', name: 'Строка' },
  { code: 'number', name: 'Число' },
  { code: 'boolean', name: 'Да/нет' },
  { code: 'date', name: 'Дата' },
];

export const measurementUnits: RefRow[] = [
  { code: 'pcs', name: 'Штука', symbol: 'шт.' },
  { code: 'inch', name: 'Дюйм', symbol: '″' },
  { code: 'hour', name: 'Час', symbol: 'ч' },
  { code: 'month', name: 'Месяц', symbol: 'мес.' },
];

export const currencies = [
  { code: 'RUB', name: 'Российский рубль', symbol: '₽' },
];

export const analogueTypes: RefRow[] = [
  { code: 'domestic', name: 'Отечественный аналог' },
  { code: 'imported', name: 'Импортный аналог' },
  { code: 'functional', name: 'Функциональный аналог' },
];

export const reviewExperiencePeriods: RefRow[] = [
  { code: 'under_1_month', name: 'Менее месяца', sortOrder: 1 },
  { code: '1_to_6_months', name: '1–6 месяцев', sortOrder: 2 },
  { code: 'over_6_months', name: 'Более 6 месяцев', sortOrder: 3 },
];

export const reviewStatuses: RefRow[] = [
  { code: 'moderation', name: 'На модерации' },
  { code: 'published', name: 'Опубликован' },
  { code: 'rejected', name: 'Отклонён' },
  { code: 'hidden', name: 'Скрыт' },
];

export const notificationTypes: RefRow[] = [
  { code: 'registry_status_changed', name: 'Изменение статуса регистрации' },
  { code: 'price_changed', name: 'Изменение цены' },
  { code: 'registration_expiring', name: 'Истекает регистрация' },
  { code: 'review_status_changed', name: 'Изменение статуса отзыва' },
  { code: 'sync_failed', name: 'Ошибка загрузки данных' },
];

export const notificationSeverities: RefRow[] = [
  { code: 'info', name: 'Информация' },
  { code: 'success', name: 'Успешно' },
  { code: 'warning', name: 'Предупреждение' },
  { code: 'danger', name: 'Критично' },
];

export const syncRunStatuses: RefRow[] = [
  { code: 'running', name: 'Выполняется' },
  { code: 'success', name: 'Успешно' },
  { code: 'partial', name: 'Частично' },
  { code: 'failed', name: 'Ошибка' },
];

// --- География -------------------------------------------------------------

export const countries = [
  { iso2: 'RU', name: 'Россия' },
  { iso2: 'JP', name: 'Япония' },
];

export const regions = [
  { countryIso2: 'RU', code: 'RU-TA', name: 'Республика Татарстан' },
  { countryIso2: 'RU', code: 'RU-MOW', name: 'Москва' },
  { countryIso2: 'RU', code: 'RU-SPE', name: 'Санкт-Петербург' },
  { countryIso2: 'JP', code: 'JP-13', name: 'Токио' },
];

export const cities = [
  { regionCode: 'RU-TA', name: 'Казань' },
  { regionCode: 'RU-MOW', name: 'Москва' },
  { regionCode: 'RU-SPE', name: 'Санкт-Петербург' },
  { regionCode: 'JP-13', name: 'Токио' },
];

// --- Категории -------------------------------------------------------------

export const productCategories = [
  { slug: 'diagnostics', name: 'Диагностика', sortOrder: 1 },
  { slug: 'intensive-care', name: 'Реанимация', sortOrder: 2 },
  { slug: 'surgery', name: 'Хирургия', sortOrder: 3 },
  { slug: 'laboratory', name: 'Лаборатории', sortOrder: 4 },
  { slug: 'rehabilitation', name: 'Реабилитация', sortOrder: 5 },
];

// --- Определения характеристик --------------------------------------------

export const characteristicDefinitions = [
  {
    code: 'ecg_channels',
    name: 'Каналы ЭКГ',
    valueTypeCode: 'number',
    unitCode: 'pcs',
    categorySlug: 'diagnostics',
    isComparable: true,
    sortOrder: 1,
  },
  {
    code: 'screen_diagonal',
    name: 'Диагональ',
    valueTypeCode: 'number',
    unitCode: 'inch',
    categorySlug: 'diagnostics',
    isComparable: true,
    sortOrder: 2,
  },
  {
    code: 'battery_life',
    name: 'Автономность',
    valueTypeCode: 'number',
    unitCode: 'hour',
    categorySlug: 'diagnostics',
    isComparable: true,
    sortOrder: 3,
  },
  {
    code: 'warranty',
    name: 'Гарантия',
    valueTypeCode: 'number',
    unitCode: 'month',
    categorySlug: null,
    isComparable: true,
    sortOrder: 4,
  },
  {
    code: 'service_centers',
    name: 'Сервисных центров',
    valueTypeCode: 'number',
    unitCode: 'pcs',
    categorySlug: null,
    isComparable: true,
    sortOrder: 5,
  },
  {
    code: 'production_country',
    name: 'Страна производства',
    valueTypeCode: 'text',
    unitCode: null,
    categorySlug: null,
    isComparable: true,
    sortOrder: 6,
  },
];

// --- Производители ---------------------------------------------------------

export const manufacturers = [
  { key: 'medtech', name: 'АО «Медтехника»', countryIso2: 'RU', cityName: 'Казань' },
  { key: 'biosignal', name: 'НПП «Биосигнал»', countryIso2: 'RU', cityName: 'Москва' },
  { key: 'nihon', name: 'Nihon Kohden', countryIso2: 'JP', cityName: 'Токио' },
  { key: 'mitar', name: 'ООО «МИТАР»', countryIso2: 'RU', cityName: 'Санкт-Петербург' },
];

// --- Изделия ---------------------------------------------------------------

export interface SeedProduct {
  key: string;
  name: string;
  shortName: string;
  registrationNumber: string;
  manufacturerKey: string;
  categorySlug: string;
  riskClassCode: string;
  originTypeCode: string;
  registryStatusCode: string;
  registrationDate: string;
  registrationExpiresAt: string;
  verifiedAt: string;
  description: string;
  imageFile: string;
  characteristics: Record<string, string | number>;
  documents: { typeCode: string; title: string; file: string; documentNumber?: string }[];
  /** min/max из mockData воспроизводятся действующими предложениями. */
  priceMin: number;
  priceMax: number;
  statusHistory: { statusCode: string; effectiveAt: string; comment: string }[];
}

export const products: SeedProduct[] = [
  {
    key: 'mp-12',
    name: 'Монитор пациента МП-12',
    shortName: 'МП-12',
    registrationNumber: 'РЗН 2024/21851',
    manufacturerKey: 'medtech',
    categorySlug: 'diagnostics',
    riskClassCode: '2b',
    originTypeCode: 'domestic',
    registryStatusCode: 'active',
    registrationDate: '2024-03-14',
    registrationExpiresAt: '2029-03-14',
    verifiedAt: '2026-09-10T09:42:00.000Z',
    description:
      'Прикроватный монитор пациента для отделений реанимации и интенсивной терапии. Модульная конфигурация, 12 каналов ЭКГ, сенсорный экран 12,1 дюйма.',
    imageFile: 'product-monitor-main.jpg',
    characteristics: {
      ecg_channels: 12,
      screen_diagonal: 12.1,
      battery_life: 4,
      warranty: 24,
      service_centers: 32,
      production_country: 'Россия',
    },
    documents: [
      {
        typeCode: 'registration_certificate',
        title: 'Регистрационное удостоверение.pdf',
        file: 'mp-12-registration-certificate.pdf',
        documentNumber: 'РЗН 2024/21851',
      },
      {
        typeCode: 'instruction',
        title: 'Инструкция по применению.pdf',
        file: 'mp-12-instruction.pdf',
      },
      {
        typeCode: 'declaration',
        title: 'Декларация соответствия.pdf',
        file: 'mp-12-declaration.pdf',
      },
    ],
    priceMin: 284000,
    priceMax: 319000,
    statusHistory: [
      {
        statusCode: 'active',
        effectiveAt: '2024-03-14T00:00:00.000Z',
        comment: 'Первичная регистрация',
      },
    ],
  },
  {
    key: 'vector-8',
    name: 'Кардиомонитор «Вектор-8»',
    shortName: 'Вектор-8',
    registrationNumber: 'РЗН 2023/19704',
    manufacturerKey: 'biosignal',
    categorySlug: 'diagnostics',
    riskClassCode: '2b',
    originTypeCode: 'domestic',
    registryStatusCode: 'active',
    registrationDate: '2023-06-02',
    registrationExpiresAt: '2028-06-02',
    verifiedAt: '2026-09-09T09:42:00.000Z',
    description:
      'Компактный кардиомонитор для палат пробуждения и транспортировки. Восемь каналов ЭКГ, автономная работа до пяти часов.',
    imageFile: 'product-monitor-compact.jpg',
    characteristics: {
      ecg_channels: 8,
      screen_diagonal: 10.4,
      battery_life: 5,
      warranty: 24,
      service_centers: 24,
      production_country: 'Россия',
    },
    documents: [
      {
        typeCode: 'registration_certificate',
        title: 'Регистрационное удостоверение.pdf',
        file: 'vector-8-registration-certificate.pdf',
        documentNumber: 'РЗН 2023/19704',
      },
      {
        typeCode: 'manual',
        title: 'Руководство оператора.pdf',
        file: 'vector-8-manual.pdf',
      },
    ],
    priceMin: 319000,
    priceMax: 352000,
    statusHistory: [
      {
        statusCode: 'active',
        effectiveAt: '2023-06-02T00:00:00.000Z',
        comment: 'Первичная регистрация',
      },
    ],
  },
  {
    key: 'vismo',
    name: 'Patient Monitor Vismo',
    shortName: 'Vismo',
    registrationNumber: 'РЗН 2022/16487',
    manufacturerKey: 'nihon',
    categorySlug: 'diagnostics',
    riskClassCode: '2b',
    originTypeCode: 'imported',
    registryStatusCode: 'active',
    registrationDate: '2022-11-21',
    registrationExpiresAt: '2027-11-21',
    verifiedAt: '2026-09-08T09:42:00.000Z',
    description:
      'Импортный прикроватный монитор с расширенным набором модулей и автономностью до шести часов.',
    imageFile: 'product-monitor-premium.jpg',
    characteristics: {
      ecg_channels: 12,
      screen_diagonal: 12.1,
      battery_life: 6,
      warranty: 12,
      service_centers: 11,
      production_country: 'Япония',
    },
    documents: [
      {
        typeCode: 'registration_certificate',
        title: 'Регистрационное удостоверение.pdf',
        file: 'vismo-registration-certificate.pdf',
        documentNumber: 'РЗН 2022/16487',
      },
      {
        typeCode: 'instruction',
        title: 'Инструкция по применению.pdf',
        file: 'vismo-instruction.pdf',
      },
    ],
    priceMin: 512000,
    priceMax: 590000,
    statusHistory: [
      {
        statusCode: 'active',
        effectiveAt: '2022-11-21T00:00:00.000Z',
        comment: 'Первичная регистрация',
      },
    ],
  },
  {
    key: 'mitar-01',
    name: 'Монитор МИТАР-01',
    shortName: 'МИТАР-01',
    registrationNumber: 'РЗН 2024/22410',
    manufacturerKey: 'mitar',
    categorySlug: 'diagnostics',
    riskClassCode: '2a',
    originTypeCode: 'domestic',
    registryStatusCode: 'changed',
    registrationDate: '2024-08-05',
    // Истекает меньше чем через 90 дней — изделие попадает в problem_products_view.
    registrationExpiresAt: '2026-12-20',
    verifiedAt: '2026-09-07T09:42:00.000Z',
    description:
      'Переносной монитор для выездных бригад. Восемь каналов ЭКГ, автономная работа до семи часов.',
    imageFile: 'product-monitor-portable.jpg',
    characteristics: {
      ecg_channels: 8,
      screen_diagonal: 9.7,
      battery_life: 7,
      warranty: 18,
      service_centers: 18,
      production_country: 'Россия',
    },
    documents: [
      {
        typeCode: 'registration_certificate',
        title: 'Регистрационное удостоверение.pdf',
        file: 'mitar-01-registration-certificate.pdf',
        documentNumber: 'РЗН 2024/22410',
      },
      {
        typeCode: 'manual',
        title: 'Руководство оператора.pdf',
        file: 'mitar-01-manual.pdf',
      },
    ],
    priceMin: 246000,
    priceMax: 278000,
    statusHistory: [
      {
        statusCode: 'active',
        effectiveAt: '2024-08-05T00:00:00.000Z',
        comment: 'Первичная регистрация',
      },
      {
        statusCode: 'changed',
        effectiveAt: '2026-09-07T09:42:00.000Z',
        comment: 'Внесены изменения в регистрационное досье',
      },
    ],
  },
];

export const productAnalogues = [
  { productKey: 'vismo', analogueKey: 'mp-12', typeCode: 'domestic', score: 0.92 },
  { productKey: 'vismo', analogueKey: 'vector-8', typeCode: 'domestic', score: 0.87 },
  { productKey: 'mp-12', analogueKey: 'vector-8', typeCode: 'functional', score: 0.81 },
  { productKey: 'mp-12', analogueKey: 'vismo', typeCode: 'imported', score: 0.92 },
  { productKey: 'vector-8', analogueKey: 'mitar-01', typeCode: 'domestic', score: 0.74 },
];
