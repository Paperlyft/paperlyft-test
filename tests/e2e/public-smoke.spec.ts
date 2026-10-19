import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test('canary.public-home @live @canary', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Application error')
})
test('canary.private-api-denied @live @canary', async ({ request }) => {
  const response = await request.get('/api/documents')
  expect([401, 403]).toContain(response.status())
})
