import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process'
import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export type ProductLocalPlan = {
  command: string
  args: string[]
  mainRepo: string
  configPath: string
  reportPath: string
  environment: NodeJS.ProcessEnv
}

export type ProductLocalOptions = {
  mainRepo?: string
  reportPath?: string
  harnessRoot?: string
  env?: NodeJS.ProcessEnv
  spawnImpl?: typeof spawn
}

export type ProductLocalResult = {
  status: 'passed' | 'failed' | 'incomplete'
  exitCode: number
  passedTests: number
  failedTests: number
  skippedTests: number
  reportPath: string
}

const providerCredentials =
  /(?:_API_KEY$|^AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|PROFILE|DEFAULT_PROFILE)$|^GOOGLE_APPLICATION_CREDENTIALS$|^GOOGLE_CLOUD_PROJECT$|^VERTEX_AI_(?:PROJECT|LOCATION)$)/i

export async function buildProductLocalPlan(
  options: ProductLocalOptions = {},
): Promise<ProductLocalPlan> {
  const harnessRoot = path.resolve(options.harnessRoot ?? process.cwd())
  const mainRepo = path.resolve(
    options.mainRepo ?? path.join(harnessRoot, '..', 'paperlyft-html-review'),
  )
  const vitestPath = path.join(mainRepo, 'node_modules', 'vitest', 'vitest.mjs')
  await access(vitestPath)

  const configPath = path.join(harnessRoot, 'vitest.product.config.ts')
  const reportPath = path.resolve(
    options.reportPath ?? path.join(harnessRoot, 'artifacts', 'product-local', 'latest.json'),
  )
  const environment = { ...(options.env ?? process.env) }
  for (const name of Object.keys(environment)) {
    if (providerCredentials.test(name)) delete environment[name]
  }
  environment.LLM_LIVE_TESTS = '0'
  environment.PLYFT_NO_COST_PIPELINE_TESTS = '1'
  environment.PYMUPDF_POOL_SIZE = '1'
  environment.PAPERLYFT_MAIN_REPO = mainRepo

  const corpusManifest = path.join(harnessRoot, 'fixtures', 'private', 'corpus.json')
  delete environment.PAPERLYFT_CORPUS_MANIFEST
  if (await canAccess(corpusManifest)) environment.PAPERLYFT_CORPUS_MANIFEST = corpusManifest
  if (!environment.QPDF_EXECUTABLE) {
    const qpdfPath = await discoverQpdf(environment.ProgramFiles ?? process.env.ProgramFiles)
    if (qpdfPath) environment.QPDF_EXECUTABLE = qpdfPath
  }

  return {
    command: process.execPath,
    args: [
      vitestPath,
      'run',
      '--config',
      configPath,
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    mainRepo,
    configPath,
    reportPath,
    environment,
  }
}

export async function runProductLocal(
  options: ProductLocalOptions = {},
): Promise<ProductLocalResult> {
  const plan = await buildProductLocalPlan(options)
  await mkdir(path.dirname(plan.reportPath), { recursive: true })
  await rm(plan.reportPath, { force: true })
  const child = (options.spawnImpl ?? spawn)(plan.command, plan.args, {
    cwd: plan.mainRepo,
    env: plan.environment,
    stdio: 'inherit',
    windowsHide: true,
  } satisfies SpawnOptions)
  const childExitCode = await waitForExit(child)
  const summary = await readVitestSummary(plan.reportPath)
  if (childExitCode !== 0) {
    return { status: 'failed', exitCode: childExitCode, ...summary, reportPath: plan.reportPath }
  }
  if (!summary.reportValid || summary.failedTests > 0) {
    return { status: 'failed', exitCode: 1, ...summary, reportPath: plan.reportPath }
  }
  if (summary.passedTests === 0 || summary.skippedTests > 0) {
    return { status: 'incomplete', exitCode: 2, ...summary, reportPath: plan.reportPath }
  }
  return { status: 'passed', exitCode: 0, ...summary, reportPath: plan.reportPath }
}

type VitestSummary = Pick<ProductLocalResult, 'passedTests' | 'failedTests' | 'skippedTests'> & {
  reportValid: boolean
}

async function readVitestSummary(reportPath: string): Promise<VitestSummary> {
  try {
    const result: unknown = JSON.parse(await readFile(reportPath, 'utf8'))
    if (!isRecord(result)) return invalidSummary()
    const { numPassedTests, numFailedTests, numPendingTests } = result
    if (
      !Number.isSafeInteger(numPassedTests) ||
      !Number.isSafeInteger(numFailedTests) ||
      !Number.isSafeInteger(numPendingTests)
    )
      return invalidSummary()
    return {
      reportValid: true,
      passedTests: numPassedTests as number,
      failedTests: numFailedTests as number,
      skippedTests: numPendingTests as number,
    }
  } catch {
    return invalidSummary()
  }
}

function invalidSummary(): VitestSummary {
  return { reportValid: false, passedTests: 0, failedTests: 0, skippedTests: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function discoverQpdf(programFiles?: string): Promise<string | undefined> {
  if (process.platform !== 'win32' || !programFiles || !(await canAccess(programFiles)))
    return undefined
  let entries: string[]
  try {
    entries = await readdir(programFiles)
  } catch {
    return undefined
  }
  for (const entry of entries.sort()) {
    if (!/^qpdf(?:[-_ ].*)?$/i.test(entry)) continue
    const candidate = path.join(programFiles, entry, 'bin', 'qpdf.exe')
    if (await canAccess(candidate)) return candidate
  }
  return undefined
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
}
