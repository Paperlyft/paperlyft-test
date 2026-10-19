import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { loadRuntimeConfig, type AccountKey, type Account } from '../src/config.js'
const config = loadRuntimeConfig()
const index = process.argv.indexOf('--role')
const role = process.argv[index + 1] as AccountKey
const roles = {
  adminA: 'county_admin',
  memberA: 'county_user',
  adminB: 'county_admin',
  individual: 'individual_user',
  platform: 'platform_admin',
}
if (index < 0 || !(role in roles))
  throw new Error('Usage: pnpm auth --role adminA|memberA|adminB|individual|platform')
const browser = await chromium.launch({
  channel: process.env.PAPERLYFT_BROWSER_CHANNEL ?? 'chrome',
  headless: false,
})
const context = await browser.newContext()
const rl = createInterface({ input: process.stdin, output: process.stdout })
try {
  const page = await context.newPage()
  await page.goto(`${config.baseURL}/login`)
  console.log(
    `Sign in manually to your dedicated ${role} test account and select the correct workspace. MFA stays enabled.`,
  )
  await rl.question('Press Enter here once signed in: ')
  const response = await context.request.get(`${config.baseURL}/api/auth/me`)
  const body = await response.json()
  if (
    !response.ok() ||
    body.success !== true ||
    !body.data?.user?.id ||
    body.data?.session?.role !== roles[role]
  )
    throw new Error('Sign-in identity/role could not be verified; no session saved.')
  const storageState = resolve(`.auth/${config.environment}/${role}.json`)
  await mkdir(dirname(storageState), { recursive: true })
  const manifestPath = resolve(
    process.env.PAPERLYFT_ACCOUNT_MANIFEST ?? `.auth/${config.environment}/accounts.json`,
  )
  let manifest: Partial<Record<AccountKey, Account>> = {}
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await context.storageState({ path: storageState })
  manifest[role] = {
    storageState,
    expectedRole: roles[role],
    expectedSubject: body.data.user.id,
    ...(body.data.authorization?.tenantId
      ? { expectedTenantId: body.data.authorization.tenantId }
      : {}),
  }
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  console.log(
    `Saved ignored session and manifest for ${role}; no password is stored by this script.`,
  )
} finally {
  rl.close()
  await context.close()
  await browser.close()
}
