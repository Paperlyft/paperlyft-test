import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const files = readdirSync('tests/unit')
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => `tests/unit/${file}`)
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit' },
)
process.exitCode = result.status ?? 1
