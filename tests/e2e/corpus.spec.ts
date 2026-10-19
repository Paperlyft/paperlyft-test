import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { test, expect } from '@playwright/test'
import { loadRuntimeConfig, assertProcessingAllowed } from '../../src/config.js'
import { reserveBudget } from '../../src/budget.js'
import { loadCorpus, sampleCorpus } from '../../src/lab/corpus.js'
import { ProductDriver, withLibrarySettings } from '../../src/driver/product.js'

const config = loadRuntimeConfig()
test('corpus.random-real-documents @live @mutation', async ({ browser }, testInfo) => {
  test.setTimeout(30 * 60_000)
  test.skip(!config.allowPaidProcessing, 'Paid Gemini/provider processing has not been authorized.')
  test.skip(!config.accounts.adminA, 'Capture dedicated adminA first.')
  const manifest = process.env.PAPERLYFT_CORPUS_MANIFEST ?? 'fixtures/private/corpus.json'
  test.skip(
    !existsSync(manifest),
    'Index the user-supplied PDF folder first with pnpm corpus generate.',
  )
  assertProcessingAllowed(config)
  const seed = process.env.PAPERLYFT_CORPUS_SEED ?? config.runId
  const count = Number(process.env.PAPERLYFT_CORPUS_COUNT ?? 2)
  const selected = sampleCorpus(await loadCorpus(manifest), count, seed)
  // Check original bytes and page counts again before reserving work; local files may have changed.
  for (const item of selected) {
    const bytes = await readFile(item.path)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(item.pages)
  }
  const pages = selected.reduce((sum, item) => sum + item.pages!, 0)
  const context = await browser.newContext({ storageState: config.accounts.adminA!.storageState })
  try {
    const page = await context.newPage()
    const driver = new ProductDriver(page, config, 'adminA')
    await driver.open('/uploads')
    await driver.assertAccountIdentity()
    const quote = await driver.quote(pages)
    await reserveBudget(config, { sourcePages: pages, costCents: quote.estimatedChargeCents })
    // A run records the random seed and hashes, never copies private source documents into reports.
    await testInfo.attach('sample.json', {
      body: JSON.stringify({
        seed,
        count,
        sha256: selected.map((item) => item.sha256),
        sourcePages: pages,
      }),
      contentType: 'application/json',
    })
    await withLibrarySettings(
      driver,
      { autoApproveOnQualityPass: false, publishOnApproval: false },
      async () => {
        for (const item of selected) {
          const documentId = await driver.uploadPdf(item.path)
          const result = await driver.waitForDocument(documentId)
          expect(result.presentation.status).toBe('ready')
          await driver.assertPrivateFromPublicReader(documentId)
          await driver.approveThroughUi(documentId)
          const after = await driver.waitForLibrary(
            documentId,
            (view) => (view.approvedFormats?.length ?? 0) > 0,
          )
          expect(Boolean(after.published)).toBe(false)
        }
      },
    )
  } finally {
    await context.close()
  }
})
