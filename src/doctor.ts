import { existsSync } from 'node:fs'
import { request } from '@playwright/test'
import { assertRunAllowed, type RuntimeConfig, type AccountKey } from './config.js'
export const suites = [
  'smoke',
  'journeys',
  'corpus',
  'imports',
  'roles',
  'experience',
  'integration',
  'all',
] as const
export type Suite = (typeof suites)[number]
export type Check = { name: string; ok: boolean; detail: string }
export function requiredAccounts(suite: Suite): AccountKey[] {
  if (suite === 'smoke') return []
  if (suite === 'roles' || suite === 'all')
    return ['adminA', 'memberA', 'adminB', 'individual', 'platform']
  return suite === 'integration' ? ['adminA', 'memberA'] : ['adminA']
}
export async function doctor(
  config: RuntimeConfig,
  suite: Suite,
  canary = false,
): Promise<Check[]> {
  const checks: Check[] = []
  const mutations = ['journeys', 'corpus', 'imports', 'all'].includes(suite)
  try {
    assertRunAllowed(config, { canary, mutations })
    checks.push({
      name: 'environment',
      ok: true,
      detail: `${config.environment}: ${config.baseURL}`,
    })
  } catch (error) {
    checks.push({ name: 'environment', ok: false, detail: (error as Error).message })
    return checks
  }
  if (['journeys', 'corpus', 'imports', 'all'].includes(suite))
    checks.push({
      name: 'processing-permission',
      ok: config.allowPaidProcessing,
      detail: config.allowPaidProcessing
        ? 'Explicit processing flag set; budgets are enforced before admissions.'
        : 'Paid Gemini/provider processing is disabled until the user authorizes it.',
    })
  if (suite === 'corpus' || suite === 'all')
    checks.push({
      name: 'local-corpus',
      ok: existsSync(process.env.PAPERLYFT_CORPUS_MANIFEST ?? 'fixtures/private/corpus.json'),
      detail:
        'Generate the ignored local corpus manifest with pnpm corpus generate --source <folder>.',
    })
  const anonymous = await request.newContext({ baseURL: config.baseURL, timeout: 15_000 })
  try {
    const response = await anonymous.get('/', { maxRedirects: 0 })
    checks.push({
      name: 'target',
      ok: response.ok() || [301, 302, 307, 308].includes(response.status()),
      detail: `HTTP ${response.status()}`,
    })
  } catch {
    checks.push({
      name: 'target',
      ok: false,
      detail: 'Target is unreachable; start the real application stack first.',
    })
  } finally {
    await anonymous.dispose()
  }
  for (const key of requiredAccounts(suite)) {
    const account = config.accounts[key]
    if (
      !account ||
      !existsSync(account.storageState) ||
      !account.expectedSubject ||
      (mutations && !account.expectedTenantId)
    ) {
      checks.push({
        name: `account:${key}`,
        ok: false,
        detail: `Capture a dedicated ${key} session with pnpm auth --role ${key}.`,
      })
      continue
    }
    const client = await request.newContext({
      baseURL: config.baseURL,
      storageState: account.storageState,
      timeout: 15_000,
    })
    try {
      const response = await client.get('/api/auth/me')
      const body = (await response.json()) as {
        success?: boolean
        data?: {
          user?: { id?: string }
          session?: { role?: string }
          authorization?: { tenantId?: string }
        }
      }
      const matches =
        response.ok() &&
        body.success === true &&
        body.data?.user?.id === account.expectedSubject &&
        body.data?.session?.role === account.expectedRole &&
        (!account.expectedTenantId ||
          body.data?.authorization?.tenantId === account.expectedTenantId)
      const productionMatches =
        config.environment !== 'production' ||
        account.expectedSubject === config.productionTestSubject
      checks.push({
        name: `account:${key}`,
        ok: Boolean(matches && productionMatches),
        detail:
          matches && productionMatches
            ? 'Session subject and role match the dedicated account.'
            : 'Session is expired, has the wrong identity/role, or is not the declared production canary.',
      })
    } catch {
      checks.push({
        name: `account:${key}`,
        ok: false,
        detail: 'Could not verify this session against the target.',
      })
    } finally {
      await client.dispose()
    }
  }
  if (suite === 'imports' || suite === 'all' || suite === 'integration') {
    checks.push({
      name: 'public-fixtures',
      ok: Boolean(config.publicFixtureBaseURL),
      detail: config.publicFixtureBaseURL
        ? 'Public HTTPS fixture base configured; suite will verify actual routes.'
        : 'Set PAPERLYFT_PUBLIC_FIXTURE_BASE_URL to your own hosted lab. Localhost URL imports are deliberately blocked.',
    })
  }
  return checks
}
