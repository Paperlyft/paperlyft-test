import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { loadRuntimeConfig, assertWithinBudget, type AccountKey } from '../../src/config.js'
import { reserveBudget } from '../../src/budget.js'
import { ProductDriver, withLibrarySettings } from '../../src/driver/product.js'

const config = loadRuntimeConfig()
const accountKey: AccountKey = 'adminA'
const account = config.accounts[accountKey]
const fixtureRoot = process.env.PAPERLYFT_FIXTURE_DIR ?? 'fixtures/generated'
const fixturePath = path.resolve(fixtureRoot, 'simple-1p.pdf')

async function verifyFixture(filename: string): Promise<number> {
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8')) as {
    fixtures: Array<{ path: string; pages: number | null; bytes: number; sha256: string }>
  }
  const sample = manifest.fixtures.find((item) => item.path === filename)
  if (!sample?.pages || !sample.sha256)
    throw new Error(`Generated ${filename} fixture is missing or invalid`)
  const bytes = await readFile(path.resolve(fixtureRoot, filename))
  if (
    bytes.length !== sample.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== sample.sha256
  )
    throw new Error(`Generated ${filename} fixture did not match its manifest size and SHA-256`)
  return sample.pages
}

test.describe('real product processing and publication @live @mutation', () => {
  test('processing.settings-matrix.configured-output: uploads, processes, approves, and exercises all approval/publication settings', async ({
    browser,
  }) => {
    test.setTimeout(900_000)
    test.skip(!account, `Missing dedicated ${accountKey} storageState account`)
    test.skip(
      !account?.expectedSubject || !account.expectedTenantId,
      `Account ${accountKey} needs expectedSubject and expectedTenantId in .auth/accounts.json`,
    )
    test.skip(
      config.environment === 'production',
      'Production only permits the separately budgeted read-only canary',
    )
    test.skip(
      !config.allowMutations,
      'Set the explicit live mutation flag to run product processing',
    )
    test.skip(
      !config.allowPaidProcessing,
      'Set PAPERLYFT_ALLOW_PAID_PROCESSING=1 only after explicit authorization to run paid provider processing',
    )
    const pages = await verifyFixture('simple-1p.pdf')
    const fourPageAdmissions = pages * 4
    const context = await browser.newContext({ storageState: account!.storageState })
    const page = await context.newPage()
    const driver = new ProductDriver(page, config, accountKey)
    try {
      await driver.open('/uploads')
      await driver.assertAccountIdentity()
      const quote = await driver.quote(fourPageAdmissions)
      assertWithinBudget(config, {
        sourcePages: fourPageAdmissions,
        costCents: quote.estimatedChargeCents,
      })
      await reserveBudget(config, {
        sourcePages: fourPageAdmissions,
        costCents: quote.estimatedChargeCents,
      })
      const cases = [
        { autoApproveOnQualityPass: false, publishOnApproval: false },
        { autoApproveOnQualityPass: false, publishOnApproval: true },
        { autoApproveOnQualityPass: true, publishOnApproval: false },
        { autoApproveOnQualityPass: true, publishOnApproval: true },
      ] as const
      for (const flags of cases) {
        await withLibrarySettings(driver, flags, async () => {
          const documentId = await driver.uploadPdf(fixturePath)
          const row = await driver.waitForDocument(documentId)
          expect(row.presentation.status).toBe('ready')
          const review = await driver.reviewDetails(documentId)
          const outputFormat = review.outputFormat ?? 'pdf'
          const view = flags.autoApproveOnQualityPass
            ? await driver.waitForLibrary(
                documentId,
                (candidate) =>
                  candidate.automaticApproval !== null && candidate.automaticApproval !== undefined,
              )
            : await driver.library(documentId)
          if (flags.autoApproveOnQualityPass) {
            expect(view.retained).toBe(true)
            expect(view.approvedFormats).toContain(outputFormat)
            expect(view.automaticApproval).toBeTruthy()
          } else {
            expect(Boolean(view.published)).toBe(false)
            expect(review.candidateSha256).toMatch(/^[a-f0-9]{64}$/)
            await driver.assertPrivateFromPublicReader(documentId)
            await driver.approveThroughUi(documentId, outputFormat)
          }
          const afterApproval = await driver.waitForLibrary(
            documentId,
            (candidate) =>
              candidate.approvedFormats?.includes(outputFormat) === true &&
              (!flags.publishOnApproval || candidate.published === true),
          )
          expect(afterApproval.approvedFormats).toContain(outputFormat)
          expect(afterApproval.published).toBe(flags.publishOnApproval)
          if (flags.publishOnApproval)
            await driver.verifyPublicVisibility(documentId, [outputFormat])
          else expect(afterApproval.readerUrl ?? null).toBeNull()
        })
      }
    } finally {
      await context.close()
    }
  })

  test('processing.multi-pdf-upload: uploads and processes a multi-PDF batch @live @mutation', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    test.skip(!account, `Missing dedicated ${accountKey} storageState account`)
    test.skip(
      !account?.expectedSubject || !account.expectedTenantId,
      `Account ${accountKey} needs expectedSubject and expectedTenantId in .auth/accounts.json`,
    )
    test.skip(
      config.environment === 'production',
      'Multi-document processing is excluded from production',
    )
    test.skip(
      !config.allowMutations,
      'Set the explicit live mutation flag to run product processing',
    )
    test.skip(
      !config.allowPaidProcessing,
      'Set PAPERLYFT_ALLOW_PAID_PROCESSING=1 only after explicit authorization to run paid provider processing',
    )
    const files = ['simple-1p.pdf', 'multi-page-3p.pdf']
    const pages = (await Promise.all(files.map(verifyFixture))).reduce(
      (total, count) => total + count,
      0,
    )
    const context = await browser.newContext({ storageState: account!.storageState })
    const page = await context.newPage()
    const driver = new ProductDriver(page, config, accountKey)
    try {
      await driver.open('/uploads')
      await driver.assertAccountIdentity()
      const quote = await driver.quote(pages)
      expect(quote.sourcePages).toBe(4)
      assertWithinBudget(config, {
        sourcePages: quote.sourcePages,
        costCents: quote.estimatedChargeCents,
      })
      await reserveBudget(config, {
        sourcePages: quote.sourcePages,
        costCents: quote.estimatedChargeCents,
      })
      await withLibrarySettings(
        driver,
        { autoApproveOnQualityPass: false, publishOnApproval: false },
        async () => {
          const documentIds = await driver.uploadPdfBatch(
            files.map((file) => path.resolve(fixtureRoot, file)),
          )
          expect(documentIds).toHaveLength(files.length)
          const rows = await Promise.all(
            documentIds.map((documentId) => driver.waitForDocument(documentId)),
          )
          expect(rows.map((row) => row.presentation.status)).toEqual(['ready', 'ready'])
          expect(new Set(rows.map((row) => row.document.documentId)).size).toBe(2)
        },
      )
    } finally {
      await context.close()
    }
  })
})
