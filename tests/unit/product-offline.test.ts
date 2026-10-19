import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { buildProductOfflinePlan, runProductOffline } from '../../src/product-offline.js'

test('plan selects only offline Node component/integration suites and disables live tests', () => {
  const plan = buildProductOfflinePlan('C:/main-app')
  assert.equal(plan.command, process.execPath)
  assert.deepEqual(plan.args.slice(0, 6), [
    '--import',
    'tsx',
    'tools/run-local-check.ts',
    'vitest',
    'run',
    '--project=node',
  ])
  assert.ok(plan.args.includes('--maxWorkers=1'))
  assert.ok(!plan.args.includes('--passWithNoTests'))
  assert.equal(plan.environmentOverrides.LLM_LIVE_TESTS, '0')
  assert.ok(plan.suites.some((suite) => suite.path.endsWith('document-library-retention.test.ts')))
  assert.ok(plan.suites.some((suite) => suite.path.endsWith('document-import-service.test.ts')))
  assert.ok(plan.suites.every((suite) => suite.category === 'offline-component-integration'))
  assert.ok(plan.suites.every((suite) => !suite.path.includes('/live/')))
})

test('runner strips provider credentials, captures status, and writes a truthful structured artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-offline-'))
  try {
    const reportPath = path.join(root, 'result.json')
    let captured:
      | {
          command: string
          args: readonly string[]
          options: { cwd: string; env: NodeJS.ProcessEnv }
        }
      | undefined
    const spawnMock = ((
      command: string,
      args: readonly string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      captured = { command, args, options }
      const child = Object.assign(new PassThrough(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      }) as unknown as ReturnType<typeof import('node:child_process').spawn>
      setImmediate(() => {
        child.stdout!.emit('data', Buffer.from('3 offline suites passed\n'))
        child.emit('close', 0, null)
      })
      return child
    }) as typeof import('node:child_process').spawn
    const report = await runProductOffline({
      mainRepo: 'C:/main-app',
      reportPath,
      env: { OPENAI_API_KEY: 'must-not-pass', LLM_LIVE_TESTS: '1' },
      spawnImpl: spawnMock,
    })
    assert.equal(captured?.options.cwd, path.resolve('C:/main-app'))
    assert.equal(captured?.options.env.OPENAI_API_KEY, undefined)
    assert.equal(captured?.options.env.LLM_LIVE_TESTS, '0')
    assert.equal(report.result, 'passed')
    assert.equal(report.exitCode, 0)
    assert.equal(report.category, 'offline-component-integration')
    assert.match(report.stdoutTail, /3 offline suites passed/)
    assert.match(report.boundary, /does not establish a full application processing run/i)
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner records a nonzero child result without presenting it as a pass', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-offline-'))
  try {
    const spawnMock = (() => {
      const child = Object.assign(new PassThrough(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      }) as unknown as ReturnType<typeof import('node:child_process').spawn>
      setImmediate(() => child.emit('close', 1, null))
      return child
    }) as typeof import('node:child_process').spawn
    const report = await runProductOffline({
      mainRepo: root,
      reportPath: path.join(root, 'failed.json'),
      spawnImpl: spawnMock,
    })
    assert.equal(report.result, 'failed')
    assert.equal(report.exitCode, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runner retains only the bounded tail of verbose child output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'product-offline-'))
  try {
    const spawnMock = (() => {
      const child = Object.assign(new PassThrough(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      }) as unknown as ReturnType<typeof import('node:child_process').spawn>
      setImmediate(() => {
        child.stdout!.emit('data', Buffer.from('x'.repeat(30_000)))
        child.stdout!.emit('data', Buffer.from('ending'))
        child.emit('close', 0, null)
      })
      return child
    }) as typeof import('node:child_process').spawn
    const report = await runProductOffline({
      mainRepo: root,
      reportPath: path.join(root, 'verbose.json'),
      spawnImpl: spawnMock,
    })
    assert.equal(report.stdoutTail.length, 24_000)
    assert.ok(report.stdoutTail.endsWith('ending'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
