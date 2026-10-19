import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadRuntimeConfig } from '../../src/config.js'
import {
  ProductDriver,
  productRequest,
  requireSuccess,
  withLibrarySettings,
} from '../../src/driver/product.js'

test('product adapter keeps requests on the supplied signed-in page', async () => {
  let requestArgument: unknown
  const page = {
    evaluate: async (_fn: unknown, arg: unknown) => {
      requestArgument = arg
      return {
        status: 200,
        body: { success: true, data: { marker: 'real response shape' } },
      }
    },
  }
  const result = await productRequest(page as never, '/api/documents?limit=100')
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { success: true, data: { marker: 'real response shape' } })
  assert.deepEqual(requestArgument, { path: '/api/documents?limit=100', init: {} })
})

test('rejects failed HTTP responses instead of interpreting them as acceptance', () => {
  assert.throws(
    () => requireSuccess({ status: 403, body: { success: false } }, 'Documents'),
    /Documents failed with HTTP 403/,
  )
})

test('rejects malformed success envelopes', () => {
  assert.throws(
    () => requireSuccess({ status: 200, body: { data: {} } }, 'Settings'),
    /Settings returned an invalid success envelope/,
  )
})

test('does not reach a file chooser or upload click without paid-processing authorization', async () => {
  const config = { ...loadRuntimeConfig(), allowMutations: true, allowPaidProcessing: false }
  let selectionAttempted = false
  let clickAttempted = false
  const page = {
    goto: async () => undefined,
    getByLabel: () => {
      selectionAttempted = true
      return { setInputFiles: async () => undefined }
    },
    getByRole: () => ({
      click: async () => {
        clickAttempted = true
      },
    }),
  }
  const driver = new ProductDriver(page as never, config, 'adminA')
  await assert.rejects(driver.uploadPdfBatch(['one.pdf', 'two.pdf']), /Processing is disabled/)
  assert.equal(selectionAttempted, false)
  assert.equal(clickAttempted, false)
})

test('does not restore settings when the post-run document state cannot be verified', async () => {
  let calls = 0
  let updates = 0
  const driver = {
    config: { ...loadRuntimeConfig({}), allowMutations: true },
    assertAccountIdentity: async () => ({}),
    page: {
      evaluate: async () =>
        ++calls === 1
          ? { status: 200, body: { success: true, data: { documents: [] } } }
          : { status: 403, body: { success: false } },
    },
    settings: async () => ({
      revision: 1,
      publishOnApproval: false,
      autoApproveOnQualityPass: false,
    }),
    updateSettings: async () => {
      updates++
      return { revision: 2 }
    },
  }
  await assert.rejects(
    withLibrarySettings(
      driver as never,
      { publishOnApproval: true, autoApproveOnQualityPass: false },
      async () => undefined,
    ),
    /Post-run document list failed/,
  )
  assert.equal(updates, 1)
})
