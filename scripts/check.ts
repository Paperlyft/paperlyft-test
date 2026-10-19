import { spawnSync } from 'node:child_process'
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['--import', 'tsx', 'scripts/test-unit.ts'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    break
  }
}
