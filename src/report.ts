export type RunSummary = {
  passed: number
  failed: number
  skipped: number
  flaky: number
  acceptancePassed: boolean
}
export function summarizeReport(report: unknown): RunSummary {
  if (
    !report ||
    typeof report !== 'object' ||
    !Array.isArray((report as { suites?: unknown }).suites)
  )
    throw new Error('Invalid Playwright report.')
  const result: RunSummary = { passed: 0, failed: 0, skipped: 0, flaky: 0, acceptancePassed: false }
  const visit = (suite: any) => {
    for (const child of suite.suites ?? []) visit(child)
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) {
        const statuses = (test.results ?? []).map((run: any) => run.status as string)
        if (
          test.status === 'skipped' ||
          (statuses.every((status: string) => status === 'skipped') && statuses.length)
        )
          result.skipped++
        else if (test.status === 'flaky') result.flaky++
        else if (test.status === 'expected' && statuses.length && statuses.at(-1) === 'passed')
          result.passed++
        else result.failed++
      }
  }
  for (const suite of (report as any).suites) visit(suite)
  result.failed += Array.isArray((report as any).errors) ? (report as any).errors.length : 0
  result.acceptancePassed =
    result.passed > 0 && result.failed === 0 && result.skipped === 0 && result.flaky === 0
  return result
}
