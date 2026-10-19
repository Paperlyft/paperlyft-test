import { defineConfig, devices } from '@playwright/test'
import { loadRuntimeConfig } from './src/config.js'
const config = loadRuntimeConfig()
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: `${config.outputDir}/results`,
  reporter: [['list'], ['json', { outputFile: `${config.outputDir}/playwright.json` }]],
  use: {
    baseURL: config.baseURL,
    storageState: config.accounts.adminA?.storageState,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PAPERLYFT_BROWSER_CHANNEL ?? 'chrome',
      },
    },
  ],
})
