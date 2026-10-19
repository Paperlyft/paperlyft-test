import { expect, test } from '@playwright/test'
import { loadRuntimeConfig, type AccountKey } from '../../src/config.js'
import {
  ProductDriver,
  productRequest,
  requireSuccess,
  type BrowserIdentity,
} from '../../src/driver/product.js'

const config = loadRuntimeConfig()
const roleKeys: AccountKey[] = ['adminA', 'memberA', 'adminB', 'individual', 'platform']

for (const key of roleKeys) {
  test(`auth.session.${key}: verifies its configured role and tenant @live`, async ({
    browser,
  }) => {
    const account = config.accounts[key]
    test.skip(!account, `Missing dedicated ${key} storageState account`)
    test.skip(
      !account?.expectedSubject,
      `Account ${key} needs expectedSubject in .auth/accounts.json`,
    )
    const context = await browser.newContext({ storageState: account!.storageState })
    const page = await context.newPage()
    try {
      const driver = new ProductDriver(page, config, key)
      await driver.open('/overview')
      const identity = requireSuccess<BrowserIdentity>(
        await productRequest(page, '/api/auth/me'),
        'Signed-in identity',
      )
      expect(identity.authorization?.subject).toBe(account!.expectedSubject)
      expect(identity.authorization?.role ?? identity.session?.role).toBe(account!.expectedRole)
      if (account!.expectedTenantId)
        expect(identity.authorization?.tenantId).toBe(account!.expectedTenantId)
      else if (key === 'platform') expect(identity.authorization?.scope).toBe('platform')
    } finally {
      await context.close()
    }
  })
}

test('tenancy.cross-tenant-document-read: a tenant cannot read the other tenant document @live', async ({
  browser,
}) => {
  const left = config.accounts.adminA
  const right = config.accounts.adminB
  const documentId = process.env.PAPERLYFT_ISOLATION_DOCUMENT_ID
  test.skip(!left || !right, 'Requires dedicated adminA and adminB sessions')
  test.skip(
    !left?.expectedSubject ||
      !left.expectedTenantId ||
      !right?.expectedSubject ||
      !right.expectedTenantId,
    'Both tenant admins need expectedSubject and expectedTenantId in .auth/accounts.json',
  )
  test.skip(!documentId, 'Set PAPERLYFT_ISOLATION_DOCUMENT_ID to a dedicated adminA document id')
  test.skip(
    left!.expectedTenantId === right!.expectedTenantId,
    'adminA and adminB must belong to distinct tenants',
  )
  const context = await browser.newContext({ storageState: right!.storageState })
  const page = await context.newPage()
  try {
    const driver = new ProductDriver(page, config, 'adminB')
    await driver.open('/queue')
    await driver.assertAccountIdentity()
    const result = await productRequest(page, `/api/documents/${encodeURIComponent(documentId!)}`)
    expect([403, 404]).toContain(result.status)
  } finally {
    await context.close()
  }
})
