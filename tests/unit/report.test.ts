import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeReport } from '../../src/report.js'
const report = (statuses: string[]) => ({
  suites: [
    {
      specs: statuses.map((status) => ({
        tests: [
          {
            status,
            results: [
              {
                status:
                  status === 'expected' ? 'passed' : status === 'unexpected' ? 'failed' : status,
              },
            ],
          },
        ],
      })),
    },
  ],
})
test('only a run with executed passes and no omissions passes acceptance', () => {
  assert.equal(summarizeReport(report(['expected'])).acceptancePassed, true)
  for (const statuses of [
    [],
    ['skipped'],
    ['expected', 'skipped'],
    ['expected', 'unexpected'],
    ['expected', 'flaky'],
  ])
    assert.equal(summarizeReport(report(statuses)).acceptancePassed, false)
  assert.equal(summarizeReport({ ...report(['expected']), errors: [{}] }).acceptancePassed, false)
})
