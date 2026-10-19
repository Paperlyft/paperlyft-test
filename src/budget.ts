import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertWithinBudget, type RuntimeConfig } from './config.js'

/** One Playwright worker, no retries. Reserve before admission and never refund uncertain work. */
export async function reserveBudget(
  config: RuntimeConfig,
  planned: { sourcePages: number; costCents: number },
): Promise<void> {
  await mkdir(config.outputDir, { recursive: true })
  const path = join(config.outputDir, 'budget.json')
  let previous = { sourcePages: 0, costCents: 0 }
  try {
    previous = JSON.parse(await readFile(path, 'utf8')) as typeof previous
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  assertWithinBudget(config, planned)
  const total = {
    sourcePages: previous.sourcePages + planned.sourcePages,
    costCents: previous.costCents + planned.costCents,
  }
  assertWithinBudget(config, total)
  await writeFile(path, JSON.stringify(total, null, 2) + '\n', { mode: 0o600 })
}
