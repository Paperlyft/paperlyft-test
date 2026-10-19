import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadRuntimeConfig } from '../src/config.js'
import { doctor, suites, type Suite } from '../src/doctor.js'
import { summarizeReport } from '../src/report.js'
import { buildFixtures } from '../src/lab/fixtures.js'
const args = process.argv.slice(2)
const index = args.indexOf('--suite')
const suite = (index >= 0 ? args[index + 1] : 'smoke') as Suite
if (!suites.includes(suite)) throw new Error(`Choose --suite ${suites.join('|')}`)
const config = loadRuntimeConfig()
const files: Record<Suite, string[]> = {
  smoke: ['public-smoke.spec.ts'],
  journeys: ['journeys.spec.ts'],
  corpus: ['corpus.spec.ts'],
  imports: ['bulk-import.spec.ts'],
  roles: ['auth-roles.spec.ts'],
  experience: ['experience.spec.ts'],
  integration: ['website-integration.spec.ts'],
  all: [],
}
const command = ['node_modules/@playwright/test/cli.js', 'test', ...files[suite]]
if (args.includes('--list')) command.push('--list')
else {
  const checks = await doctor(config, suite, args.includes('--canary'))
  for (const check of checks)
    console.log(`${check.ok ? 'PASS' : 'BLOCKED'} ${check.name}: ${check.detail}`)
  if (checks.some((check) => !check.ok)) {
    process.exitCode = 2
    process.exit()
  }
  await mkdir(config.outputDir, { recursive: true })
  await buildFixtures('fixtures/generated')
}
if (config.environment === 'production' || args.includes('--canary'))
  command.push('--grep', '@canary')
if (args.includes('--headed')) command.push('--headed')
const result = spawnSync(process.execPath, command, {
  stdio: 'inherit',
  env: { ...process.env, PAPERLYFT_RUN_ID: config.runId },
})
process.exitCode = result.status ?? 1
if (!args.includes('--list')) {
  try {
    const summary = summarizeReport(
      JSON.parse(await readFile(join(config.outputDir, 'playwright.json'), 'utf8')),
    )
    await writeFile(
      join(config.outputDir, 'summary.json'),
      JSON.stringify({ environment: config.environment, suite, ...summary }, null, 2) + '\n',
    )
    console.log(
      `Acceptance: ${summary.acceptancePassed ? 'PASS' : 'INCOMPLETE/FAILED'} (${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped)`,
    )
    if (!summary.acceptancePassed) process.exitCode = 1
  } catch {
    console.error('No valid browser result report; acceptance is not established.')
    process.exitCode = 1
  }
}
