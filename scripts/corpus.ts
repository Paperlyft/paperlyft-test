import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCorpusManifest, loadCorpus, sampleCorpus } from '../src/lab/corpus.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifest = path.join(repoRoot, 'fixtures', 'private', 'corpus.json')
const args = process.argv.slice(2)
const command = args[0] ?? 'help'
const flags = parseFlags(args.slice(1))

if (command === 'generate') {
  const source = path.resolve(flags.source ?? 'C:/Users/kirta/Downloads/Testing Documents')
  const output = path.resolve(flags.manifest ?? defaultManifest)
  const manifest = await buildCorpusManifest(source)
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const eligible = manifest.fixtures.filter((record) => record.eligible).length
  process.stdout.write(
    `Scanned ${manifest.fixtures.length} PDFs; ${eligible} eligible; manifest: ${output}\n`,
  )
} else if (command === 'sample') {
  const manifestPath = path.resolve(flags.manifest ?? defaultManifest)
  const count = Number(flags.count ?? '8')
  const seed = flags.seed ?? randomUUID()
  const records = await loadCorpus(manifestPath)
  const selected = sampleCorpus(records, count, seed)
  process.stdout.write(
    `${JSON.stringify({ seed, count, samples: selected.map(({ id, path: filePath, pages, bytes, sha256 }) => ({ id, path: filePath, pages, bytes, sha256 })) }, null, 2)}\n`,
  )
} else {
  process.stdout.write(
    'Usage:\n  node --import tsx scripts/corpus.ts generate [--source <directory>] [--manifest <json>]\n  node --import tsx scripts/corpus.ts sample [--manifest <json>] [--count 8] [--seed 42]\n',
  )
}

function parseFlags(tokens: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const value = tokens[++index]
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${token}`)
    result[token.slice(2)] = value
  }
  return result
}
