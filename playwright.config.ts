import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', timeout: 30_000, fullyParallel: false,
  // В CI нужен reporter github: без него причина падения остаётся только в
  // логах задания, которые недоступны без авторизации. HTML-отчёт
  // выкладывается артефактом.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 390, height: 844 } } },
  ],
})
