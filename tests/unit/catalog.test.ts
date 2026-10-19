import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenarioCatalog } from '../../scenarios/catalog.js'
import { providerSites } from '../../src/lab/provider-sites.js'

const repository = resolve(fileURLToPath(new URL('../..', import.meta.url)))

test('catalog has unique stable IDs and complete scenario records', () => {
  const ids = scenarioCatalog.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const item of scenarioCatalog) {
    assert.match(item.id, /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/)
    assert.ok(item.expected.trim().length > 10)
    assert.ok(item.prerequisites.length > 0)
    assert.ok(item.environments.length > 0)
    if (item.status === 'automated') {
      assert.match(item.testFile ?? '', /^tests\/e2e\/.+\.spec\.ts$/)
      const testPath = resolve(repository, item.testFile!)
      assert.ok(existsSync(testPath))
      const source = readFileSync(testPath, 'utf8')
      const directId = source.includes(item.id)
      const generatedRoleId =
        item.id.startsWith('auth.session.') &&
        source.includes('auth.session.${key}') &&
        source.includes(`'${item.id.slice('auth.session.'.length)}'`)
      const generatedDiscoveryId =
        item.testFile === 'tests/e2e/website-discovery.spec.ts' &&
        source.includes('imports.discovery.${profile.id}') &&
        providerSites.some(
          (profile) => profile.method === 'html' && item.id === `imports.discovery.${profile.id}`,
        )
      assert.ok(
        directId || generatedRoleId || generatedDiscoveryId,
        `${item.id} must appear in its mapped browser test`,
      )
    } else assert.equal(item.testFile, undefined)
  }
})

test('catalog covers required risk dimensions and keeps production to canaries', () => {
  assert.ok(scenarioCatalog.length >= 100)
  for (const status of ['automated', 'planned', 'manual', 'external-fixture'])
    assert.ok(scenarioCatalog.some((item) => item.status === status))
  for (const prefix of [
    'language.',
    'document.',
    'intake.',
    'lifecycle.',
    'accounts.',
    'security.',
    'billing.',
    'reliability.',
    'accessibility.',
    'privacy.',
    'integration.',
  ])
    assert.ok(scenarioCatalog.some((item) => item.id.startsWith(prefix)))
  for (const item of scenarioCatalog.filter((row) => row.environments.includes('production'))) {
    assert.ok(item.testFile, `${item.id} production eligibility must map to an implemented test`)
    const source = readFileSync(resolve(repository, item.testFile!), 'utf8')
    assert.ok(
      source.split('\n').some((line) => line.includes(item.id) && line.includes('@canary')),
      `${item.id} must have an @canary test title`,
    )
  }
})
