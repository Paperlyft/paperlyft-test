import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProductOffline } from '../src/product-offline.js'

const args = process.argv.slice(2)
const flags = new Map<string, string>()
for (let index = 0; index < args.length; index++) {
  const flag = args[index]!
  if (flag === '--help') {
    process.stdout.write(
      'Usage: pnpm test:product-offline [--main-repo <path>] [--report <json-path>]\n',
    )
    process.exit(0)
  }
  if (
    !['--main-repo', '--report'].includes(flag) ||
    !args[index + 1] ||
    args[index + 1]!.startsWith('--')
  )
    throw new Error('Usage: pnpm test:product-offline [--main-repo <path>] [--report <json-path>]')
  flags.set(flag, args[++index]!)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainRepo = path.resolve(
  flags.get('--main-repo') ?? path.join(repoRoot, '..', 'paperlyft-html-review'),
)
const reportPath = path.resolve(
  flags.get('--report') ?? path.join(repoRoot, 'artifacts', 'product-offline', 'latest.json'),
)
const report = await runProductOffline({ mainRepo, reportPath })
process.stdout.write(
  `Offline product suites ${report.result} (exit ${report.exitCode ?? 'unavailable'}).\n`,
)
process.stdout.write(`Structured result: ${reportPath}\n`)
process.stdout.write(`${report.boundary}\n`)
if (report.result !== 'passed')
  process.exitCode = report.exitCode && report.exitCode > 0 ? report.exitCode : 1
