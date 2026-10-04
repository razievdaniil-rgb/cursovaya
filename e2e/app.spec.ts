import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload() })

test('public catalog and comparison flow', async ({ page }) => {
  await page.getByPlaceholder('Название, производитель или регистрационный номер').fill('монитор')
  await page.getByRole('button', { name: 'Найти' }).click()
  await expect(page).toHaveURL(/catalog/)
  await expect(page.getByText('Монитор пациента МП-12').first()).toBeVisible()
  await page.goto('/compare')
  await expect(page.getByRole('heading', { name: 'Сравнение изделий' })).toBeVisible()
})

test('review form validates and submits', async ({ page }) => {
  await page.goto('/products/mp-12/review')
  await page.getByPlaceholder('Кратко сформулируйте основное впечатление').fill('Надёжный монитор')
  await page.getByPlaceholder('Опишите условия и продолжительность использования').fill('Используем восемь месяцев в реанимации, показатели стабильны.')
  await page.getByRole('button', { name: 'Отправить отзыв' }).click()
  await expect(page.getByRole('heading', { name: 'Отзыв отправлен' })).toBeVisible()
  await expect(page.getByText('На модерации')).toBeVisible()
})

test('organization role opens protected cabinet', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByLabel('Тип учётной записи').selectOption('organization')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/organization/)
  await expect(page.getByRole('heading', { name: 'Кабинет медорганизации' })).toBeVisible()
})

test('government role opens analytics and sync states', async ({ page }) => {
  await page.goto('/auth/login?returnTo=%2Fgovernment%2Fanalytics')
  await page.getByLabel('Тип учётной записи').selectOption('government')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/government\/analytics/)
  await expect(page.getByRole('heading', { name: 'Государственная аналитика' })).toBeVisible()
  await page.goto('/government/sync?state=stale')
  await expect(page.getByText('Требуется обновление').first()).toBeVisible()
  await page.goto('/government/sync?state=error')
  await expect(page.getByRole('heading', { name: 'Источник данных недоступен' })).toBeVisible()
})

test('regular user is redirected away from role-only routes', async ({ page }) => {
  await page.goto('/auth/login?returnTo=%2Forganization')
  await page.getByLabel('Тип учётной записи').selectOption('user')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/catalog/)
})

test('public layouts have no horizontal overflow', async ({ page }, testInfo) => {
  for (const route of ['/', '/catalog', '/products/mp-12', '/compare', '/auth/login']) {
    await page.goto(route)
    const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(sizes.content, `${route} content width`).toBeLessThanOrEqual(sizes.viewport)
  }
  await page.goto('/')
  await page.screenshot({ path: testInfo.outputPath('home-full.png'), fullPage: true })
})
