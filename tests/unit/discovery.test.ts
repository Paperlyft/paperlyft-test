import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDiscoveryReport, type DiscoveryReport } from '../../src/driver/discovery.js'

const readyReport = (): DiscoveryReport => ({
  status: 'ready',
  mode: 'website',
  monitor: false,
  sourcePages: 4,
  outputFormat: 'pdf',
  estimatedChargeCents: 0,
  pagePriceCents: 25,
  items: [
    { url: 'https://county.example/minutes.pdf', status: 'ready', sourcePages: 3 },
    { url: 'https://county.example/agenda.pdf', status: 'ready', sourcePages: 1 },
  ],
})

test('accepts an exact, quoted, preparation-only discovery report', () => {
  assert.doesNotThrow(() =>
    assertDiscoveryReport(
      readyReport(),
      ['https://county.example/agenda.pdf', 'https://county.example/minutes.pdf'],
      4,
    ),
  )
})

test('rejects discovery that misses or adds an expected source', () => {
  assert.throws(
    () => assertDiscoveryReport(readyReport(), ['https://county.example/agenda.pdf'], 4),
    /URLs did not match/,
  )
})

test('rejects empty expectations, invalid page totals, and the wrong report mode', () => {
  const report = readyReport()
  assert.throws(() => assertDiscoveryReport(report, [], 4), /expectation must include/)
  assert.throws(
    () =>
      assertDiscoveryReport(
        report,
        report.items.map((item) => item.url),
        0,
      ),
    /positive integer/,
  )

  const invalidTotal = readyReport()
  invalidTotal.sourcePages = 0
  assert.throws(
    () =>
      assertDiscoveryReport(
        invalidTotal,
        invalidTotal.items.map((item) => item.url),
        4,
      ),
    /invalid source page count/,
  )

  const wrongMode = readyReport()
  wrongMode.mode = 'urls'
  assert.throws(
    () =>
      assertDiscoveryReport(
        wrongMode,
        wrongMode.items.map((item) => item.url),
        4,
      ),
    /Expected website discovery/,
  )
})

test('rejects failed, unquoted, or already-admitted discovery rows', () => {
  const failed = readyReport()
  failed.items[0]!.status = 'failed'
  assert.throws(
    () =>
      assertDiscoveryReport(
        failed,
        failed.items.map((item) => item.url),
        4,
      ),
    /failed or admitted/,
  )

  const admitted = readyReport()
  admitted.items[0]!.documentId = 'doc_test'
  assert.throws(
    () =>
      assertDiscoveryReport(
        admitted,
        admitted.items.map((item) => item.url),
        4,
      ),
    /converted document id/,
  )

  const unquoted = readyReport()
  unquoted.estimatedChargeCents = undefined
  assert.throws(
    () =>
      assertDiscoveryReport(
        unquoted,
        unquoted.items.map((item) => item.url),
        4,
      ),
    /verified quote/,
  )
})

test('rejects a non-ready report instead of accepting a discovery failure as empty success', () => {
  const paused = readyReport()
  paused.status = 'paused'
  paused.error = 'No public PDF links were found within discovery limits.'
  assert.throws(
    () =>
      assertDiscoveryReport(
        paused,
        paused.items.map((item) => item.url),
        4,
      ),
    /paused, expected ready/,
  )
})

test('rejects automatic monitoring and invalid output formats in a preparation-only report', () => {
  const report = readyReport()
  report.monitor = true
  assert.throws(
    () =>
      assertDiscoveryReport(
        report,
        report.items.map((item) => item.url),
        4,
      ),
    /monitoring/,
  )
  report.monitor = false
  report.outputFormat = 'unknown' as 'pdf'
  assert.throws(
    () =>
      assertDiscoveryReport(
        report,
        report.items.map((item) => item.url),
        4,
      ),
    /verified quote/,
  )
})
