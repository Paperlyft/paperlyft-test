import { test, expect } from '@playwright/test'
import { loadRuntimeConfig } from '../../src/config.js'
import {
  ProductDriver,
  productRequest,
  requireSuccess,
  type DocumentRow,
} from '../../src/driver/product.js'

const config = loadRuntimeConfig()

test.describe('live customer website integration @live', () => {
  test('experience.reader-private-denied @canary', async ({ page, browser }) => {
    test.skip(
      !config.accounts.adminA,
      'requires configured dedicated owner account with real document records',
    )
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    const driver = new ProductDriver(page, config, 'adminA')
    await driver.open('/uploads')
    await driver.assertAccountIdentity()
    const listed = requireSuccess<{ documents: DocumentRow[] }>(
      await productRequest(page, '/api/documents?limit=100&sortBy=createdAt&order=desc'),
      'Document list',
    )
    let privateId: string | undefined
    for (const row of listed.documents) {
      const view = await driver.library(row.document.documentId)
      if (view.retained && !view.published) {
        privateId = row.document.documentId
        break
      }
    }
    test.skip(
      !privateId,
      'requires an actual retained, unpublished document record for this tenant',
    )
    const settings = await driver.settings()
    const siteId = (settings.website as { siteId?: string } | undefined)?.siteId
    test.skip(!siteId, 'requires the account website integration site identifier')
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const visitor = await anonymous.newPage()
      const query = new URLSearchParams({ site: siteId!, document: privateId! })
      const response = await visitor.goto(`${config.baseURL}/api/document-reader?${query}`)
      expect(response?.status()).toBe(404)
      await expect(visitor.locator('body')).toContainText('DOCUMENT_UNAVAILABLE')
    } finally {
      await anonymous.close()
    }
  })

  test('website.script-role-visibility @canary', async ({ browser }) => {
    test.skip(!config.accounts.memberA, 'requires configured dedicated county member account')
    test.skip(
      !config.accounts.memberA?.expectedSubject || !config.accounts.memberA.expectedTenantId,
      'memberA needs expected subject and tenant in the account manifest',
    )
    const context = await browser.newContext({
      storageState: config.accounts.memberA!.storageState,
    })
    try {
      const page = await context.newPage()
      await page.goto(new URL('/overview', config.baseURL).href)
      await new ProductDriver(page, config, 'memberA').assertAccountIdentity()
      await expect(page.getByRole('button', { name: 'Website integration' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('website.script-copy-exact @canary', async ({ page, context }) => {
    test.skip(
      !config.accounts.adminA,
      'requires configured dedicated owner account with website integration',
    )
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(new URL('/admin/overview', config.baseURL).href)
    await new ProductDriver(page, config, 'adminA').assertAccountIdentity()
    const disclosure = page.getByRole('button', { name: 'Website integration' })
    await expect(disclosure).toBeVisible()
    if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click()
    const section = page.getByRole('region', { name: 'Install on your website' })
    const scriptCode = section.locator('pre code').first()
    const shown = (await scriptCode.innerText()).trim()
    await section.getByRole('button', { name: 'Copy website script' }).click()
    await expect(section.locator('p[role="status"]').first()).toHaveText(
      'Copied. Paste it into your website template.',
    )
    expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(shown)
    const attributes = await page.evaluate((markup) => {
      const element = new DOMParser().parseFromString(markup, 'text/html').querySelector('script')
      return { src: element?.src, api: element?.dataset.plyftApi }
    }, shown)
    expect(attributes.src).toBe(new URL('/paperlyft-document-reader.js', config.baseURL).href)
    expect(attributes.api).toBe(new URL('/api/document-reader', config.baseURL).href)
    expect(shown).not.toMatch(/(?:secret|token|password|api[_-]?key)=/i)
  })

  test('website.script-loads-on-customer-host @canary', async ({ page }) => {
    test.skip(
      !config.accounts.adminA,
      'requires configured owner account and a published document linked from the fixture customer site',
    )
    test.skip(
      !config.accounts.adminA?.expectedSubject || !config.accounts.adminA.expectedTenantId,
      'adminA needs expected subject and tenant in the account manifest',
    )
    test.skip(
      !config.publicFixtureBaseURL,
      'requires a publicly reachable HTTPS customer-site fixture',
    )
    await page.goto(new URL('/admin/overview', config.baseURL).href)
    await new ProductDriver(page, config, 'adminA').assertAccountIdentity()
    const disclosure = page.getByRole('button', { name: 'Website integration' })
    await expect(disclosure).toBeVisible()
    if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click()
    const section = page.getByRole('region', { name: 'Install on your website' })
    const script = (await section.locator('pre code').first().innerText()).trim()
    const customer = await page.context().newPage()
    try {
      await customer.goto(new URL('/customer-site', config.publicFixtureBaseURL).href)
      const scriptSource = await customer.evaluate(
        (value) => new DOMParser().parseFromString(value, 'text/html').querySelector('script')?.src,
        script,
      )
      expect(scriptSource).toBeTruthy()
      test.skip(
        new URL(scriptSource!).protocol !== 'https:',
        'a public HTTPS customer site cannot load the local HTTP PaperLyft script',
      )
      const installed = await customer.evaluate(
        (value) =>
          new Promise<{ site?: string; api?: string }>((resolve, reject) => {
            const parsed = new DOMParser().parseFromString(value, 'text/html')
            const tag = parsed.querySelector('script')
            if (!tag) return reject(new Error('settings did not provide a script element'))
            const script = document.createElement('script')
            for (const attribute of tag.attributes)
              script.setAttribute(attribute.name, attribute.value)
            const link = document.createElement('a')
            link.href = new URL('/simple-1p.pdf', location.href).href
            link.textContent = 'Open the published sample PDF'
            document.body.append(link)
            script.onload = () =>
              resolve({ site: script.dataset.plyftSite, api: script.dataset.plyftApi })
            script.onerror = () =>
              reject(new Error('customer website could not load the account script'))
            document.body.append(script)
          }),
        script,
      )
      const resolved = await customer.evaluate(async ({ api, site }) => {
        if (!api || !site)
          throw new Error('website settings script is missing its site or API attributes')
        const url = new URL(api)
        url.search = new URLSearchParams({
          site,
          action: 'resolve',
          source: new URL('/simple-1p.pdf', location.href).href,
        }).toString()
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
        return { status: response.status }
      }, installed)
      test.skip(
        resolved.status === 404,
        'requires a published document record sourced from this public customer-site fixture',
      )
      expect(resolved.status).toBe(200)
      const reader = customer.locator('[data-plyft-reader]')
      await expect(reader).toBeVisible({ timeout: 20_000 })
      await customer.getByRole('link', { name: 'Open the published sample PDF' }).click()
      await expect(reader.getByRole('dialog')).toBeVisible()
      await expect(reader.locator('iframe[title^="Accessible "]')).toBeVisible({ timeout: 30_000 })
    } finally {
      await customer.close()
    }
  })
})
