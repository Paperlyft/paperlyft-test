import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  assertProcessingAllowed,
  assertRunAllowed,
  assertWithinBudget,
  loadRuntimeConfig,
  type AccountKey,
} from '../../src/config.js'
import { reserveBudget } from '../../src/budget.js'
import {
  ProductDriver,
  productRequest,
  requireSuccess,
  withLibrarySettings,
} from '../../src/driver/product.js'

const config = loadRuntimeConfig()
const accountKey: AccountKey = 'adminA'
const account = config.accounts[accountKey]
type ImportBatch = {
  id: string
  revision: number
  status: string
  outputFormat?: 'pdf' | 'html'
  pagePriceCents?: number
  estimatedChargeCents?: number
  sourcePages: number
}

test('imports.prepare-idempotency: repeated identical preparation returns one saved report @live @mutation', async ({
  browser,
}) => {
  test.skip(!account, `Missing dedicated ${accountKey} storageState account`)
  test.skip(
    !account?.expectedSubject || !account.expectedTenantId,
    `Account ${accountKey} needs expectedSubject and expectedTenantId in .auth/accounts.json`,
  )
  test.skip(
    !config.publicFixtureBaseURL,
    'Set PAPERLYFT_PUBLIC_FIXTURE_BASE_URL to a dedicated public HTTPS fixture host',
  )
  test.skip(
    config.environment === 'production',
    'Import mutation tests are excluded from production',
  )
  test.skip(!config.allowMutations, 'Set the explicit live mutation flag to run product journeys')
  const context = await browser.newContext({ storageState: account!.storageState })
  const page = await context.newPage()
  try {
    const driver = new ProductDriver(page, config, accountKey)
    await driver.open('/uploads')
    await driver.assertAccountIdentity()
    assertRunAllowed(config, { canary: false, mutations: true })
    const key = randomUUID()
    const request = {
      urls: [
        new URL('/simple-1p.pdf', config.publicFixtureBaseURL!).href,
        new URL('/multi-page-3p.pdf', config.publicFixtureBaseURL!).href,
      ],
      mode: 'urls' as const,
      monitor: false,
    }
    const prepare = () =>
      productRequest(page, '/api/document-imports', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: request,
      })
    const first = await prepare()
    const repeated = await prepare()
    const firstBatch = requireSuccess<{ batch: { id: string } }>(first, 'Import prepare')
    const repeatedBatch = requireSuccess<{ batch: { id: string } }>(
      repeated,
      'Repeated import prepare',
    )
    expect(repeatedBatch.batch.id).toBe(firstBatch.batch.id)
  } finally {
    await context.close()
  }
})

test('imports.public-url-conversion: prepares a public URL import, reviews its quote, and starts real conversion @live @mutation', async ({
  browser,
}) => {
  test.setTimeout(900_000)
  test.skip(!account, `Missing dedicated ${accountKey} storageState account`)
  test.skip(
    !account?.expectedSubject || !account.expectedTenantId,
    `Account ${accountKey} needs expectedSubject and expectedTenantId in .auth/accounts.json`,
  )
  test.skip(
    !config.publicFixtureBaseURL,
    'Set PAPERLYFT_PUBLIC_FIXTURE_BASE_URL to a dedicated public HTTPS fixture host; the importer rejects loopback/private hosts',
  )
  test.skip(
    config.environment === 'production',
    'Bulk conversion is excluded from production canaries',
  )
  test.skip(!config.allowMutations, 'Set the explicit live mutation flag to run product processing')
  test.skip(
    !config.allowPaidProcessing,
    'Set PAPERLYFT_ALLOW_PAID_PROCESSING=1 only after explicit authorization to run paid provider processing',
  )

  const context = await browser.newContext({ storageState: account!.storageState })
  const page = await context.newPage()
  const driver = new ProductDriver(page, config, accountKey)
  let prepared: ImportBatch | undefined
  try {
    await driver.open('/uploads')
    await driver.assertAccountIdentity()
    assertRunAllowed(config, { canary: false, mutations: true })
    await withLibrarySettings(
      driver,
      { autoApproveOnQualityPass: false, publishOnApproval: false },
      async () => {
        const fixtureUrls = [
          new URL('/simple-1p.pdf', config.publicFixtureBaseURL!).href,
          new URL('/multi-page-3p.pdf', config.publicFixtureBaseURL!).href,
        ]
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
            /* response body was not JSON; the UI reports the actual failure */
          }
        })
        await page.getByRole('button', { name: 'New import' }).click()
        await page.getByRole('combobox', { name: 'Import source' }).click()
        await page.getByRole('option', { name: 'PDF links' }).click()
        await page.getByLabel('PDF links', { exact: true }).fill(fixtureUrls.join('\n'))
        await page.getByRole('button', { name: 'Prepare import report' }).click()
        await expect(page.getByRole('heading', { name: 'Saved import report' })).toBeVisible({
          timeout: 60_000,
        })
        expect(
          batchId,
          'the actual product prepare request should create a saved report',
        ).toBeTruthy()

        const deadline = Date.now() + 90_000
        while (Date.now() < deadline) {
          const data = requireSuccess<{ batch: ImportBatch }>(
            await productRequest(page, `/api/document-imports/${encodeURIComponent(batchId!)}`),
            'Import report',
          )
          if (data.batch.status === 'ready') {
            prepared = data.batch
            break
          }
          if (data.batch.status !== 'inspecting')
            throw new Error(
              `Import report stopped in ${data.batch.status} before conversion admission`,
            )
          await page.waitForTimeout(2_000)
        }
        if (
          !prepared ||
          !prepared.outputFormat ||
          prepared.pagePriceCents === undefined ||
          prepared.estimatedChargeCents === undefined
        )
          throw new Error('Import report did not provide a verified conversion quote')
        expect(prepared.sourcePages).toBe(4)
        assertWithinBudget(config, {
          sourcePages: prepared.sourcePages,
          costCents: prepared.estimatedChargeCents,
        })
        await reserveBudget(config, {
          sourcePages: prepared.sourcePages,
          costCents: prepared.estimatedChargeCents,
        })
        assertProcessingAllowed(config)
        await page.getByRole('button', { name: 'Start conversion' }).click()

        const runDeadline = Date.now() + 180_000
        let finished = false
        while (Date.now() < runDeadline) {
          const data = requireSuccess<{
            batch: { status: string; items: Array<{ status: string; documentId?: string }> }
          }>(
            await productRequest(page, `/api/document-imports/${encodeURIComponent(batchId!)}`),
            'Started import report',
          )
          const submitted = data.batch.items.filter(
            (item) => item.status === 'submitted' && item.documentId,
          )
          if (data.batch.status === 'completed') {
            expect(submitted, 'both public fixture URLs should be submitted').toHaveLength(2)
            for (const item of submitted) {
              const row = await driver.waitForDocument(item.documentId!, 600_000)
              expect(
                row.presentation.status,
                `Import document ${item.documentId} did not process successfully`,
              ).toBe('ready')
            }
            finished = true
            break
          }
          await page.waitForTimeout(3_000)
        }
        expect(finished, 'the real import should submit and finish its source documents').toBe(true)
      },
    )
  } finally {
    await context.close()
  }
})
