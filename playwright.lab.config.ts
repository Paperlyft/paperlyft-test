import { defineConfig } from '@playwright/test'

// This configuration never loads application accounts or reaches a PaperLyft target.
export default defineConfig({
  testDir: './tests/lab',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: 'list',
  outputDir: 'artifacts/lab/results',
  use: {
    channel: process.env.PAPERLYFT_BROWSER_CHANNEL ?? 'chrome',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
})
