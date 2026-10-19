import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loadRuntimeConfig } from '../../src/config.js'
import { ProductDriver } from '../../src/driver/product.js'

const config = loadRuntimeConfig()

test.describe('live customer experience @live', () => {
  test('experience.desktop-keyboard @canary', async ({ page }) => {
    test.skip(!config.accounts.adminA, 'requires configured dedicated adminA live account')
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(new URL('/uploads', config.baseURL).href)
    await new ProductDriver(page, config, 'adminA').assertAccountIdentity()
    await expect(
      page.getByRole('heading', { name: 'Make your documents accessible' }),
    ).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await page.getByRole('button', { name: 'New import' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'New website import' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'New website import' })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Application error')
    const result = await new AxeBuilder({ page }).analyze()
    expect(
      result.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([])
  })

  test('experience.mobile-390 @canary', async ({ page }) => {
    test.skip(!config.accounts.adminA, 'requires configured dedicated adminA live account')
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(new URL('/uploads', config.baseURL).href)
    await new ProductDriver(page, config, 'adminA').assertAccountIdentity()
    await expect(
      page.getByRole('heading', { name: 'Make your documents accessible' }),
    ).toBeVisible()
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }))
    expect(width.document).toBeLessThanOrEqual(width.viewport)
    await expect(page.getByRole('button', { name: 'New import' })).toBeVisible()
    const result = await new AxeBuilder({ page }).analyze()
    expect(
      result.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? '')),
    ).toEqual([])
  })

  test('bulk.modal-default @canary', async ({ page }) => {
    test.skip(!config.accounts.adminA, 'requires configured dedicated adminA live account')
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    await page.goto(new URL('/uploads', config.baseURL).href)
    await new ProductDriver(page, config, 'adminA').assertAccountIdentity()
    await page.getByRole('button', { name: 'New import' }).click()
    await expect(page.getByRole('heading', { name: 'New website import' })).toBeVisible()
    await expect(page.getByLabel('Website address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prepare import report' })).toBeDisabled()
  })
})
