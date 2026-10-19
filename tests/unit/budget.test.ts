import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadRuntimeConfig } from '../../src/config.js'
import { reserveBudget } from '../../src/budget.js'
test('aggregate reservations stop the run before a second admission exceeds its budget', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paperlyft-test-budget-'))
  try {
    const config = {
      ...loadRuntimeConfig({}),
      outputDir: directory,
      maxSourcePages: 3,
      maxCostCents: 50,
    }
    await reserveBudget(config, { sourcePages: 2, costCents: 20 })
    await assert.rejects(reserveBudget(config, { sourcePages: 2, costCents: 20 }), /exceeds/)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'budget.json'), 'utf8')), {
      sourcePages: 2,
      costCents: 20,
    })
    await assert.rejects(reserveBudget(config, { sourcePages: 1, costCents: 31 }), /exceeds/)
    await reserveBudget(config, { sourcePages: 1, costCents: 30 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
