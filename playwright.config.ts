import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: [/mobile\.spec\.ts/, /auth\.setup\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        isMobile: true,
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
  ],
  webServer: [
    {
      command: `NODE_ENV=test DATABASE_PATH=./data/e2e.db APP_ORIGIN=http://127.0.0.1:${port} SHORT_LINK_ORIGIN=http://127.0.0.1:${port} npm run dev:test`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        WORKER_POLL_MS: '250',
      },
    },
  ],
})
