import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export type Environment = 'local' | 'staging' | 'production'
export type AccountKey = 'adminA' | 'memberA' | 'adminB' | 'individual' | 'platform'
export type Account = {
  storageState: string
  expectedRole: string
  expectedSubject?: string
  expectedTenantId?: string
}
export type RuntimeConfig = {
  environment: Environment
  baseURL: string
  labBaseURL: string
  publicFixtureBaseURL?: string
  accounts: Partial<Record<AccountKey, Account>>
  allowMutations: boolean
  allowProdCanary: boolean
  allowPaidProcessing: boolean
  maxSourcePages: number
  maxCostCents: number
  runId: string
  outputDir: string
  productionAck?: string
  productionTestSubject?: string
}
const keys: AccountKey[] = ['adminA', 'memberA', 'adminB', 'individual', 'platform']
const defaults: Record<Environment, string> = {
  local: 'http://localhost:3000',
  staging: 'https://staging.paperlyft.com',
  production: 'https://paperlyft.com',
}
const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
function positive(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error('Processing budgets must be positive integer page and cent limits.')
  return parsed
}
function origin(value: string): URL {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('Use an HTTP(S) origin without credentials, query, or fragment.')
  if (url.pathname !== '/') throw new Error('Use a base origin, without a path.')
  return url
}
export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = env.PAPERLYFT_ENV ?? 'local'
  if (!['local', 'staging', 'production'].includes(environment))
    throw new Error('PAPERLYFT_ENV must be local, staging, or production.')
  const target = environment as Environment
  const url = origin(env.PAPERLYFT_BASE_URL ?? defaults[target])
  if (
    target === 'local'
      ? !loopback(url)
      : url.protocol !== 'https:' || url.hostname !== new URL(defaults[target]).hostname
  )
    throw new Error(
      'Base URL does not match the selected environment. Local uses loopback; staging and production use their exact HTTPS hosts.',
    )
  const lab = origin(env.PAPERLYFT_LAB_BASE_URL ?? 'http://127.0.0.1:4179')
  const publicFixture = env.PAPERLYFT_PUBLIC_FIXTURE_BASE_URL
    ? origin(env.PAPERLYFT_PUBLIC_FIXTURE_BASE_URL)
    : undefined
  if (
    publicFixture &&
    (publicFixture.protocol !== 'https:' ||
      loopback(publicFixture) ||
      ['paperlyft.com', 'www.paperlyft.com', 'staging.paperlyft.com'].includes(
        publicFixture.hostname,
      ))
  )
    throw new Error(
      'Public fixture base must be a dedicated public HTTPS host, not PaperLyft or loopback.',
    )
  const manifest = resolve(env.PAPERLYFT_ACCOUNT_MANIFEST ?? `.auth/${target}/accounts.json`)
  const accounts: RuntimeConfig['accounts'] = {}
  if (existsSync(manifest)) {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Account manifest must be an object keyed by account role.')
    for (const [key, item] of Object.entries(parsed)) {
      if (!keys.includes(key as AccountKey)) throw new Error(`Unknown account key: ${key}`)
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.storageState !== 'string' ||
        typeof item.expectedRole !== 'string'
      )
        throw new Error(`Invalid account entry: ${key}`)
      if (item.expectedSubject !== undefined && typeof item.expectedSubject !== 'string')
        throw new Error(`Invalid expected subject: ${key}`)
      if (item.expectedTenantId !== undefined && typeof item.expectedTenantId !== 'string')
        throw new Error(`Invalid expected tenant: ${key}`)
      accounts[key as AccountKey] = { ...item, storageState: resolve(item.storageState) }
    }
  }
  const runId = env.PAPERLYFT_RUN_ID ?? randomUUID()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId))
    throw new Error('Run id must be a short filename-safe identifier.')
  return {
    environment: target,
    baseURL: url.origin,
    labBaseURL: lab.origin,
    publicFixtureBaseURL: publicFixture?.origin,
    accounts,
    allowMutations: env.PAPERLYFT_ALLOW_MUTATIONS === '1',
    allowProdCanary: env.PAPERLYFT_ALLOW_PROD_CANARY === '1',
    allowPaidProcessing: env.PAPERLYFT_ALLOW_PAID_PROCESSING === '1',
    maxSourcePages: positive(env.PAPERLYFT_MAX_SOURCE_PAGES, 10),
    maxCostCents: positive(env.PAPERLYFT_MAX_COST_CENTS, 500),
    runId,
    outputDir: resolve('artifacts', runId),
    productionAck: env.PAPERLYFT_PROD_ACK,
    productionTestSubject: env.PAPERLYFT_PROD_TEST_SUBJECT,
  }
}
export function assertRunAllowed(
  config: RuntimeConfig,
  options: { canary: boolean; mutations: boolean },
): void {
  if (config.environment === 'production') {
    if (
      !options.canary ||
      !config.allowProdCanary ||
      config.productionAck !== 'production-canary' ||
      !config.productionTestSubject
    )
      throw new Error(
        'Production runs require --canary, PAPERLYFT_ALLOW_PROD_CANARY=1, PAPERLYFT_PROD_ACK=production-canary, and a dedicated PAPERLYFT_PROD_TEST_SUBJECT.',
      )
    if (options.mutations)
      throw new Error(
        'Production canaries are read-only in this initial harness. Run conversion journeys locally or on staging.',
      )
  }
  if (options.mutations && !config.allowMutations)
    throw new Error('Set PAPERLYFT_ALLOW_MUTATIONS=1 only for a dedicated test account.')
}
export function assertWithinBudget(
  config: RuntimeConfig,
  planned: { sourcePages: number; costCents: number },
): void {
  if (
    !Number.isSafeInteger(planned.sourcePages) ||
    planned.sourcePages < 1 ||
    !Number.isSafeInteger(planned.costCents) ||
    planned.costCents < 0
  )
    throw new Error('Cannot admit processing without a verified page count and charge estimate.')
  if (planned.sourcePages > config.maxSourcePages || planned.costCents > config.maxCostCents)
    throw new Error('Planned processing exceeds the run page or cost budget.')
}
export function assertProcessingAllowed(config: RuntimeConfig): void {
  assertRunAllowed(config, { canary: false, mutations: true })
  if (!config.allowPaidProcessing)
    throw new Error(
      'Processing is disabled. The user has not authorized paid Gemini/provider runs. Enable PAPERLYFT_ALLOW_PAID_PROCESSING=1 only after explicit authorization.',
    )
}
