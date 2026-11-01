/**
 * Идемпотентный seed.
 *
 * Повторный запуск не создаёт дубликатов: справочники пишутся upsert-ом по
 * естественному ключу `code`, бизнес-сущности — по естественному ключу
 * (`registration_number`, `email`, `slug`) либо по детерминированному UUID из
 * `seedId()`. Поэтому `npm run db:seed` можно выполнять сколько угодно раз.
 *
 * Запуск:  npm run db:seed
 * Пароль демонстрационных учётных записей берётся из SEED_DEV_PASSWORD.
 */

import { hash as argon2Hash } from '@node-rs/argon2';
import { PrismaClient, Prisma } from '@prisma/client';

import {
  accountStatuses,
  analogueTypes,
  characteristicDefinitions,
  characteristicValueTypes,
  cities,
  countries,
  currencies,
  documentTypes,
  manufacturers,
  measurementUnits,
  notificationSeverities,
  notificationTypes,
  organizationMemberRoles,
  organizationTypes,
  organizationVerificationStatuses,
  productAnalogues,
  productCategories,
  productOriginTypes,
  products,
  regions,
  registryStatuses,
  reviewExperiencePeriods,
  reviewStatuses,
  riskClasses,
  roles,
  seedId,
  syncRunStatuses,
  type RefRow,
} from './seed-data';

const prisma = new PrismaClient();

const DEV_ONLY_FALLBACK_PASSWORD = 'DevOnly-Seed-Password-2026';

/** Параметры Argon2id — те же, что в AuthService (ADR 0005). */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function resolveSeedPassword(): string {
  const fromEnv = process.env.SEED_DEV_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  console.warn(
    '[seed] SEED_DEV_PASSWORD не задан — используется dev-only пароль ' +
      `"${DEV_ONLY_FALLBACK_PASSWORD}". Не применяйте его вне локальной разработки.`,
  );
  return DEV_ONLY_FALLBACK_PASSWORD;
}

/** Upsert справочной таблицы по полю code. */
async function seedReference(
  table: string,
  rows: RefRow[],
  options: { withSortOrder?: boolean; withSymbol?: boolean } = {},
): Promise<void> {
  for (const row of rows) {
    const columns = ['id', 'code', 'name'];
    const values: unknown[] = [seedId(`${table}:${row.code}`), row.code, row.name];

    if (options.withSortOrder) {
      columns.push('sort_order');
      values.push(row.sortOrder ?? 0);
    }
    if (options.withSymbol) {
      columns.push('symbol');
      values.push(row.symbol ?? null);
    }

    // `id` приходит строкой, поэтому требует явного приведения к uuid:
    // без него PostgreSQL отказывается сопоставлять text и uuid.
    const placeholders = values
      .map((_, index) => (index === 0 ? '$1::uuid' : `$${index + 1}`))
      .join(', ');
    const updates = columns
      .filter((column) => column !== 'id' && column !== 'code')
      .map((column) => `"${column}" = EXCLUDED."${column}"`)
      .join(', ');

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${placeholders})
       ON CONFLICT ("code") DO UPDATE SET ${updates}`,
      ...values,
    );
  }
}

async function seedReferences(): Promise<void> {
  await seedReference('account_statuses', accountStatuses);
  await seedReference('roles', roles);
  await seedReference('organization_types', organizationTypes);
  await seedReference(
    'organization_verification_statuses',
    organizationVerificationStatuses,
  );
  await seedReference('organization_member_roles', organizationMemberRoles);
  await seedReference('risk_classes', riskClasses, { withSortOrder: true });
  await seedReference('product_origin_types', productOriginTypes);
  await seedReference('registry_statuses', registryStatuses);
  await seedReference('document_types', documentTypes);
  await seedReference('characteristic_value_types', characteristicValueTypes);
  await seedReference('measurement_units', measurementUnits, { withSymbol: true });
  await seedReference('analogue_types', analogueTypes);
  await seedReference('review_experience_periods', reviewExperiencePeriods, {
    withSortOrder: true,
  });
  await seedReference('review_statuses', reviewStatuses);
  await seedReference('notification_types', notificationTypes);
  await seedReference('notification_severities', notificationSeverities);
  await seedReference('sync_run_statuses', syncRunStatuses);

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: { name: currency.name, symbol: currency.symbol },
      create: {
        id: seedId(`currencies:${currency.code}`),
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
      },
    });
  }
}

async function seedGeography(): Promise<void> {
  for (const country of countries) {
    await prisma.country.upsert({
      where: { iso2: country.iso2 },
      update: { name: country.name },
      create: {
        id: seedId(`countries:${country.iso2}`),
        iso2: country.iso2,
        name: country.name,
      },
    });
  }

  for (const region of regions) {
    const countryId = seedId(`countries:${region.countryIso2}`);
    await prisma.region.upsert({
      where: { countryId_code: { countryId, code: region.code } },
      update: { name: region.name },
      create: {
        id: seedId(`regions:${region.code}`),
        countryId,
        code: region.code,
        name: region.name,
      },
    });
  }

  for (const city of cities) {
    const regionId = seedId(`regions:${city.regionCode}`);
    await prisma.city.upsert({
      where: { regionId_name: { regionId, name: city.name } },
      update: {},
      create: {
        id: seedId(`cities:${city.regionCode}:${city.name}`),
        regionId,
        name: city.name,
      },
    });
  }
}

function cityId(regionCode: string, name: string): string {
  return seedId(`cities:${regionCode}:${name}`);
}

const CITY_REGION: Record<string, string> = {
  Казань: 'RU-TA',
  Москва: 'RU-MOW',
  'Санкт-Петербург': 'RU-SPE',
  Токио: 'JP-13',
};

function cityIdByName(name: string): string {
  const regionCode = CITY_REGION[name];
  if (!regionCode) throw new Error(`Неизвестный город в seed: ${name}`);
  return cityId(regionCode, name);
}

async function seedCategories(): Promise<void> {
  for (const category of productCategories) {
    await prisma.productCategory.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: {
        id: seedId(`product_categories:${category.slug}`),
        slug: category.slug,
        name: category.name,
        sortOrder: category.sortOrder,
      },
    });
  }
}

async function seedCharacteristicDefinitions(): Promise<void> {
  for (const definition of characteristicDefinitions) {
    const data = {
      name: definition.name,
      valueTypeId: seedId(
        `characteristic_value_types:${definition.valueTypeCode}`,
      ),
      unitId: definition.unitCode
        ? seedId(`measurement_units:${definition.unitCode}`)
        : null,
      categoryId: definition.categorySlug
        ? seedId(`product_categories:${definition.categorySlug}`)
        : null,
      isComparable: definition.isComparable,
      sortOrder: definition.sortOrder,
    };

    await prisma.characteristicDefinition.upsert({
      where: { code: definition.code },
      update: data,
      create: {
        id: seedId(`characteristic_definitions:${definition.code}`),
        code: definition.code,
        ...data,
      },
    });
  }
}

interface SeedOrganization {
  key: string;
  name: string;
  shortName: string;
  typeCode: string;
  verificationCode: string;
  inn: string;
  ogrn: string;
  cityName: string;
  address: string;
}

const organizations: SeedOrganization[] = [
  {
    key: 'gkb-52',
    name: 'Государственное бюджетное учреждение здравоохранения «Городская клиническая больница № 52 Департамента здравоохранения города Москвы»',
    shortName: 'ГБУЗ «ГКБ № 52 ДЗМ»',
    typeCode: 'medical',
    verificationCode: 'verified',
    inn: '7734112233',
    ogrn: '1037739123456',
    cityName: 'Москва',
    address: 'ул. Пехотная, д. 3',
  },
  {
    key: 'analytics-center',
    name: 'Аналитический центр мониторинга медицинских изделий',
    shortName: 'Аналитический центр',
    typeCode: 'government',
    verificationCode: 'verified',
    inn: '7701998877',
    ogrn: '1027700998877',
    cityName: 'Москва',
    address: 'Славянская площадь, д. 4',
  },
  {
    key: 'medsnab',
    name: 'Общество с ограниченной ответственностью «МедСнаб»',
    shortName: 'ООО «МедСнаб»',
    typeCode: 'supplier',
    verificationCode: 'verified',
    inn: '7712345678',
    ogrn: '1137746000111',
    cityName: 'Москва',
    address: 'Варшавское шоссе, д. 42',
  },
  {
    key: 'profmed',
    name: 'Общество с ограниченной ответственностью «Профмед»',
    shortName: 'ООО «Профмед»',
    typeCode: 'supplier',
    verificationCode: 'pending',
    inn: '7811223344',
    ogrn: '1157847000222',
    cityName: 'Санкт-Петербург',
    address: 'Лиговский проспект, д. 150',
  },
];

async function seedOrganizations(): Promise<void> {
  for (const organization of organizations) {
    const data = {
      organizationTypeId: seedId(`organization_types:${organization.typeCode}`),
      verificationStatusId: seedId(
        `organization_verification_statuses:${organization.verificationCode}`,
      ),
      name: organization.name,
      shortName: organization.shortName,
      inn: organization.inn,
      ogrn: organization.ogrn,
      cityId: cityIdByName(organization.cityName),
      address: organization.address,
    };

    await prisma.organization.upsert({
      where: { id: seedId(`organizations:${organization.key}`) },
      update: data,
      create: { id: seedId(`organizations:${organization.key}`), ...data },
    });
  }

  for (const supplierKey of ['medsnab', 'profmed']) {
    const organizationId = seedId(`organizations:${supplierKey}`);
    await prisma.supplier.upsert({
      where: { organizationId },
      update: {},
      create: {
        id: seedId(`suppliers:${supplierKey}`),
        organizationId,
        licenseNumber: supplierKey === 'medsnab' ? 'ФС-99-04-005123' : null,
      },
    });
  }
}

interface SeedUser {
  key: string;
  email: string;
  displayName: string;
  roleCodes: string[];
  organizationKey?: string;
  memberRoleCode?: string;
}

const users: SeedUser[] = [
  {
    key: 'user',
    email: 'user@medizdeliya.local',
    displayName: 'Алексей Смирнов',
    roleCodes: ['user'],
  },
  {
    key: 'organization',
    email: 'clinic@medizdeliya.local',
    displayName: 'ГБУЗ «ГКБ № 52 ДЗМ»',
    roleCodes: ['user', 'organization'],
    organizationKey: 'gkb-52',
    memberRoleCode: 'administrator',
  },
  {
    key: 'government',
    email: 'gov@medizdeliya.local',
    displayName: 'Аналитический центр',
    roleCodes: ['user', 'government'],
    organizationKey: 'analytics-center',
    memberRoleCode: 'analyst',
  },
  // Отдельная учётная запись модератора нужна, чтобы покрыть переходы статусов
  // отзывов: эндпоинт PATCH /admin/reviews/:id/status требует роль admin.
  {
    key: 'admin',
    email: 'admin@medizdeliya.local',
    displayName: 'Модератор каталога',
    roleCodes: ['user', 'admin'],
  },
];

async function seedUsers(passwordHash: string): Promise<void> {
  const activeStatusId = seedId('account_statuses:active');

  for (const user of users) {
    const id = seedId(`users:${user.key}`);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        displayName: user.displayName,
        accountStatusId: activeStatusId,
        passwordHash,
      },
      create: {
        id,
        email: user.email,
        displayName: user.displayName,
        accountStatusId: activeStatusId,
        passwordHash,
        emailVerifiedAt: new Date('2026-01-15T10:00:00.000Z'),
      },
    });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
      select: { id: true },
    });

    for (const roleCode of user.roleCodes) {
      const roleId = seedId(`roles:${roleCode}`);
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: stored.id, roleId } },
        update: {},
        create: { userId: stored.id, roleId },
      });
    }

    if (user.organizationKey && user.memberRoleCode) {
      const organizationId = seedId(`organizations:${user.organizationKey}`);
      await prisma.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId, userId: stored.id },
        },
        update: {
          memberRoleId: seedId(
            `organization_member_roles:${user.memberRoleCode}`,
          ),
          verifiedAt: new Date('2026-01-20T10:00:00.000Z'),
        },
        create: {
          organizationId,
          userId: stored.id,
          memberRoleId: seedId(
            `organization_member_roles:${user.memberRoleCode}`,
          ),
          joinedAt: new Date('2026-01-20T10:00:00.000Z'),
          verifiedAt: new Date('2026-01-20T10:00:00.000Z'),
        },
      });
    }
  }
}

async function seedManufacturers(): Promise<void> {
  for (const manufacturer of manufacturers) {
    const data = {
      name: manufacturer.name,
      countryId: seedId(`countries:${manufacturer.countryIso2}`),
      cityId: cityIdByName(manufacturer.cityName),
      website: null,
    };

    await prisma.manufacturer.upsert({
      where: { id: seedId(`manufacturers:${manufacturer.key}`) },
      update: data,
      create: { id: seedId(`manufacturers:${manufacturer.key}`), ...data },
    });
  }
}

async function seedProducts(): Promise<void> {
  for (const product of products) {
    const productId = seedId(`products:${product.key}`);
    const data = {
      manufacturerId: seedId(`manufacturers:${product.manufacturerKey}`),
      categoryId: seedId(`product_categories:${product.categorySlug}`),
      riskClassId: seedId(`risk_classes:${product.riskClassCode}`),
      originTypeId: seedId(`product_origin_types:${product.originTypeCode}`),
      currentRegistryStatusId: seedId(
        `registry_statuses:${product.registryStatusCode}`,
      ),
      name: product.name,
      shortName: product.shortName,
      registrationDate: new Date(`${product.registrationDate}T00:00:00.000Z`),
      registrationExpiresAt: new Date(
        `${product.registrationExpiresAt}T00:00:00.000Z`,
      ),
      verifiedAt: new Date(product.verifiedAt),
      description: product.description,
    };

    await prisma.product.upsert({
      where: { registrationNumber: product.registrationNumber },
      update: data,
      create: {
        id: productId,
        registrationNumber: product.registrationNumber,
        ...data,
      },
    });

    // Изображение: storage_key — относительный путь внутри public/assets
    // frontend, файлового хранилища на этом этапе нет.
    await prisma.productImage.upsert({
      where: { productId_sortOrder: { productId, sortOrder: 0 } },
      update: {
        storageKey: `products/${product.imageFile}`,
        altText: product.name,
      },
      create: {
        id: seedId(`product_images:${product.key}:0`),
        productId,
        storageKey: `products/${product.imageFile}`,
        altText: product.name,
        sortOrder: 0,
      },
    });

    for (const document of product.documents) {
      const documentId = seedId(`product_documents:${product.key}:${document.file}`);
      const documentData = {
        productId,
        documentTypeId: seedId(`document_types:${document.typeCode}`),
        title: document.title,
        storageKey: `documents/${document.file}`,
        documentNumber: document.documentNumber ?? null,
        issuedAt: new Date(`${product.registrationDate}T00:00:00.000Z`),
        validUntil: new Date(`${product.registrationExpiresAt}T00:00:00.000Z`),
      };

      await prisma.productDocument.upsert({
        where: { id: documentId },
        update: documentData,
        create: { id: documentId, ...documentData },
      });
    }

    for (const [code, value] of Object.entries(product.characteristics)) {
      const definition = characteristicDefinitions.find((d) => d.code === code);
      if (!definition) throw new Error(`Нет определения характеристики: ${code}`);

      const definitionId = seedId(`characteristic_definitions:${code}`);
      const typed =
        definition.valueTypeCode === 'number'
          ? { numericValue: new Prisma.Decimal(value), textValue: null }
          : { textValue: String(value), numericValue: null };

      await prisma.productCharacteristicValue.upsert({
        where: {
          productId_characteristicDefinitionId: {
            productId,
            characteristicDefinitionId: definitionId,
          },
        },
        update: { ...typed, booleanValue: null, dateValue: null },
        create: {
          id: seedId(`product_characteristic_values:${product.key}:${code}`),
          productId,
          characteristicDefinitionId: definitionId,
          booleanValue: null,
          dateValue: null,
          ...typed,
        },
      });
    }

    for (const entry of product.statusHistory) {
      const effectiveAt = new Date(entry.effectiveAt);
      await prisma.registryStatusHistory.upsert({
        where: { productId_effectiveAt: { productId, effectiveAt } },
        update: {
          registryStatusId: seedId(`registry_statuses:${entry.statusCode}`),
          comment: entry.comment,
        },
        create: {
          id: seedId(`registry_status_history:${product.key}:${entry.effectiveAt}`),
          productId,
          registryStatusId: seedId(`registry_statuses:${entry.statusCode}`),
          effectiveAt,
          comment: entry.comment,
        },
      });
    }
  }
}

async function seedSupplierOffers(): Promise<void> {
  const rubId = seedId('currencies:RUB');
  const medsnabId = seedId('suppliers:medsnab');
  const profmedId = seedId('suppliers:profmed');
  const moscowRegionId = seedId('regions:RU-MOW');
  const spbRegionId = seedId('regions:RU-SPE');

  const validFrom = new Date('2026-09-01T00:00:00.000Z');

  for (const product of products) {
    const productId = seedId(`products:${product.key}`);

    // Два действующих предложения дают min/max из mockData.
    const offers = [
      {
        key: 'medsnab-min',
        supplierId: medsnabId,
        regionId: moscowRegionId,
        price: product.priceMin,
        validUntil: null as Date | null,
      },
      {
        key: 'profmed-max',
        supplierId: profmedId,
        regionId: spbRegionId,
        price: product.priceMax,
        validUntil: null as Date | null,
      },
      // Истёкшее предложение с заведомо «лучшей» ценой. Оно не должно
      // попадать в product_price_range_view — это проверяется тестом.
      {
        key: 'medsnab-expired',
        supplierId: medsnabId,
        regionId: moscowRegionId,
        price: Math.round(product.priceMin * 0.8),
        validUntil: new Date('2026-06-30T00:00:00.000Z'),
      },
    ];

    for (const offer of offers) {
      const id = seedId(`supplier_offers:${product.key}:${offer.key}`);
      const data = {
        productId,
        supplierId: offer.supplierId,
        currencyId: rubId,
        regionId: offer.regionId,
        price: new Prisma.Decimal(offer.price),
        validFrom:
          offer.key === 'medsnab-expired'
            ? new Date('2026-01-01T00:00:00.000Z')
            : validFrom,
        validUntil: offer.validUntil,
        sourceUrl: null,
      };

      await prisma.supplierOffer.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      });
    }
  }
}

async function seedAnalogues(): Promise<void> {
  for (const link of productAnalogues) {
    const productId = seedId(`products:${link.productKey}`);
    const analogueProductId = seedId(`products:${link.analogueKey}`);
    await prisma.productAnalogue.upsert({
      where: { productId_analogueProductId: { productId, analogueProductId } },
      update: {
        analogueTypeId: seedId(`analogue_types:${link.typeCode}`),
        similarityScore: new Prisma.Decimal(link.score),
      },
      create: {
        productId,
        analogueProductId,
        analogueTypeId: seedId(`analogue_types:${link.typeCode}`),
        similarityScore: new Prisma.Decimal(link.score),
      },
    });
  }
}

async function seedReviews(): Promise<void> {
  const reviews = [
    {
      key: 'mp-12-organization',
      productKey: 'mp-12',
      authorKey: 'organization',
      organizationKey: 'gkb-52',
      experienceCode: 'over_6_months',
      statusCode: 'published',
      rating: 5,
      title: 'Надёжная работа в реанимации',
      body: 'Используем монитор восемь месяцев. Показания стабильны, интерфейс понятен персоналу.',
      createdAt: '2026-09-02T08:00:00.000Z',
      publishedAt: '2026-09-02T12:00:00.000Z',
    },
    {
      key: 'mp-12-user',
      productKey: 'mp-12',
      authorKey: 'user',
      organizationKey: null,
      experienceCode: '1_to_6_months',
      statusCode: 'published',
      rating: 4,
      title: 'Удобная настройка',
      body: 'Быстрое подключение модулей и понятные тревоги.',
      createdAt: '2026-08-24T08:00:00.000Z',
      publishedAt: '2026-08-24T15:00:00.000Z',
    },
    // Ожидает модерации — проверяет, что такие отзывы не влияют на рейтинг.
    {
      key: 'vector-8-user',
      productKey: 'vector-8',
      authorKey: 'user',
      organizationKey: null,
      experienceCode: 'under_1_month',
      statusCode: 'moderation',
      rating: 5,
      title: 'Пока только первые впечатления',
      body: 'Разворачивали в палате пробуждения, замечаний за первые недели нет.',
      createdAt: '2026-10-18T08:00:00.000Z',
      publishedAt: null,
    },
    // Критический отзыв — наполняет problem_products_view.
    {
      key: 'mitar-01-organization',
      productKey: 'mitar-01',
      authorKey: 'organization',
      organizationKey: 'gkb-52',
      experienceCode: '1_to_6_months',
      statusCode: 'published',
      rating: 2,
      title: 'Частые ложные тревоги',
      body: 'На выездах датчики SpO2 срабатывают ложно, требуется калибровка после каждой смены.',
      createdAt: '2026-10-05T08:00:00.000Z',
      publishedAt: '2026-10-05T16:00:00.000Z',
    },
  ];

  for (const review of reviews) {
    const productId = seedId(`products:${review.productKey}`);
    const authorUser = await prisma.user.findUniqueOrThrow({
      where: { email: users.find((u) => u.key === review.authorKey)!.email },
      select: { id: true },
    });

    const data = {
      authorOrganizationId: review.organizationKey
        ? seedId(`organizations:${review.organizationKey}`)
        : null,
      experiencePeriodId: seedId(
        `review_experience_periods:${review.experienceCode}`,
      ),
      reviewStatusId: seedId(`review_statuses:${review.statusCode}`),
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: new Date(review.createdAt),
      publishedAt: review.publishedAt ? new Date(review.publishedAt) : null,
    };

    await prisma.review.upsert({
      where: {
        productId_authorUserId: { productId, authorUserId: authorUser.id },
      },
      update: data,
      create: {
        id: seedId(`reviews:${review.key}`),
        productId,
        authorUserId: authorUser.id,
        ...data,
      },
    });
  }
}

async function seedSavedAndComparisons(): Promise<void> {
  const clinicUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'clinic@medizdeliya.local' },
    select: { id: true },
  });
  const regularUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'user@medizdeliya.local' },
    select: { id: true },
  });

  const savedListId = seedId('saved_lists:gkb-52-main');
  await prisma.savedList.upsert({
    where: { id: savedListId },
    update: {
      name: 'Закупка мониторов 2026',
      ownerUserId: clinicUser.id,
      organizationId: seedId('organizations:gkb-52'),
    },
    create: {
      id: savedListId,
      name: 'Закупка мониторов 2026',
      ownerUserId: clinicUser.id,
      organizationId: seedId('organizations:gkb-52'),
    },
  });

  for (const productKey of ['mp-12', 'vector-8']) {
    const productId = seedId(`products:${productKey}`);
    await prisma.savedListItem.upsert({
      where: { savedListId_productId: { savedListId, productId } },
      update: {},
      create: { savedListId, productId },
    });
  }

  const comparisonId = seedId('comparisons:user-default');
  await prisma.comparison.upsert({
    where: { id: comparisonId },
    update: { name: 'Отечественный и импортный монитор', ownerUserId: regularUser.id },
    create: {
      id: comparisonId,
      name: 'Отечественный и импортный монитор',
      ownerUserId: regularUser.id,
    },
  });

  const comparisonProducts = [
    { productKey: 'mp-12', position: 1 },
    { productKey: 'vismo', position: 2 },
  ];

  for (const item of comparisonProducts) {
    const productId = seedId(`products:${item.productKey}`);
    await prisma.comparisonItem.upsert({
      where: { comparisonId_productId: { comparisonId, productId } },
      update: { position: item.position },
      create: { comparisonId, productId, position: item.position },
    });
  }
}

async function seedNotifications(): Promise<void> {
  const clinicUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'clinic@medizdeliya.local' },
    select: { id: true },
  });

  const notifications = [
    {
      key: 'ru-updated',
      typeCode: 'registry_status_changed',
      severityCode: 'success',
      productKey: 'mp-12',
      title: 'Регистрационное удостоверение обновлено',
      body: 'Для изделия «Монитор пациента МП-12» загружена новая версия регистрационного удостоверения.',
      createdAt: '2026-10-31T09:42:00.000Z',
      readAt: null as string | null,
    },
    {
      key: 'price-changed',
      typeCode: 'price_changed',
      severityCode: 'warning',
      productKey: 'vector-8',
      title: 'Изменился диапазон цен',
      body: 'Диапазон действующих предложений по изделию «Кардиомонитор «Вектор-8»» изменился.',
      createdAt: '2026-10-30T16:18:00.000Z',
      readAt: null,
    },
    {
      key: 'expiring',
      typeCode: 'registration_expiring',
      severityCode: 'danger',
      productKey: 'mitar-01',
      title: 'Регистрация истекает через 30 дней',
      body: 'Регистрационное удостоверение изделия «Монитор МИТАР-01» истекает 20 декабря 2026 года.',
      createdAt: '2026-10-28T10:00:00.000Z',
      readAt: null,
    },
    {
      key: 'sync-failed',
      typeCode: 'sync_failed',
      severityCode: 'danger',
      productKey: null,
      title: 'Загрузка демонстрационного источника завершилась с ошибками',
      body: 'Часть записей демонстрационного источника не обработана. Подробности — в журнале загрузок.',
      createdAt: '2026-10-27T03:15:00.000Z',
      readAt: '2026-10-27T08:00:00.000Z',
    },
  ];

  for (const notification of notifications) {
    const id = seedId(`notifications:${notification.key}`);
    const data = {
      notificationTypeId: seedId(`notification_types:${notification.typeCode}`),
      severityId: seedId(`notification_severities:${notification.severityCode}`),
      productId: notification.productKey
        ? seedId(`products:${notification.productKey}`)
        : null,
      title: notification.title,
      body: notification.body,
      createdAt: new Date(notification.createdAt),
    };

    await prisma.notification.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    await prisma.notificationRecipient.upsert({
      where: {
        notificationId_userId: { notificationId: id, userId: clinicUser.id },
      },
      update: {
        readAt: notification.readAt ? new Date(notification.readAt) : null,
      },
      create: {
        notificationId: id,
        userId: clinicUser.id,
        deliveredAt: new Date(notification.createdAt),
        readAt: notification.readAt ? new Date(notification.readAt) : null,
      },
    });
  }
}

async function seedSyncRuns(): Promise<void> {
  // Единственный источник — демонстрационный. Строки с base_url реального
  // государственного реестра появятся только вместе с реальной интеграцией
  // (ADR 0008), поэтому base_url здесь NULL.
  const sourceId = seedId('sync_sources:mock-registry');
  await prisma.syncSource.upsert({
    where: { code: 'mock-registry' },
    update: {
      name: 'Демонстрационный источник (MockRegistryProvider)',
      baseUrl: null,
      isEnabled: true,
    },
    create: {
      id: sourceId,
      code: 'mock-registry',
      name: 'Демонстрационный источник (MockRegistryProvider)',
      baseUrl: null,
      isEnabled: true,
    },
  });

  const governmentUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'gov@medizdeliya.local' },
    select: { id: true },
  });

  const runs = [
    {
      key: 'run-1',
      statusCode: 'success',
      startedAt: '2026-10-29T03:00:00.000Z',
      finishedAt: '2026-10-29T03:04:12.000Z',
      recordsRead: 1864,
      recordsChanged: 11,
      errorCount: 0,
      errorMessage: null as string | null,
      errors: [] as { code: string; message: string; externalId: string | null }[],
    },
    {
      key: 'run-2',
      statusCode: 'success',
      startedAt: '2026-10-30T03:00:00.000Z',
      finishedAt: '2026-10-30T03:03:51.000Z',
      recordsRead: 1864,
      recordsChanged: 6,
      errorCount: 0,
      errorMessage: null,
      errors: [],
    },
    {
      key: 'run-3',
      statusCode: 'partial',
      startedAt: '2026-10-31T03:00:00.000Z',
      finishedAt: '2026-10-31T03:06:40.000Z',
      recordsRead: 1864,
      recordsChanged: 14,
      errorCount: 2,
      errorMessage: 'Две записи пропущены из-за несовпадения контрольной суммы',
      errors: [
        {
          code: 'CHECKSUM_MISMATCH',
          message: 'Контрольная сумма записи не совпала с ожидаемой',
          externalId: 'RZN-2024-22410',
        },
        {
          code: 'UNKNOWN_RISK_CLASS',
          message: 'В записи указан неизвестный класс риска',
          externalId: 'RZN-2021-10045',
        },
      ],
    },
    {
      key: 'run-4',
      statusCode: 'failed',
      startedAt: '2026-10-27T03:00:00.000Z',
      finishedAt: '2026-10-27T03:00:21.000Z',
      recordsRead: 0,
      recordsChanged: 0,
      errorCount: 1,
      errorMessage: 'Демонстрационный источник недоступен',
      errors: [
        {
          code: 'SOURCE_UNAVAILABLE',
          message: 'Источник данных временно недоступен',
          externalId: null,
        },
      ],
    },
  ];

  for (const run of runs) {
    const id = seedId(`sync_runs:${run.key}`);
    const data = {
      syncSourceId: sourceId,
      statusId: seedId(`sync_run_statuses:${run.statusCode}`),
      startedAt: new Date(run.startedAt),
      finishedAt: new Date(run.finishedAt),
      recordsRead: run.recordsRead,
      recordsChanged: run.recordsChanged,
      errorCount: run.errorCount,
      errorMessage: run.errorMessage,
      initiatedByUserId: governmentUser.id,
    };

    await prisma.syncRun.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    for (const [index, error] of run.errors.entries()) {
      const errorId = seedId(`sync_run_errors:${run.key}:${index}`);
      const errorData = {
        syncRunId: id,
        externalRecordId: error.externalId,
        errorCode: error.code,
        message: error.message,
        payloadChecksum: null,
      };

      await prisma.syncRunError.upsert({
        where: { id: errorId },
        update: errorData,
        create: { id: errorId, ...errorData },
      });
    }
  }
}

async function main(): Promise<void> {
  const password = resolveSeedPassword();
  const passwordHash = await argon2Hash(password, ARGON2_OPTIONS);

  console.log('[seed] справочники');
  await seedReferences();

  console.log('[seed] география');
  await seedGeography();

  console.log('[seed] категории и определения характеристик');
  await seedCategories();
  await seedCharacteristicDefinitions();

  console.log('[seed] организации и поставщики');
  await seedOrganizations();

  console.log('[seed] пользователи, роли и членство');
  await seedUsers(passwordHash);

  console.log('[seed] производители и изделия');
  await seedManufacturers();
  await seedProducts();

  console.log('[seed] предложения поставщиков и аналоги');
  await seedSupplierOffers();
  await seedAnalogues();

  console.log('[seed] отзывы');
  await seedReviews();

  console.log('[seed] списки, сравнения и уведомления');
  await seedSavedAndComparisons();
  await seedNotifications();

  console.log('[seed] журнал загрузок');
  await seedSyncRuns();

  console.log('[seed] пересборка поискового индекса и аналитики');
  await prisma.$executeRawUnsafe('SELECT rebuild_all_product_search_documents()');
  // CONCURRENTLY недопустим сразу после создания materialized view, поэтому
  // первый refresh выполняется в обычном режиме.
  await prisma.$executeRawUnsafe('SELECT refresh_analytics_views(false)');

  console.log('[seed] готово');
}

main()
  .catch((error) => {
    console.error('[seed] ошибка:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
