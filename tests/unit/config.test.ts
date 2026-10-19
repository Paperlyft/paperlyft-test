import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadRuntimeConfig,
  assertRunAllowed,
  assertWithinBudget,
  assertProcessingAllowed,
} from '../../src/config.js'

test('defaults to loopback and read-only local settings', () => {
  const config = loadRuntimeConfig({})
  assert.equal(config.environment, 'local')
  assert.equal(config.allowMutations, false)
  assert.match(config.baseURL, /^http:\/\/localhost:/)
})
test('rejects environment confusion and non-HTTPS remote targets', () => {
  for (const env of [
    { PAPERLYFT_ENV: 'staging', PAPERLYFT_BASE_URL: 'https://paperlyft.com' },
    { PAPERLYFT_ENV: 'local', PAPERLYFT_BASE_URL: 'https://staging.paperlyft.com' },
    { PAPERLYFT_ENV: 'production', PAPERLYFT_BASE_URL: 'http://paperlyft.com' },
    { PAPERLYFT_ENV: 'prod' },
  ])
    assert.throws(() => loadRuntimeConfig(env))
})
test('budgets are explicit positive integers and fail closed', () => {
  for (const value of ['0', '-1', 'NaN', '1.5'])
    assert.throws(() => loadRuntimeConfig({ PAPERLYFT_MAX_SOURCE_PAGES: value }))
  const config = loadRuntimeConfig({
    PAPERLYFT_ALLOW_MUTATIONS: '1',
    PAPERLYFT_MAX_SOURCE_PAGES: '2',
    PAPERLYFT_MAX_COST_CENTS: '24',
  })
  assertWithinBudget(config, { sourcePages: 2, costCents: 24 })
  assert.throws(() => assertWithinBudget(config, { sourcePages: 3, costCents: 24 }))
  assert.throws(() => assertWithinBudget(config, { sourcePages: 2, costCents: 25 }))
  assert.throws(() => assertWithinBudget(config, { sourcePages: NaN, costCents: 1 }))
})
test('production accepts only explicitly acknowledged canaries', () => {
  const config = loadRuntimeConfig({ PAPERLYFT_ENV: 'production' })
  assert.throws(() => assertRunAllowed(config, { canary: true, mutations: false }))
  const allowed = loadRuntimeConfig({
    PAPERLYFT_ENV: 'production',
    PAPERLYFT_ALLOW_PROD_CANARY: '1',
    PAPERLYFT_PROD_ACK: 'production-canary',
    PAPERLYFT_PROD_TEST_SUBJECT: 'test-canary',
  })
  assertRunAllowed(allowed, { canary: true, mutations: false })
  assert.throws(() => assertRunAllowed(allowed, { canary: false, mutations: false }))
  assert.throws(() => assertRunAllowed(allowed, { canary: true, mutations: true }))
})
test('public fixture sources must be HTTPS and cannot point to production', () => {
  assert.throws(() =>
    loadRuntimeConfig({ PAPERLYFT_PUBLIC_FIXTURE_BASE_URL: 'http://localhost:4179' }),
  )
  assert.throws(() =>
    loadRuntimeConfig({ PAPERLYFT_PUBLIC_FIXTURE_BASE_URL: 'https://paperlyft.com' }),
  )
})
test('processing remains blocked even when ordinary mutations are enabled', () => {
  assert.throws(
    () => assertProcessingAllowed(loadRuntimeConfig({ PAPERLYFT_ALLOW_MUTATIONS: '1' })),
    /Processing is disabled/,
  )
  assertProcessingAllowed(
    loadRuntimeConfig({ PAPERLYFT_ALLOW_MUTATIONS: '1', PAPERLYFT_ALLOW_PAID_PROCESSING: '1' }),
  )
})
