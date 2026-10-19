import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadCorpus } from '../../src/lab/corpus'
import { inspectImportPdf } from '@/modules/api-routes/src/intake/document-import-inspection'
import { inspectPyMuPdfUpload } from '@/modules/core-engine/src/exec/pymupdf-runner'
import { shutdownPymupdfDaemon } from '@/modules/core-engine/src/exec/pymupdf-daemon'
import { getDocumentSourceKey } from '@/modules/core-engine/server'

// Opt in by supplying the ignored corpus manifest. No original document is copied or uploaded.
const manifestPath = process.env.PAPERLYFT_CORPUS_MANIFEST
const fixtures = manifestPath ? await loadCorpus(manifestPath) : []
const seed = process.env.PAPERLYFT_CORPUS_SEED ?? '42'
const sample = fixtures
  .filter((fixture) => fixture.eligible)
  .sort((a, b) => {
    const rank = (value: string) => createHash('sha256').update(`${seed}:${value}`).digest('hex')
    return rank(a.sha256 ?? '').localeCompare(rank(b.sha256 ?? ''))
  })
  .slice(0, 3)

afterAll(async () => shutdownPymupdfDaemon())

describe.skipIf(!manifestPath)(
  'real customer corpus: import metadata inspection, no conversion',
  () => {
    it('has eligible samples for native cross-checking', () => expect(sample).toHaveLength(3))
    it.each(fixtures.map((fixture, index) => ({ ...fixture, caseId: index + 1 })))(
      'inspects corpus file $caseId against its saved manifest',
      async (fixture) => {
        const metadata = await stat(fixture.path)
        if (metadata.size > 100_000_000) {
          expect(fixture.eligible).toBe(false)
          expect(fixture.sha256).toBeNull()
          return // Size-only inventory check: never allocate an oversized corpus file.
        }
        const bytes = await readFile(fixture.path)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
        if (fixture.eligible) {
          await expect(inspectImportPdf(bytes)).resolves.toEqual({ sourcePages: fixture.pages })
        } else {
          await expect(inspectImportPdf(bytes)).rejects.toThrow()
        }
      },
    )
    it.each(sample.map((fixture, index) => ({ ...fixture, caseId: index + 1 })))(
      'cross-checks sampled corpus file $caseId using real native preflight',
      async (fixture) => {
        const bytes = await readFile(fixture.path)
        const inspected = await inspectPyMuPdfUpload(
          new File([bytes], basename(fixture.path), { type: 'application/pdf' }),
          getDocumentSourceKey(randomUUID()),
          basename(fixture.path),
        )
        expect(inspected.pageCount).toBe(fixture.pages)
        expect(inspected.fileSizeBytes).toBe(bytes.length)
        expect(inspected.encrypted).toBe(false)
      },
    )
  },
)
