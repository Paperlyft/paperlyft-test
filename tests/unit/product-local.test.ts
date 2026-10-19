import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildProductLocalPlan, runProductLocal } from '../../src/product-local.js'
import { PassThrough } from 'node:stream'

test('product-local plan targets installed application Vitest without loading environment files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-local-'))
  try {
    const mainRepo = path.join(root, 'app')
    await mkdir(path.join(mainRepo, 'node_modules', 'vitest'), { recursive: true })
    await writeFile(path.join(mainRepo, 'node_modules', 'vitest', 'vitest.mjs'), '')
    const plan = await buildProductLocalPlan({
      mainRepo,
      harnessRoot: root,
      env: {
        OPENAI_API_KEY: 'hidden',
        LLM_LIVE_TESTS: '1',
        PAPERLYFT_CORPUS_MANIFEST: 'unrelated.json',
      },
    })
    assert.equal(plan.command, process.execPath)
    assert.equal(plan.args[0], path.join(mainRepo, 'node_modules', 'vitest', 'vitest.mjs'))
    assert.ok(plan.args.includes('--reporter=json'))
    assert.ok(plan.args.includes('--reporter=default'))
    assert.equal(plan.environment.LLM_LIVE_TESTS, '0')
    assert.equal(plan.environment.PLYFT_NO_COST_PIPELINE_TESTS, '1')
    assert.equal(plan.environment.PYMUPDF_POOL_SIZE, '1')
    assert.equal(plan.environment.OPENAI_API_KEY, undefined)
    assert.equal(plan.environment.PAPERLYFT_CORPUS_MANIFEST, undefined)
    assert.equal(plan.environment.DOTENV_CONFIG_PATH, undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('product-local plan adds a supplied corpus manifest only when present', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-local-'))
  try {
    const mainRepo = path.join(root, 'app')
    await mkdir(path.join(mainRepo, 'node_modules', 'vitest'), { recursive: true })
    await writeFile(path.join(mainRepo, 'node_modules', 'vitest', 'vitest.mjs'), '')
    const corpus = path.join(root, 'fixtures', 'private', 'corpus.json')
    await mkdir(path.dirname(corpus), { recursive: true })
    await writeFile(corpus, '{}')
    const plan = await buildProductLocalPlan({ mainRepo, harnessRoot: root, env: {} })
    assert.equal(plan.environment.PAPERLYFT_CORPUS_MANIFEST, corpus)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner removes stale JSON and reports a fresh successful result', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-local-'))
  try {
    const mainRepo = await createFakeApp(root)
    const reportPath = path.join(root, 'artifacts', 'result.json')
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(
      reportPath,
      JSON.stringify({ numPassedTests: 99, numFailedTests: 0, numPendingTests: 0 }),
    )
    const result = await runProductLocal({
      mainRepo,
      harnessRoot: root,
      reportPath,
      env: {},
      spawnImpl: mockVitest(3, 0, 0),
    })
    assert.equal(result.status, 'passed')
    assert.equal(result.exitCode, 0)
    assert.equal(result.passedTests, 3)
    assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).numPassedTests, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner marks skipped tests incomplete and does not accept a stale report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-local-'))
  try {
    const mainRepo = await createFakeApp(root)
    const reportPath = path.join(root, 'artifacts', 'result.json')
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(
      reportPath,
      JSON.stringify({ numPassedTests: 99, numFailedTests: 0, numPendingTests: 0 }),
    )
    const skipped = await runProductLocal({
      mainRepo,
      harnessRoot: root,
      reportPath,
      env: {},
      spawnImpl: mockVitest(2, 0, 1),
    })
    assert.equal(skipped.status, 'incomplete')
    assert.equal(skipped.exitCode, 2)
    assert.equal(skipped.skippedTests, 1)
    const missing = await runProductLocal({
      mainRepo,
      harnessRoot: root,
      reportPath,
      env: {},
      spawnImpl: mockWithoutReport(),
    })
    assert.equal(missing.status, 'failed')
    assert.equal(missing.exitCode, 1)
    assert.equal(missing.passedTests, 0)
    await assert.rejects(readFile(reportPath))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner rejects fresh failed test counts even if Vitest exits zero', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-local-'))
  try {
    const mainRepo = await createFakeApp(root)
    const result = await runProductLocal({
      mainRepo,
      harnessRoot: root,
      reportPath: path.join(root, 'artifacts', 'failed.json'),
      env: {},
      spawnImpl: mockVitest(2, 1, 0),
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.exitCode, 1)
    assert.equal(result.failedTests, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function createFakeApp(root: string): Promise<string> {
  const mainRepo = path.join(root, 'app')
  await mkdir(path.join(mainRepo, 'node_modules', 'vitest'), { recursive: true })
  await writeFile(path.join(mainRepo, 'node_modules', 'vitest', 'vitest.mjs'), '')
  return mainRepo
}

function mockVitest(
  passed: number,
  failed: number,
  pending: number,
): typeof import('node:child_process').spawn {
  return ((command: string, args: readonly string[]) => {
    const child = Object.assign(new PassThrough(), {}) as unknown as ReturnType<
      typeof import('node:child_process').spawn
    >
    setImmediate(async () => {
      const outputArg = args.find((argument) => argument.startsWith('--outputFile='))
      if (!outputArg) throw new Error('Vitest command omitted JSON output path')
      const reportPath = outputArg.slice('--outputFile='.length)
      await writeFile(
        reportPath,
        JSON.stringify({
          numPassedTests: passed,
          numFailedTests: failed,
          numPendingTests: pending,
        }),
      )
      child.emit('close', 0, null)
    })
    return child
  }) as typeof import('node:child_process').spawn
}

function mockWithoutReport(): typeof import('node:child_process').spawn {
  return (() => {
    const child = Object.assign(new PassThrough(), {}) as unknown as ReturnType<
      typeof import('node:child_process').spawn
    >
    setImmediate(() => child.emit('close', 0, null))
    return child
  }) as typeof import('node:child_process').spawn
}
