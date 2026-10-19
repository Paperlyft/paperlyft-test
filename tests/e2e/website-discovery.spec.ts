import { expect, test } from '@playwright/test'
import { assertRunAllowed, loadRuntimeConfig, type AccountKey } from '../../src/config.js'
import { assertDiscoveryReport, type DiscoveryReport } from '../../src/driver/discovery.js'
import { ProductDriver, productRequest, requireSuccess } from '../../src/driver/product.js'
import { PROVIDER_SITE_PROFILES } from '../../src/lab/provider-sites.js'

const config = loadRuntimeConfig()
const accountKey: AccountKey = 'adminA'
const account = config.accounts[accountKey]
const staticProfiles = PROVIDER_SITE_PROFILES.filter((profile) => profile.method === 'html')

test.describe('real website import discovery preparation @live @mutation', () => {
  for (const profile of staticProfiles) {
    test(`imports.discovery.${profile.id}: discovers the expected public PDF source links`, async ({
      browser,
    }) => {
      test.setTimeout(180_000)
      test.skip(!account, `Missing dedicated ${accountKey} storageState account`)
      test.skip(
        !account?.expectedSubject || !account.expectedTenantId,
        `Account ${accountKey} needs expectedSubject and expectedTenantId in .auth/accounts.json`,
      )
      test.skip(
        config.environment === 'production',
        'Website discovery preparation is excluded from production',
      )
      test.skip(
        !config.allowMutations,
        'Set the explicit live mutation flag to create a saved discovery report',
      )
      test.skip(
        !config.publicFixtureBaseURL,
        'Set PAPERLYFT_PUBLIC_FIXTURE_BASE_URL to a dedicated public HTTPS fixture host serving provider-site profiles',
      )

      const fixtureProbe = await browser.newContext()
      try {
        const capability = await fixtureProbe.request.get(
          new URL('/lab-capabilities', config.publicFixtureBaseURL!).href,
        )
        expect(
          capability.status(),
          'The public fixture host must expose /lab-capabilities before it can be used for discovery acceptance',
        ).toBe(200)
        const body = (await capability.json()) as { providerDiscoveryIsolated?: boolean }
        expect(
          body.providerDiscoveryIsolated,
          'Enable PAPERLYFT_LAB_DISCOVERY_ONLY=1 so generic root sitemaps cannot contaminate provider discovery results',
        ).toBe(true)
      } finally {
        await fixtureProbe.close()
      }

      const context = await browser.newContext({ storageState: account!.storageState })
      const page = await context.newPage()
      try {
        const driver = new ProductDriver(page, config, accountKey)
        await driver.open('/uploads')
        await driver.assertAccountIdentity()
        assertRunAllowed(config, { canary: false, mutations: true })

        let batchId: string | undefined
        page.on('response', async (response) => {
          if (
            response.request().method() !== 'POST' ||
            new URL(response.url()).pathname !== '/api/document-imports'
          )
            return
          try {
            const json = await response.json()
            if (json?.success === true && typeof json.data?.batch?.id === 'string')
              batchId = json.data.batch.id
          } catch {
            /* the page reports the product's actual error */
          }
        })

        await page.getByRole('button', { name: 'New import' }).click()
        await page.getByRole('combobox', { name: 'Import source' }).click()
        await page.getByRole('option', { name: 'Website or sitemap' }).click()
        await page
          .getByLabel('Website address', { exact: true })
          .fill(new URL(profile.entryPath, config.publicFixtureBaseURL!).href)
        await page.getByRole('button', { name: 'Prepare import report' }).click()
        await expect(page.getByRole('heading', { name: 'Saved import report' })).toBeVisible({
          timeout: 60_000,
        })
        expect(batchId, 'the real UI prepare request should create a saved report').toBeTruthy()

        const deadline = Date.now() + 90_000
        let report: DiscoveryReport | undefined
        while (Date.now() < deadline) {
          const data = requireSuccess<{ batch: DiscoveryReport }>(
            await productRequest(page, `/api/document-imports/${encodeURIComponent(batchId!)}`),
            `Discovery report ${profile.id}`,
          )
          report = data.batch
          if (report.status === 'ready' || report.status === 'paused') break
          if (report.status !== 'inspecting')
            throw new Error(`Discovery ${profile.id} entered unexpected state ${report.status}`)
          await page.waitForTimeout(2_000)
        }
        if (!report || report.status !== 'ready')
          throw new Error(
            `Discovery ${profile.id} did not prepare a ready report within 90 seconds; status=${report?.status ?? 'unavailable'} error=${report?.error ?? 'none'}`,
          )

        const expectedUrls = profile.expectedPdfPaths.map(
          (pathname) => new URL(pathname, config.publicFixtureBaseURL!).href,
        )
        assertDiscoveryReport(report, expectedUrls, profile.expectedSourcePages)
        await expect(page.getByRole('button', { name: 'Start conversion' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Start conversion' })).toBeEnabled()
        // This journey stops at the report. It deliberately never admits paid conversion work.
      } finally {
        await context.close()
      }
    })
  }
})
