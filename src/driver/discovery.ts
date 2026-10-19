export type DiscoveryItem = {
  url: string
  status: string
  sourcePages?: number
  documentId?: string
}

export type DiscoveryReport = {
  status: string
  mode: string
  monitor: boolean
  sourcePages: number
  items: DiscoveryItem[]
  error?: string
  outputFormat?: 'pdf' | 'html'
  estimatedChargeCents?: number
  pagePriceCents?: number
}

/** Verify a prepared website-discovery report without admitting conversion work. */
export function assertDiscoveryReport(
  report: DiscoveryReport,
  expectedUrls: readonly string[],
  expectedSourcePages: number,
): void {
  if (expectedUrls.length === 0)
    throw new Error('Discovery expectation must include at least one source URL')
  if (!Number.isSafeInteger(expectedSourcePages) || expectedSourcePages < 1)
    throw new Error('Expected source pages must be a positive integer')
  if (report.mode !== 'website')
    throw new Error(`Expected website discovery, received ${report.mode}`)
  if (report.status !== 'ready')
    throw new Error(`Discovery report is ${report.status}, expected ready`)
  if (report.monitor !== false)
    throw new Error('Preparation-only discovery must leave automatic monitoring disabled')
  if (!Number.isSafeInteger(report.sourcePages) || report.sourcePages < 1)
    throw new Error('Discovery report contains an invalid source page count')
  if (
    !['pdf', 'html'].includes(report.outputFormat ?? '') ||
    !Number.isSafeInteger(report.pagePriceCents) ||
    report.pagePriceCents! < 0 ||
    !Number.isSafeInteger(report.estimatedChargeCents) ||
    report.estimatedChargeCents! < 0
  )
    throw new Error('Discovery report did not contain a verified quote')
  if (report.sourcePages !== expectedSourcePages)
    throw new Error(`Discovery quoted ${report.sourcePages} pages, expected ${expectedSourcePages}`)

  const actualUrls = report.items.map((item) => item.url).sort()
  const expected = [...expectedUrls].sort()
  if (JSON.stringify(actualUrls) !== JSON.stringify(expected)) {
    throw new Error(
      `Discovered URLs did not match. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualUrls)}`,
    )
  }
  if (report.items.some((item) => item.status !== 'ready'))
    throw new Error('Prepared discovery report contains a failed or admitted item')
  if (report.items.some((item) => item.documentId !== undefined))
    throw new Error('Prepared discovery report contains a converted document id')
  if (report.items.reduce((sum, item) => sum + (item.sourcePages ?? 0), 0) !== expectedSourcePages)
    throw new Error('Discovered source page counts do not match the quote')
}
