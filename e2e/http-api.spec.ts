import { expect, test } from '@playwright/test'

/**
 * Smoke-тесты интерфейса, работающего через HTTP API.
 *
 * Требуют поднятого backend и сборки frontend с VITE_API_URL. Если переменная
 * E2E_API_URL не задана, набор пропускается: в обычном прогоне (демо на
 * mock-адаптере) этим тестам негде взять данные.
 *
 * Локальный запуск:
 *   cd backend && THROTTLE_DISABLED=true npm run start:dev
 *   VITE_API_URL=http://127.0.0.1:3000/api/v1 npm run build
 *   E2E_API_URL=http://127.0.0.1:3000/api/v1 \
 *     E2E_SEED_PASSWORD=<SEED_DEV_PASSWORD> npx playwright test e2e/http-api.spec.ts
 *
 * THROTTLE_DISABLED нужен потому, что наборы desktop и mobile идут
 * параллельно и упираются в общий лимит 600 запросов в минуту: каждый
 * просмотр страницы — это 4–5 обращений к API. Сам лимит проверяется
 * backend-тестом test/throttling.e2e.spec.ts, а env.schema.ts запрещает
 * этот флаг в production.
 */

const apiUrl = process.env.E2E_API_URL
const seedPassword = process.env.E2E_SEED_PASSWORD ?? 'DevOnly-Seed-Password-2026'

test.describe('Интерфейс на HTTP API', () => {
  test.skip(!apiUrl, 'E2E_API_URL не задан: сборка работает на mock-адаптере')

  /** Идентификатор МП-12 из базы: адреса карточек — UUID, а не слаги. */
  let mp12Id = ''

  test.beforeAll(async ({ request }) => {
    // Каталог открыт без авторизации, поэтому id берётся прямым запросом.
    const response = await request.get(`${apiUrl}/products?search=21851`)
    const payload = await response.json()
    mp12Id = payload.data[0].id
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('каталог показывает изделия из базы', async ({ page }) => {
    await page.goto('/catalog')

    // Данные seed: четыре изделия, заголовок считается из /catalog/filters.
    await expect(page.getByRole('heading', { name: /зарегистрированн/ })).toBeVisible()
    await expect(page.getByText('Монитор пациента МП-12').first()).toBeVisible()
    await expect(page.getByText('Patient Monitor Vismo').first()).toBeVisible()

    // Диапазон цен рассчитан по действующим предложениям поставщиков.
    await expect(page.getByText('284 000–319 000 ₽').first()).toBeVisible()
  })

  test('поиск по фрагменту регистрационного номера находит изделие', async ({ page }) => {
    await page.goto('/catalog?search=21851')

    await expect(page.getByText('Монитор пациента МП-12').first()).toBeVisible()
    await expect(page.getByText('Patient Monitor Vismo')).toHaveCount(0)
  })

  test('фильтр по стране обращается к API', async ({ page }) => {
    await page.goto('/catalog?country=%D0%AF%D0%BF%D0%BE%D0%BD%D0%B8%D1%8F')

    await expect(page.getByText('Patient Monitor Vismo').first()).toBeVisible()
    await expect(page.getByText('Монитор пациента МП-12')).toHaveCount(0)
  })

  test('карточка показывает нормализованные характеристики и документы', async ({ page }) => {
    await page.goto(`/products/${mp12Id}`)

    await expect(page.getByRole('heading', { name: 'Монитор пациента МП-12' })).toBeVisible()

    // Характеристики собраны из characteristic_definitions и значений
    // с единицами измерения, а не из JSON-объекта.
    await expect(page.getByText('12 шт.').first()).toBeVisible()
    await expect(page.getByText('12,1″').first()).toBeVisible()
    await expect(page.getByText('4 ч').first()).toBeVisible()

    // Класс риска показывается кириллицей, в справочнике код латинский.
    await expect(page.getByText('2б').first()).toBeVisible()

    // Документы приходят из product_documents.
    await expect(page.getByText('Регистрационное удостоверение.pdf')).toBeVisible()

    // Аналоги — из product_analogues.
    await expect(page.getByRole('heading', { name: 'Подходящие аналоги' })).toBeVisible()
  })

  test('рейтинг рассчитан по опубликованным отзывам, а не задан в данных', async ({ page }) => {
    await page.goto(`/products/${mp12Id}`)
    await expect(page.getByRole('heading', { name: 'Монитор пациента МП-12' })).toBeVisible()

    // Два опубликованных отзыва с оценками 5 и 4 дают 4,5.
    await expect(page.getByText('4,5').first()).toBeVisible()
    await expect(page.getByText(/2 отзыв/).first()).toBeVisible()

    // Бейдж медорганизации вычислен из статуса верификации организации.
    await expect(page.getByText('Медорганизация').first()).toBeVisible()
  })

  test('вход реальной учётной записью открывает кабинет организации', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('clinic@medizdeliya.local')
    await page.getByLabel('Пароль').fill(seedPassword)
    await page.getByRole('button', { name: 'Войти' }).click()

    await expect(page).toHaveURL(/organization/)
    await expect(page.getByRole('heading', { name: 'Кабинет медорганизации' })).toBeVisible()

    // Сохранённые изделия организации приходят из saved_lists.
    await expect(page.getByRole('heading', { name: 'Сохранённые изделия' })).toBeVisible()
  })

  test('сессия сохраняется после перезагрузки через /auth/me', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('clinic@medizdeliya.local')
    await page.getByLabel('Пароль').fill(seedPassword)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/organization/)

    // Перезагрузка теряет access token из памяти; сессия должна
    // восстановиться по HttpOnly refresh-cookie.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Кабинет медорганизации' })).toBeVisible()
  })

  test('токены не попадают в localStorage', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('clinic@medizdeliya.local')
    await page.getByLabel('Пароль').fill(seedPassword)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/organization/)

    const stored = await page.evaluate(() => JSON.stringify(localStorage))

    // Допустим только служебный признак наличия сессии.
    expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/) // JWT
    expect(stored).not.toContain('accessToken')
    expect(stored).not.toContain('refresh')
  })

  test('неверный пароль показывает ошибку и не пускает в кабинет', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('clinic@medizdeliya.local')
    await page.getByLabel('Пароль').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Войти' }).click()

    await expect(page).toHaveURL(/auth\/login/)
  })

  test('государственный раздел показывает аналитику из базы', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('gov@medizdeliya.local')
    await page.getByLabel('Пароль').fill(seedPassword)
    await page.getByRole('button', { name: 'Войти' }).click()

    await expect(page).toHaveURL(/government\/analytics/)
    await expect(page.getByRole('heading', { name: 'Государственная аналитика' })).toBeVisible()

    // Три отечественных изделия из четырёх.
    await expect(page.getByText('75', { exact: false }).first()).toBeVisible()
  })

  test('журнал демонстрационного источника не выдаёт его за реестр', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill('gov@medizdeliya.local')
    await page.getByLabel('Пароль').fill(seedPassword)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/government\/analytics/)

    // Запрос выполняет само приложение: access token живёт в памяти страницы,
    // а не в cookie, поэтому отдельный APIRequestContext его не получит.
    const [response] = await Promise.all([
      // Условие привязано к адресу API: навигация браузера на страницу
      // /government/sync тоже содержит эту подстроку, но отдаёт HTML.
      page.waitForResponse(
        (candidate) =>
          candidate.url().startsWith(`${apiUrl}/government/sync`) &&
          candidate.status() === 200,
      ),
      page.goto('/government/sync?source=mock-registry'),
    ])

    const payload = await response.json()

    // Главное требование ADR 0008: внешний реестр не объявляется подключённым.
    expect(payload.data.source.isReal).toBe(false)
    expect(payload.data.source.code).toBe('mock-registry')
    expect(payload.data.source.baseUrl).toBeNull()

    await expect(page.getByRole('heading', { name: /Синхронизаци|загрузок|реестр/ }).first()).toBeVisible()
  })

  test('сравнение и избранное нового пользователя сохраняются на сервере', async ({ page }, testInfo) => {
    const email = `collections-${testInfo.project.name}-${Date.now()}@e2e.example.test`
    const password = 'Collections-Smoke-Password-2026'
    const registered = await page.request.post(`${apiUrl}/auth/register`, {
      data: { email, password, displayName: 'Collections smoke' },
    })
    expect(registered.status()).toBe(201)
    await page.goto('/auth/login')
    await page.getByLabel('Электронная почта').fill(email)
    await page.getByLabel('Пароль').fill(password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/catalog/)
    await page.goto(`/products/${mp12Id}`)
    await page.getByRole('button', { name: 'Добавить к сравнению', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Добавлено к сравнению', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Сохранено', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Добавлено к сравнению', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сохранено', exact: true })).toBeVisible()
    await page.goto('/compare')
    await page.getByRole('button', { name: 'Удалить Монитор пациента МП-12', exact: true }).click()
    await expect(page.getByText('Список сравнения пуст')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Список сравнения пуст')).toBeVisible()
  })

  test('каталог открыт без авторизации', async ({ page }) => {
    await page.goto('/catalog')
    await expect(page.getByText('Монитор пациента МП-12').first()).toBeVisible()

    // Защищённый раздел при этом недоступен.
    await page.goto('/organization')
    await expect(page).toHaveURL(/auth\/login/)
  })
})
