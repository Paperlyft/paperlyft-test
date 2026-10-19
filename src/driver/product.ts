import { expect, type Page } from '@playwright/test'
import {
  assertProcessingAllowed,
  assertRunAllowed,
  type RuntimeConfig,
  type AccountKey,
} from '../config.js'

export type DocumentRow = {
  document: { documentId: string; fileName: string }
  presentation: {
    status: string
    workflowState: string
    statusLabel: string
    isApproved?: boolean
    progress?: number
  }
}

export type LibraryView = {
  retained: boolean
  documentId?: string
  revision?: number
  outputs?: Array<'pdf' | 'html'>
  approvedFormats?: Array<'pdf' | 'html'>
  pdfApprovalCandidateSha256?: string | null
  published?: boolean
  publishOnApproval?: boolean
  publicationPending?: boolean
  readerUrl?: string | null
  automaticApproval?: { publicationState: string } | null
}

export type BrowserIdentity = {
  user?: { id?: string }
  session?: { role?: string; scope?: string }
  authorization?: { subject?: string; tenantId?: string; role?: string; scope?: string }
}

type Envelope<T> = { success: true; data: T }

/** A real same-origin browser request using the signed-in browser's cookie and CSRF token. */
export async function productRequest<T>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const response = await page.evaluate(
    async ({ path, init }) => {
      const method = init.method ?? 'GET'
      const headers: Record<string, string> = { ...init.headers }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
        const csrfResponse = await fetch('/api/auth/csrf', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!csrfResponse.ok)
          throw new Error(`CSRF initialization failed with HTTP ${csrfResponse.status}`)
        const csrf = (await csrfResponse.json()) as { success?: boolean; data?: { token?: string } }
        if (csrf.success !== true || !csrf.data?.token)
          throw new Error('CSRF initialization returned no token')
        headers['x-csrf-token'] = csrf.data.token
      }
      const result = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers:
          init.body === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store',
      })
      return { status: result.status, body: await result.json() }
    },
    { path, init },
  )
  return response as { status: number; body: T }
}

export function requireSuccess<T>(result: { status: number; body: unknown }, label: string): T {
  if (result.status < 200 || result.status >= 300)
    throw new Error(`${label} failed with HTTP ${result.status}`)
  const value = result.body as Partial<Envelope<T>>
  if (value?.success !== true || value.data === undefined)
    throw new Error(`${label} returned an invalid success envelope`)
  return value.data
}

export class ProductDriver {
  constructor(
    readonly page: Page,
    readonly config: RuntimeConfig,
    readonly account: AccountKey,
  ) {}

  async open(path: string): Promise<void> {
    await this.page.goto(new URL(path, this.config.baseURL).href)
  }

  async assertAccountIdentity(): Promise<BrowserIdentity> {
    const identity = requireSuccess<BrowserIdentity>(
      await productRequest(this.page, '/api/auth/me'),
      'Signed-in identity',
    )
    const expected = this.config.accounts[this.account]
    const actual = identity.authorization
    if (!expected?.expectedSubject || !expected.expectedTenantId)
      throw new Error(
        `Account ${this.account} must declare expectedSubject and expectedTenantId before a live journey`,
      )
    if (actual?.subject !== expected.expectedSubject)
      throw new Error(`Signed-in subject did not match configured account ${this.account}`)
    if (actual?.tenantId !== expected.expectedTenantId)
      throw new Error(`Signed-in tenant did not match configured account ${this.account}`)
    if (actual?.role !== expected.expectedRole && identity.session?.role !== expected.expectedRole)
      throw new Error(`Signed-in role did not match configured account ${this.account}`)
    return identity
  }

  async quote(sourcePages: number): Promise<{ sourcePages: number; estimatedChargeCents: number }> {
    const result = requireSuccess<{
      operation: string
      quote: { sourcePages: number; estimatedChargeCents: number }
    }>(
      await productRequest(this.page, `/api/billing/quote?sourcePages=${sourcePages}`),
      'Processing quote',
    )
    if (
      result.operation !== 'county_billing_quote' ||
      result.quote.sourcePages !== sourcePages ||
      !Number.isSafeInteger(result.quote.estimatedChargeCents) ||
      result.quote.estimatedChargeCents < 0
    )
      throw new Error('Processing quote did not match the planned source pages')
    return result.quote
  }

  async uploadPdf(filePath: string): Promise<string> {
    const [documentId] = await this.uploadPdfBatch([filePath])
    if (!documentId) throw new Error('The upload did not produce a document id')
    return documentId
  }

  async uploadPdfBatch(filePaths: string[]): Promise<string[]> {
    if (filePaths.length < 1) throw new Error('Select at least one PDF')
    await this.open('/uploads')
    assertProcessingAllowed(this.config)
    await this.assertAccountIdentity()
    const before = requireSuccess<{ documents: DocumentRow[] }>(
      await productRequest(this.page, '/api/documents?limit=100&sortBy=createdAt&order=desc'),
      'Pre-upload document list',
    )
    const existingIds = new Set(before.documents.map((item) => item.document.documentId))
    const fileInput = this.page.getByLabel('Upload PDF files')
    await fileInput.setInputFiles(filePaths)
    const uploadLabel =
      filePaths.length === 1 ? /^Upload 1 PDF$/ : new RegExp(`^Upload ${filePaths.length} PDFs$`)
    const uploadButton = this.page.getByRole('button', { name: uploadLabel })
    await expect(uploadButton).toBeVisible()
    await uploadButton.click()
    const documents = []
    for (const filePath of filePaths)
      documents.push(await this.waitForNewDocument(filePath, 120_000, existingIds))
    return documents.map((document) => document.document.documentId)
  }

  async waitForNewDocument(
    filePath: string,
    timeoutMs = 120_000,
    excludedIds: ReadonlySet<string> = new Set(),
  ): Promise<DocumentRow> {
    const filename = filePath.replaceAll('\\', '/').split('/').pop() ?? filePath
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const data = requireSuccess<{ documents: DocumentRow[] }>(
        await productRequest(this.page, '/api/documents?limit=100&sortBy=createdAt&order=desc'),
        'Document list',
      )
      const row = data.documents.find(
        (item) => item.document.fileName === filename && !excludedIds.has(item.document.documentId),
      )
      if (row) return row
      await this.page.waitForTimeout(1500)
    }
    throw new Error(`Upload was not accepted into the document list within ${timeoutMs}ms`)
  }

  async waitForDocument(documentId: string, timeoutMs = 600_000): Promise<DocumentRow> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const data = requireSuccess<{ documents: DocumentRow[] }>(
        await productRequest(this.page, `/api/documents?limit=100&sortBy=createdAt&order=desc`),
        'Document list',
      )
      const row = data.documents.find((item) => item.document.documentId === documentId)
      if (!row) throw new Error(`Document ${documentId} disappeared from the account list`)
      if (
        ['ready', 'failed', 'cancelled', 'rejected', 'scan_rejected'].includes(
          row.presentation.status,
        )
      )
        return row
      await this.page.waitForTimeout(3000)
    }
    throw new Error(`Document ${documentId} did not reach a terminal state within ${timeoutMs}ms`)
  }

  async library(documentId: string): Promise<LibraryView> {
    return requireSuccess<LibraryView>(
      await productRequest(this.page, `/api/documents/${encodeURIComponent(documentId)}/library`),
      'Document library view',
    )
  }

  async waitForLibrary(
    documentId: string,
    predicate: (view: LibraryView) => boolean,
    timeoutMs = 60_000,
  ): Promise<LibraryView> {
    const deadline = Date.now() + timeoutMs
    let latest: LibraryView | undefined
    while (Date.now() < deadline) {
      latest = await this.library(documentId)
      if (predicate(latest)) return latest
      await this.page.waitForTimeout(1_500)
    }
    throw new Error(
      `Document library did not reach the expected state within ${timeoutMs}ms; latest=${JSON.stringify(latest)}`,
    )
  }

  async reviewCandidate(documentId: string): Promise<string> {
    return (await this.reviewDetails(documentId)).candidateSha256
  }

  async reviewDetails(
    documentId: string,
  ): Promise<{ candidateSha256: string; outputFormat?: 'pdf' | 'html' }> {
    const review = requireSuccess<{ candidateSha256: string; outputFormat?: 'pdf' | 'html' }>(
      await productRequest(this.page, `/api/documents/${encodeURIComponent(documentId)}/review`),
      'Review candidate',
    )
    if (!/^[a-f0-9]{64}$/.test(review.candidateSha256))
      throw new Error('Review candidate did not expose a valid artifact SHA-256')
    return review
  }

  async assertPrivateFromPublicReader(documentId: string): Promise<void> {
    const account = this.config.accounts[this.account]
    if (!account?.expectedTenantId)
      throw new Error(`Account ${this.account} has no expected tenant id`)
    const url = new URL('/api/document-reader', this.config.baseURL)
    url.searchParams.set('site', account.expectedTenantId)
    url.searchParams.set('document', documentId)
    const result = await this.page.evaluate(async (target) => {
      const response = await fetch(target, { credentials: 'omit', cache: 'no-store' })
      return response.status
    }, url.href)
    if (result !== 404)
      throw new Error(`Unapproved document returned public reader HTTP ${result}; expected 404`)
  }

  async settings(): Promise<Record<string, unknown> & { revision: number }> {
    return requireSuccess(
      await productRequest(this.page, '/api/document-library/settings'),
      'Library settings',
    )
  }

  async updateSettings(
    current: { revision: number },
    values: { publishOnApproval: boolean; autoApproveOnQualityPass: boolean },
  ): Promise<Record<string, unknown> & { revision: number }> {
    return requireSuccess(
      await productRequest(this.page, '/api/document-library/settings', {
        method: 'PUT',
        body: { revision: current.revision, ...values },
      }),
      'Library settings update',
    )
  }

  async approveThroughUi(documentId: string, outputFormat: 'pdf' | 'html' = 'pdf'): Promise<void> {
    await this.open(`/review/${encodeURIComponent(documentId)}`)
    await this.page.getByRole('button', { name: 'Approve' }).click()
    if (outputFormat === 'html') {
      await this.page.getByLabel('I reviewed the complete HTML and approve this edition.').check()
      await this.page.getByRole('button', { name: 'Approve HTML' }).click()
    } else {
      await this.page
        .getByLabel('I understand the PDF may contain mistakes and approve this version.')
        .check()
      await this.page.getByRole('button', { name: 'Record approval' }).click()
    }
    await expect(
      this.page.getByText(/approval has been recorded|approved and published/i),
    ).toBeVisible({ timeout: 30_000 })
  }

  async verifyPublicVisibility(documentId: string, formats: Array<'pdf' | 'html'>): Promise<void> {
    const view = await this.library(documentId)
    if (!view.published || !view.readerUrl)
      throw new Error('Expected an approved public reader URL')
    const reader = new URL(view.readerUrl, this.config.baseURL)
    const publicData = await this.page.evaluate(
      async (url) => {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
        return { status: response.status, body: await response.json() }
      },
      `${new URL('/api/document-reader', this.config.baseURL).href}?site=${encodeURIComponent(reader.searchParams.get('site') ?? '')}&document=${encodeURIComponent(reader.searchParams.get('document') ?? documentId)}`,
    )
    if (publicData.status !== 200)
      throw new Error(`Public document metadata returned HTTP ${publicData.status}`)
    const metadata = publicData.body as { formats?: unknown[]; downloads?: Record<string, string> }
    for (const format of formats) {
      if (!metadata.formats?.includes(format) || !metadata.downloads?.[format])
        throw new Error(`Public metadata did not advertise ${format.toUpperCase()}`)
      const download = await this.page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
        const bytes = new Uint8Array(await response.arrayBuffer())
        return {
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          signature: String.fromCharCode(...bytes.slice(0, 5)),
        }
      }, metadata.downloads[format]!)
      if (download.status !== 200)
        throw new Error(
          `Published ${format.toUpperCase()} download returned HTTP ${download.status}`,
        )
      if (format === 'pdf' && !download.signature.startsWith('%PDF-'))
        throw new Error('Public PDF download did not contain a PDF signature')
      if (format === 'html' && !download.signature.startsWith('PK'))
        throw new Error('Public HTML package did not contain a ZIP signature')
    }
  }
}

export async function withLibrarySettings<T>(
  driver: ProductDriver,
  values: { publishOnApproval: boolean; autoApproveOnQualityPass: boolean },
  action: () => Promise<T>,
): Promise<T> {
  assertRunAllowed(driver.config, { canary: false, mutations: true })
  await driver.assertAccountIdentity()
  const before = requireSuccess<{ documents: DocumentRow[] }>(
    await productRequest(driver.page, '/api/documents?limit=100&sortBy=createdAt&order=desc'),
    'Pre-run document list',
  )
  const existingIds = new Set(before.documents.map((item) => item.document.documentId))
  const original = await driver.settings()
  const restore = {
    publishOnApproval: Boolean(original.publishOnApproval),
    autoApproveOnQualityPass: Boolean(original.autoApproveOnQualityPass),
  }
  const changed = await driver.updateSettings(original, values)
  try {
    return await action()
  } finally {
    const pending = requireSuccess<{ documents: DocumentRow[] }>(
      await productRequest(driver.page, '/api/documents?limit=100&sortBy=createdAt&order=desc'),
      'Post-run document list',
    )
    const docs = pending.documents
    const unsettled = docs.some(
      (item) =>
        !existingIds.has(item.document.documentId) &&
        !['ready', 'failed', 'cancelled', 'rejected', 'scan_rejected'].includes(
          item.presentation.status,
        ),
    )
    if (!unsettled) await driver.updateSettings(changed, restore)
    else
      console.warn(
        'Library settings remain at the test values because a run-created document is still queued or processing; restore them after it reaches a terminal state.',
      )
  }
}
