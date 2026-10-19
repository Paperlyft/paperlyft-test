import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProductLocal } from '../src/product-local.js'

const args = process.argv.slice(2)
const flags = new Map<string, string>()
for (let index = 0; index < args.length; index++) {
  const flag = args[index]!
  if (flag === '--help') {
    process.stdout.write(
      'Usage: pnpm test:product-local [--main-repo <path>] [--report <json-path>]\n',
    )
    process.exit(0)
  }
  if (
    !['--main-repo', '--report'].includes(flag) ||
    !args[index + 1] ||
    args[index + 1]!.startsWith('--')
  ) {
    throw new Error('Usage: pnpm test:product-local [--main-repo <path>] [--report <json-path>]')
  }
  flags.set(flag, args[++index]!)
}

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainRepo = path.resolve(
  flags.get('--main-repo') ?? path.join(harnessRoot, '..', 'paperlyft-html-review'),
)
const reportPath = path.resolve(
  flags.get('--report') ?? path.join(harnessRoot, 'artifacts', 'product-local', 'latest.json'),
)

try {
  const result = await runProductLocal({ mainRepo, reportPath, harnessRoot })
  process.stdout.write(
    `Product-local suites ${result.status}: ${result.passedTests} passed, ${result.failedTests} failed, ${result.skippedTests} skipped (exit ${result.exitCode}).\n`,
  )
  process.stdout.write(`Vitest JSON result: ${reportPath}\n`)
  process.stdout.write(
    'These tests exercise selected application modules with test doubles and local fixtures; no paid provider is used.\n',
  )
  if (result.exitCode !== 0) process.exitCode = result.exitCode
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
