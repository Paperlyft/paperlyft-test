export type ScenarioStatus = 'automated' | 'planned' | 'manual' | 'external-fixture'
export type Scenario = Readonly<{
  id: string
  category: string
  priority: 'P0' | 'P1' | 'P2'
  environments: readonly ('local' | 'staging' | 'production')[]
  status: ScenarioStatus
  testFile?: string
  prerequisites: readonly string[]
  expected: string
}>

const cases: Array<[string, string, string, string]> = [
  [
    'canary.public-home',
    'public',
    'P0',
    'Anonymous visitor can load the public home page without an application error.',
  ],
  [
    'canary.private-api-denied',
    'security',
    'P0',
    'Anonymous visitor cannot read the private document API.',
  ],
  [
    'experience.desktop-keyboard',
    'experience',
    'P0',
    'Authenticated admin can reach uploads and operate its primary controls by keyboard.',
  ],
  [
    'experience.mobile-390',
    'experience',
    'P0',
    'At 390px the upload workspace has no horizontal overflow and controls remain usable.',
  ],
  [
    'experience.reader-basic',
    'experience',
    'P0',
    'Anonymous visitor can open an actually published document and see its title and formats.',
  ],
  [
    'experience.reader-private-denied',
    'security',
    'P0',
    'Private or withdrawn document is not served to an anonymous visitor.',
  ],
  [
    'processing.settings-matrix.configured-output',
    'processing',
    'P1',
    'Real uploaded document follows the configured output and approval/publication settings.',
  ],
  [
    'processing.multi-pdf-upload',
    'processing',
    'P1',
    'A real multi-PDF upload creates and processes a separate record for each PDF.',
  ],
  [
    'imports.prepare-idempotency',
    'bulk-import',
    'P1',
    'Repeating the same import preparation request returns one saved report.',
  ],
  [
    'imports.public-url-conversion',
    'bulk-import',
    'P1',
    'A reviewed public URL import starts conversion only after quote and budget checks.',
  ],
  [
    'tenancy.cross-tenant-document-read',
    'security',
    'P0',
    'A second tenant cannot read a document owned by the first tenant.',
  ],
  [
    'corpus.random-real-documents',
    'processing',
    'P2',
    'A deterministic sample of user-supplied PDFs processes without copying private source documents into evidence.',
  ],
  [
    'auth.session.adminA',
    'accounts',
    'P0',
    'The adminA live session matches its configured subject, tenant, and role.',
  ],
  [
    'auth.session.memberA',
    'accounts',
    'P0',
    'The memberA live session matches its configured subject, tenant, and role.',
  ],
  [
    'auth.session.adminB',
    'accounts',
    'P1',
    'The adminB live session matches its configured subject, tenant, and role.',
  ],
  [
    'auth.session.individual',
    'accounts',
    'P1',
    'The individual live session matches its configured subject, tenant, and role.',
  ],
  [
    'auth.session.platform',
    'accounts',
    'P1',
    'The platform live session matches its configured subject, tenant, and role.',
  ],
  [
    'website.script-copy-exact',
    'website',
    'P0',
    'Copied script text exactly matches the script displayed in account settings.',
  ],
  [
    'website.script-loads-on-customer-host',
    'website',
    'P0',
    'Customer fixture host loads the account script and presents public document links.',
  ],
  [
    'website.script-role-visibility',
    'website',
    'P1',
    'Website integration controls are available to county and individual owners only.',
  ],
  [
    'website.script-help',
    'website',
    'P1',
    'Script info and install instructions explain placement and safe publication.',
  ],
  [
    'bulk.modal-default',
    'bulk-import',
    'P0',
    'New import opens with website discovery mode and an actionable website address field.',
  ],
  [
    'bulk.source-help',
    'bulk-import',
    'P1',
    'Help distinguishes public PDF links, website discovery and sitemap input.',
  ],
]

const planned: Array<[string, string, string, string]> = [
  [
    'language.arabic-rtl',
    'language',
    'P1',
    'Arabic text is preserved in logical order and displayed right to left.',
  ],
  [
    'language.chinese-simplified',
    'language',
    'P1',
    'Simplified Chinese characters remain searchable and readable.',
  ],
  [
    'language.japanese',
    'language',
    'P1',
    'Japanese mixed kana and kanji remain searchable and readable.',
  ],
  ['language.korean', 'language', 'P2', 'Hangul text remains searchable and readable.'],
  [
    'language.devanagari',
    'language',
    'P1',
    'Devanagari conjuncts and marks remain correctly shaped.',
  ],
  ['language.bengali', 'language', 'P2', 'Bengali marks and conjuncts remain readable.'],
  ['language.tamil', 'language', 'P2', 'Tamil text remains readable.'],
  ['language.thai', 'language', 'P2', 'Thai combining marks and line breaks remain readable.'],
  [
    'language.hebrew-rtl',
    'language',
    'P2',
    'Hebrew text direction and mixed numerals remain coherent.',
  ],
  ['language.cyrillic', 'language', 'P2', 'Cyrillic text remains searchable and readable.'],
  ['language.greek', 'language', 'P2', 'Greek text remains searchable and readable.'],
  [
    'language.accented-latin',
    'language',
    'P1',
    'Accented Latin names and diacritics remain intact.',
  ],
  [
    'language.mixed-scripts',
    'language',
    'P1',
    'Mixed scripts and language changes retain correct reading order.',
  ],
  [
    'document.clean-digital',
    'document',
    'P1',
    'A text PDF preserves content and produces accessible output.',
  ],
  [
    'document.scanned-ocr',
    'document',
    'P0',
    'A scanned page receives usable text and an accessible reading order.',
  ],
  [
    'document.mixed-scan-digital',
    'document',
    'P1',
    'Mixed scanned and digital pages are handled without losing either.',
  ],
  ['document.multi-column', 'document', 'P1', 'Multi-column content is read in intended order.'],
  ['document.tables', 'document', 'P1', 'Tables retain meaningful headers and row relationships.'],
  [
    'document.forms-static',
    'document',
    'P1',
    'Scanned form labels and marks remain understandable without invented controls.',
  ],
  ['document.map', 'document', 'P1', 'Map artwork is retained with a useful textual explanation.'],
  [
    'document.chart',
    'document',
    'P2',
    'Charts retain source artwork and important relationships in text.',
  ],
  [
    'document.signatures-stamps',
    'document',
    'P1',
    'Signatures, seals and stamps remain authentic and described.',
  ],
  [
    'document.handwriting',
    'document',
    'P2',
    'Handwriting uncertainty is surfaced without fabricated certainty.',
  ],
  [
    'document.rotated-pages',
    'document',
    'P2',
    'Rotated pages preserve orientation and reading sequence.',
  ],
  [
    'document.large-boundary',
    'document',
    'P2',
    'Large document boundary is accepted or rejected with a clear limit.',
  ],
  [
    'document.encrypted',
    'document',
    'P1',
    'Encrypted input is rejected with a clear, recoverable explanation.',
  ],
  [
    'document.malformed',
    'document',
    'P1',
    'Malformed input fails safely without stuck processing state.',
  ],
  ['document.zero-page', 'document', 'P2', 'Empty or zero-page input is rejected clearly.'],
  [
    'document.oversized-page',
    'document',
    'P2',
    'Extreme page dimensions fail safely or render within documented bounds.',
  ],
  [
    'document.unicode-fonts',
    'document',
    'P1',
    'Unicode output embeds usable glyph mappings for copy and assistive tech.',
  ],
  [
    'intake.single-upload',
    'intake',
    'P0',
    'Customer uploads a PDF and sees a real processing record.',
  ],
  [
    'intake.bulk-url-list',
    'intake',
    'P0',
    'Customer imports multiple public PDF URLs and receives an estimate.',
  ],
  [
    'intake.website-crawl',
    'intake',
    'P0',
    'Customer discovers eligible PDFs from a public website.',
  ],
  ['intake.xml-sitemap', 'intake', 'P1', 'Sitemap discovery returns linked public PDFs.'],
  [
    'intake.nested-sitemap',
    'intake',
    'P2',
    'Nested sitemap index is followed within configured page budget.',
  ],
  [
    'intake.extensionless-download',
    'intake',
    'P1',
    'Valid PDF with extensionless URL is detected by content.',
  ],
  ['intake.redirect-chain', 'intake', 'P1', 'Safe redirects resolve and final PDF is identified.'],
  ['intake.duplicate-sources', 'intake', 'P1', 'Duplicate sources are deduplicated and reported.'],
  [
    'intake.changed-file',
    'intake',
    'P1',
    'Daily check detects changed content and retains prior report history.',
  ],
  [
    'intake.third-party-cms',
    'intake',
    'P2',
    'CMS download endpoint is supported when it returns a public PDF.',
  ],
  [
    'intake.http-errors',
    'intake',
    'P1',
    '403, 404, 429 and 5xx sources are individually reported.',
  ],
  [
    'intake.content-type-mismatch',
    'intake',
    'P1',
    'HTML returned from a PDF URL is not treated as a PDF.',
  ],
  [
    'intake.iframe-links',
    'intake',
    'P2',
    'Eligible links inside supported embedded content are discoverable.',
  ],
  [
    'intake.javascript-links',
    'intake',
    'P2',
    'Script-generated link capability is documented and tested where supported.',
  ],
  [
    'intake.ssrf-private-host',
    'security',
    'P0',
    'Private, loopback and link-local destinations are blocked at every redirect.',
  ],
  [
    'intake.ssrf-dns-rebinding',
    'security',
    'P0',
    'DNS changes cannot route a public URL fetch into a private address.',
  ],
  ['intake.ssrf-metadata', 'security', 'P0', 'Cloud metadata service destinations are blocked.'],
  [
    'lifecycle.review-approval',
    'lifecycle',
    'P0',
    'Human reviewer records explicit approval before publication.',
  ],
  [
    'lifecycle.review-rejection',
    'lifecycle',
    'P1',
    'Human reviewer can reject and record a reason.',
  ],
  [
    'lifecycle.auto-approve-only',
    'lifecycle',
    'P1',
    'Auto approval works with publication disabled.',
  ],
  [
    'lifecycle.publish-on-approval-only',
    'lifecycle',
    'P1',
    'Manual approval publishes only when enabled.',
  ],
  [
    'lifecycle.auto-approve-and-publish',
    'lifecycle',
    'P1',
    'Both configured settings publish quality-passing output.',
  ],
  [
    'lifecycle.neither-setting',
    'lifecycle',
    'P1',
    'Neither setting leaves output private for human decision.',
  ],
  ['lifecycle.withdrawal', 'lifecycle', 'P0', 'Withdrawal revokes new public reader access.'],
  ['lifecycle.republication', 'lifecycle', 'P1', 'Republishing creates a fresh public edition.'],
  [
    'lifecycle.version-history',
    'lifecycle',
    'P2',
    'Replacement preserves prior edition history and current pointer.',
  ],
  [
    'lifecycle.stale-approval',
    'lifecycle',
    'P1',
    'Approval against an obsolete revision is rejected.',
  ],
  ['accounts.county-admin', 'accounts', 'P0', 'County administrator sees county-scoped controls.'],
  [
    'accounts.county-member',
    'accounts',
    'P0',
    'County member sees permitted work and cannot change owner settings.',
  ],
  [
    'accounts.individual',
    'accounts',
    'P1',
    'Individual account sees personal library and website controls.',
  ],
  [
    'accounts.platform-operator',
    'accounts',
    'P1',
    'Platform operator sees platform tools without customer leakage.',
  ],
  [
    'accounts.invite-accept',
    'accounts',
    'P1',
    'Invitee joins intended tenant after authenticating.',
  ],
  ['accounts.invite-expired', 'accounts', 'P2', 'Expired invitation is rejected with next steps.'],
  [
    'accounts.role-change',
    'accounts',
    'P1',
    'Role change updates controls on next authenticated view.',
  ],
  [
    'accounts.mfa',
    'accounts',
    'P1',
    'MFA challenge completes without session or return-route loss.',
  ],
  [
    'accounts.session-expiry',
    'accounts',
    'P1',
    'Expired session returns user to sign-in without losing safe navigation intent.',
  ],
  [
    'security.tenant-isolation-read',
    'security',
    'P0',
    'User cannot read another tenant document by guessed identifier.',
  ],
  [
    'security.tenant-isolation-write',
    'security',
    'P0',
    'User cannot mutate another tenant document or settings.',
  ],
  [
    'security.reader-unguessable-id',
    'security',
    'P0',
    'Unpublished content stays unavailable even with a known identifier.',
  ],
  [
    'security.script-no-secret',
    'security',
    'P1',
    'Public integration script contains no credential or signing secret.',
  ],
  [
    'security.external-links',
    'security',
    'P2',
    'Customer site integration does not execute document-supplied script content.',
  ],
  [
    'billing.estimate-no-charge',
    'billing',
    'P0',
    'Preparing an import report does not start paid conversion.',
  ],
  [
    'billing.quota-boundary',
    'billing',
    'P1',
    'Quota boundary is enforced with clear usage and next action.',
  ],
  [
    'billing.insufficient-balance',
    'billing',
    'P1',
    'Unfunded conversion is stopped before work begins.',
  ],
  [
    'billing.price-revision',
    'billing',
    'P1',
    'Stale estimate price requires refreshed consent before start.',
  ],
  [
    'billing.refund-failure',
    'billing',
    'P2',
    'Billing failure recovery preserves a clear auditable state.',
  ],
  [
    'reliability.idempotent-start',
    'reliability',
    'P0',
    'Retrying the same start operation does not duplicate charges or jobs.',
  ],
  [
    'reliability.worker-retry',
    'reliability',
    'P1',
    'Transient worker failure resumes from durable checkpoint.',
  ],
  [
    'reliability.provider-timeout',
    'reliability',
    'P1',
    'Provider timeout reports retryability and retains completed work.',
  ],
  [
    'reliability.partial-pages',
    'reliability',
    'P1',
    'Partial page failure is visible and recoverable without hiding successful pages.',
  ],
  [
    'reliability.cancel',
    'reliability',
    'P2',
    'Cancellation reaches terminal state and releases reserved capacity.',
  ],
  [
    'reliability.monitoring',
    'reliability',
    'P2',
    'Operational events can be correlated to a run without exposing document contents.',
  ],
  [
    'reliability.concurrent-uploads',
    'reliability',
    'P1',
    'Concurrent uploads remain isolated and finish without cross-linking.',
  ],
  [
    'reliability.concurrent-review',
    'reliability',
    'P2',
    'Concurrent reviewers cannot overwrite newer decisions silently.',
  ],
  [
    'accessibility.keyboard-review',
    'accessibility',
    'P0',
    'Review workflow can be completed with keyboard alone.',
  ],
  [
    'accessibility.screen-reader',
    'accessibility',
    'P1',
    'Processing, error and approval changes are announced meaningfully.',
  ],
  [
    'accessibility.focus-dialog',
    'accessibility',
    'P1',
    'Dialog traps focus and restores it to its launcher when closed.',
  ],
  [
    'accessibility.contrast',
    'accessibility',
    'P1',
    'Text, controls and status indicators meet contrast requirements.',
  ],
  [
    'accessibility.zoom-200',
    'accessibility',
    'P1',
    'At 200 percent zoom core tasks remain available without two-dimensional scrolling.',
  ],
  [
    'accessibility.mobile-touch',
    'accessibility',
    'P1',
    'Touch targets and modal actions remain usable on narrow screens.',
  ],
  [
    'privacy.document-delete',
    'privacy',
    'P1',
    'Authorized deletion removes document access and records the outcome.',
  ],
  [
    'privacy.retention',
    'privacy',
    'P2',
    'Retention expiry removes eligible source artifacts while preserving required audit data.',
  ],
  [
    'privacy.export',
    'privacy',
    'P2',
    'Customer can export their data with tenant boundaries intact.',
  ],
  [
    'privacy.audit-log',
    'privacy',
    'P1',
    'Sensitive lifecycle changes record actor, time and target.',
  ],
  [
    'integration.customer-host-csp',
    'website',
    'P1',
    'Script operates under documented customer host CSP requirements.',
  ],
  [
    'integration.customer-host-cors',
    'website',
    'P1',
    'Reader requests work from a separate HTTPS customer origin.',
  ],
  [
    'integration.withdrawal-cache',
    'website',
    'P0',
    'Withdrawn content stops appearing after cache freshness window.',
  ],
  [
    'integration.multiple-documents',
    'website',
    'P1',
    'One installed script upgrades multiple published PDF links.',
  ],
  [
    'integration.no-match',
    'website',
    'P2',
    'Unmatched ordinary links remain usable and unchanged.',
  ],
]

const implemented = new Map<string, string>([
  ['canary.public-home', 'tests/e2e/public-smoke.spec.ts'],
  ['canary.private-api-denied', 'tests/e2e/public-smoke.spec.ts'],
  ['processing.settings-matrix.configured-output', 'tests/e2e/journeys.spec.ts'],
  ['processing.multi-pdf-upload', 'tests/e2e/journeys.spec.ts'],
  ['imports.prepare-idempotency', 'tests/e2e/bulk-import.spec.ts'],
  ['imports.public-url-conversion', 'tests/e2e/bulk-import.spec.ts'],
  ['tenancy.cross-tenant-document-read', 'tests/e2e/auth-roles.spec.ts'],
  ['corpus.random-real-documents', 'tests/e2e/corpus.spec.ts'],
  ['auth.session.adminA', 'tests/e2e/auth-roles.spec.ts'],
  ['auth.session.memberA', 'tests/e2e/auth-roles.spec.ts'],
  ['auth.session.adminB', 'tests/e2e/auth-roles.spec.ts'],
  ['auth.session.individual', 'tests/e2e/auth-roles.spec.ts'],
  ['auth.session.platform', 'tests/e2e/auth-roles.spec.ts'],
  ['experience.desktop-keyboard', 'tests/e2e/experience.spec.ts'],
  ['experience.mobile-390', 'tests/e2e/experience.spec.ts'],
  ['experience.reader-private-denied', 'tests/e2e/website-integration.spec.ts'],
  ['bulk.modal-default', 'tests/e2e/experience.spec.ts'],
  ['website.script-copy-exact', 'tests/e2e/website-integration.spec.ts'],
  ['website.script-loads-on-customer-host', 'tests/e2e/website-integration.spec.ts'],
  ['website.script-role-visibility', 'tests/e2e/website-integration.spec.ts'],
])
const productionCanaries = new Set([
  'canary.public-home',
  'canary.private-api-denied',
  'experience.desktop-keyboard',
  'experience.mobile-390',
  'experience.reader-private-denied',
  'website.script-role-visibility',
  'website.script-copy-exact',
  'website.script-loads-on-customer-host',
  'bulk.modal-default',
])
const manualReview = new Set([
  'document.map',
  'document.handwriting',
  'accessibility.screen-reader',
  'accessibility.contrast',
  'accessibility.zoom-200',
])

function prerequisitesFor(id: string, category: string): string[] {
  if (id.startsWith('canary.'))
    return [
      'live target; anonymous browser context',
      'production requires the explicit read-only canary gate',
    ]
  if (id.startsWith('experience.') || id.startsWith('bulk.'))
    return [
      'dedicated adminA session with configured subject, tenant, and county-admin role',
      'live local or staging target',
    ]
  if (id === 'website.script-role-visibility')
    return [
      'dedicated memberA session with configured subject, tenant, and county-user role',
      'live target',
    ]
  if (id.startsWith('website.script-'))
    return [
      'dedicated owner session with configured subject and tenant',
      'website integration enabled on target account',
    ]
  if (id.startsWith('auth.session.'))
    return [
      `dedicated ${id.slice('auth.session.'.length)} session with expected subject, tenant, and role`,
      'live target',
    ]
  if (id === 'tenancy.cross-tenant-document-read')
    return [
      'distinct adminA and adminB tenants with expected identities',
      'dedicated adminA document id',
    ]
  if (id === 'processing.settings-matrix.configured-output' || id === 'processing.multi-pdf-upload')
    return [
      'dedicated adminA session',
      'generated fixture PDFs and processing quote within run budget',
      'explicit mutation and paid-processing authorization',
    ]
  if (id === 'imports.prepare-idempotency')
    return [
      'dedicated adminA session',
      'public HTTPS fixture host',
      'explicit mutation authorization',
    ]
  if (id === 'imports.public-url-conversion')
    return [
      'dedicated adminA session',
      'public HTTPS fixture host and verified quote',
      'explicit mutation and paid-processing authorization',
      'source-page and cost budget',
    ]
  if (id === 'corpus.random-real-documents')
    return [
      'user-supplied corpus manifest and deterministic sample seed',
      'dedicated adminA session',
      'explicit paid-processing authorization',
      'source-page and cost budget',
    ]
  if (category === 'language')
    return [
      'representative language-specific PDF fixture with licensed fonts and known expected text',
      'local or staging processing target',
    ]
  if (id === 'document.scanned-ocr')
    return [
      'scanned PDF containing linguistic text and expected OCR transcript',
      'OCR-capable local or staging target',
    ]
  if (category === 'document')
    return [
      'generated or licensed PDF fixture for the named document boundary',
      'local or staging processing target',
    ]
  if (category === 'intake')
    return [
      'controlled public HTTPS fixture host with the named HTTP or sitemap behavior',
      'local or staging importer target',
    ]
  if (category === 'lifecycle')
    return [
      'dedicated tenant with isolated document records',
      'explicit mutation authorization for state changes',
    ]
  if (category === 'accounts')
    return [
      'dedicated test identities and isolated tenant records',
      'local or staging authentication target',
    ]
  if (category === 'security')
    return [
      'isolated local or staging target with dedicated test identities and records',
      'security tests must not target production unless explicitly listed as canaries',
    ]
  if (category === 'billing')
    return [
      'dedicated billing test account with bounded test balance or quota',
      'no real payment method',
    ]
  if (category === 'reliability')
    return [
      'isolated local or staging workers and observable run identifiers',
      'fault injection restricted to disposable test resources',
    ]
  if (category === 'accessibility')
    return [
      'supported browser at specified viewport or zoom',
      'assistive technology for manual screen-reader checks',
    ]
  if (category === 'privacy')
    return [
      'dedicated tenant with disposable records and documented retention policy',
      'explicit mutation authorization for deletion',
    ]
  if (category === 'website')
    return [
      'dedicated website owner account and customer-host fixture',
      'published or intentionally private document record as specified',
    ]
  return [
    'live local or staging target',
    'scenario-specific test data and any required account role',
  ]
}

export const scenarioCatalog: readonly Scenario[] = [...cases, ...planned].map(
  ([id, category, priority, expected]) => ({
    id,
    category,
    priority: priority as Scenario['priority'],
    environments: productionCanaries.has(id)
      ? ['local', 'staging', 'production']
      : ['local', 'staging'],
    status: implemented.has(id)
      ? 'automated'
      : manualReview.has(id)
        ? 'manual'
        : id.startsWith('language.') ||
            id.startsWith('document.scanned') ||
            id.startsWith('document.encrypted') ||
            id.startsWith('document.malformed')
          ? 'external-fixture'
          : 'planned',
    ...(implemented.has(id) ? { testFile: implemented.get(id) } : {}),
    prerequisites: prerequisitesFor(id, category),
    expected,
  }),
)
