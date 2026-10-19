import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

export const CORPUS_LIMITS = { maxBytes: 100_000_000, maxPages: 300 } as const
export type CorpusRecord = {
  id: string
  path: string
  pages: number | null
  bytes: number
  sha256: string | null
  eligible: boolean
  reasons: string[]
  error?: string
}
export type CorpusManifest = {
  version: 1
  sourceRoot: string
  limits: typeof CORPUS_LIMITS
  fixtures: CorpusRecord[]
}
export type ScanOptions = { maxBytes?: number; maxPages?: number }

export async function scanCorpus(
  sourceRoot: string,
  options: ScanOptions = {},
): Promise<CorpusRecord[]> {
  const root = path.resolve(sourceRoot)
  const limits = {
    maxBytes: options.maxBytes ?? CORPUS_LIMITS.maxBytes,
    maxPages: options.maxPages ?? CORPUS_LIMITS.maxPages,
  }
  const output: CorpusRecord[] = []
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.pdf') continue
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      const base = { id: encodeURIComponent(relative), path: absolute }
      try {
        const fileInfo = await stat(absolute)
        const bytes = fileInfo.size
        if (bytes > limits.maxBytes) {
          output.push({
            ...base,
            pages: null,
            bytes,
            sha256: null,
            eligible: false,
            reasons: ['size-limit'],
          })
          continue
        }
        const data = await readFile(absolute)
        const sha256 = createHash('sha256').update(data).digest('hex')
        try {
          const pdf = await PDFDocument.load(data)
          const pages = pdf.getPageCount()
          const reasons = pages > limits.maxPages ? ['page-limit'] : []
          output.push({ ...base, pages, bytes, sha256, eligible: reasons.length === 0, reasons })
        } catch (error) {
          output.push({
            ...base,
            pages: null,
            bytes,
            sha256,
            eligible: false,
            reasons: ['parse-error'],
            error: errorMessage(error),
          })
        }
      } catch (error) {
        let bytes = 0
        try {
          bytes = (await stat(absolute)).size
        } catch {
          /* file disappeared or became unreadable */
        }
        output.push({
          ...base,
          pages: null,
          bytes,
          sha256: null,
          eligible: false,
          reasons: ['metadata-error'],
          error: errorMessage(error),
        })
      }
    }
  }
  await visit(root)
  return output
}

export async function buildCorpusManifest(sourceRoot: string): Promise<CorpusManifest> {
  return {
    version: 1,
    sourceRoot: path.resolve(sourceRoot),
    limits: CORPUS_LIMITS,
    fixtures: await scanCorpus(sourceRoot),
  }
}

export async function loadCorpus(manifestPath: string): Promise<CorpusRecord[]> {
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!isCorpusManifest(parsed)) throw new Error('invalid corpus manifest')
  return parsed.fixtures
}

export function sampleCorpus(
  fixtures: readonly CorpusRecord[],
  count: number,
  seed: string | number,
): CorpusRecord[] {
  if (!Number.isSafeInteger(count) || count <= 0)
    throw new Error('sample count must be a positive integer')
  const eligible = fixtures.filter((item) => item.eligible)
  if (eligible.length === 0) throw new Error('no eligible corpus records to sample')
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 0x9e3779b9
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
  return Array.from({ length: count }, () => eligible[Math.floor(next() * eligible.length)]!)
}

function isCorpusManifest(value: unknown): value is CorpusManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CorpusManifest>
  return (
    candidate.version === 1 &&
    typeof candidate.sourceRoot === 'string' &&
    Array.isArray(candidate.fixtures) &&
    candidate.fixtures.every(isCorpusRecord)
  )
}
function isCorpusRecord(value: unknown): value is CorpusRecord {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CorpusRecord>
  return (
    typeof item.id === 'string' &&
    typeof item.path === 'string' &&
    (typeof item.pages === 'number' || item.pages === null) &&
    typeof item.bytes === 'number' &&
    (typeof item.sha256 === 'string' || item.sha256 === null) &&
    typeof item.eligible === 'boolean' &&
    Array.isArray(item.reasons) &&
    item.reasons.every((reason) => typeof reason === 'string')
  )
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
