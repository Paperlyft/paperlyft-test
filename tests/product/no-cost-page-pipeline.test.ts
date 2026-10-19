import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { afterAll, expect, it } from 'vitest'
import { shutdownPymupdfDaemon } from '@/modules/core-engine/server'
import { InMemoryJobStore } from '@/modules/core-engine/src/store/job-store'
import { FsStorageProvider } from '@/modules/core-engine/src/store/fs-storage'
import { InMemoryPageJobStore } from '@/modules/core-engine/src/extraction/page-job-store'
import { createPageJobRunner } from '@/modules/core-engine/src/extraction/page-job-executor'
import { createExtractionHandlers } from '@/modules/core-engine/src/extraction/extraction-handlers'
import { createIntakeHandlers } from '@/modules/api-routes/src/intake/intake-handlers'
import type { PageJob, PageJobQueue } from '@/modules/core-engine/server'
import { createNoCostScriptedProvider, MODEL, SOURCE_TEXT } from './no-cost-scripted-provider'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await shutdownPymupdfDaemon()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function createSourcePdf(): Promise<Buffer> {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  const font = await document.embedFont(StandardFonts.HelveticaBold)
  page.drawText(SOURCE_TEXT[0]!, { x: 72, y: 700, size: 22, font, color: rgb(0.05, 0.15, 0.3) })
  page.drawText(SOURCE_TEXT[1]!, { x: 72, y: 655, size: 14, color: rgb(0.1, 0.1, 0.1) })
  return Buffer.from(await document.save())
}

function createMemoryPageQueue(): PageJobQueue & { readonly pending: PageJob[] } {
  const pending: PageJob[] = []
  return {
    pending,
    async enqueue(job) {
      pending.push(job)
    },
    async enqueueMany(jobs) {
      pending.push(...jobs)
    },
    async dequeue() {
      return null
    },
    async acknowledge() {},
    async extendVisibility() {},
    async publishFailure() {},
  }
}

it('parses and rasterizes a real PDF, runs a scripted page worker, then uses the real final merger', async ({
  skip,
}) => {
  if (process.env.PLYFT_NO_COST_PIPELINE_TESTS !== '1')
    skip(
      'Set PLYFT_NO_COST_PIPELINE_TESTS=1 to opt into native PDF, renderer, and PDF/UA integration requirements',
    )
  const directory = await mkdtemp(join(tmpdir(), 'plyft-no-cost-page-pipeline-'))
  temporaryDirectories.push(directory)
  const storage = new FsStorageProvider(directory)
  const documentId = randomUUID()
  const sourceKey = `documents/${documentId}/source/original.pdf`
  await storage.put(sourceKey, await createSourcePdf(), 'application/pdf')

  const intake = createIntakeHandlers(storage)
  const queuedJob = {
    jobId: documentId,
    filename: 'generated-notice.pdf',
    storageKey: sourceKey,
    state: 'preflight',
    metadata: {},
  }
  const preflight = await intake.preflight(queuedJob)
  const preflightMetadata = preflight.metadata as Record<string, unknown>
  const preflightJob = {
    ...queuedJob,
    ...preflight,
    metadata: { ...queuedJob.metadata, ...preflightMetadata },
  }
  const rendering = await intake.rendering(preflightJob)
  const extractionJob = {
    jobId: documentId,
    state: 'intake_complete',
    status: 'processing',
    filename: queuedJob.filename,
    outputFormat: 'pdf',
    metadata: {
      ...preflightJob.metadata,
      ...(rendering.metadata as Record<string, unknown>),
      llmProvider: 'openai',
      llmModel: MODEL,
    },
  }
  const manifest = preflightMetadata.manifest as { totalPages?: number } | undefined
  expect(manifest?.totalPages).toBe(1)
  expect(rendering.nextState).toBe('intake_complete')

  const documents = new InMemoryJobStore()
  await documents.createJob(extractionJob)
  const pageJobs = new InMemoryPageJobStore()
  const pageQueue = createMemoryPageQueue()
  const extraction = createExtractionHandlers(storage, { pageJobStore: pageJobs, pageQueue })
  await extraction.intake_complete(extractionJob)
  expect(pageQueue.pending).toHaveLength(1)

  const scriptedProvider = createNoCostScriptedProvider()
  const runPage = createPageJobRunner(storage, documents, {
    createProvider: () => scriptedProvider,
  })
  const pageJob = pageQueue.pending[0]
  if (!pageJob) throw new Error('Intake did not dispatch a page job')
  const lease = await pageJobs.acquire(
    pageJob.pageJobId,
    'integration-test-worker',
    Date.now(),
    60_000,
  )
  if (!lease) throw new Error('Page-job store did not issue the test worker lease')
  const checkpointKey = await runPage(pageJob, 1)
  await pageJobs.complete(pageJob.pageJobId, 'integration-test-worker', checkpointKey, Date.now())

  const result = await extraction.extracting(extractionJob)
  expect(result).toMatchObject({ nextState: 'ready', progress: 100 })
  const resultMetadata = result.metadata as {
    finalPdfKey?: string
    extractionResult?: { approvedPages?: number }
  }
  expect(resultMetadata.extractionResult?.approvedPages).toBe(1)
  expect(resultMetadata.finalPdfKey).toBeTruthy()
  const finalPdf = await PDFDocument.load(await storage.get(resultMetadata.finalPdfKey!))
  expect(finalPdf.getPageCount()).toBe(1)
  expect(scriptedProvider.calls.length).toBeGreaterThanOrEqual(4)
}, 180_000)
