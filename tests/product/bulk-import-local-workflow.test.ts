import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { WCAG_PDF_RULE_IDS } from '@/modules/llm-services'
import {
  InMemoryJobStore,
  InMemoryTenantDocumentRepository,
  getDocumentFinalPdfKey,
  getDocumentFinalValidationKey,
  compatibilityDocumentJobSchema,
  type CompatibilityDocumentJob,
} from '@/modules/core-engine/server'
import { InMemoryTenantAuditLedger } from '@/modules/core-engine/tenant-document-server'
import type { DocumentWorkMessage } from '@/modules/core-engine/tenant-document-contracts'
import { DocumentLibraryService } from '@/modules/core-engine/document-library-server'
import { FsHtmlDeliveryStore } from '@/modules/core-engine/html-server'
import { createTenantDocumentWorkerWorkflow } from '@/modules/core-engine/production-worker-runtime'
import { createDocumentLibraryTerminalObserver } from '@/modules/api-routes/src/document-library-retention'
import { createLocalDocumentStorage } from '@/modules/api-routes/src/local-document-storage'
import { createLocalDocumentImportAdmission } from '@/modules/api-routes/src/intake/local-document-import-admission'
import { DocumentImportService } from '@/modules/api-routes/src/intake/document-import-service'
import { DocumentImportStore } from '@/modules/api-routes/src/intake/document-import-store'
import {
  createTestTenantDocumentRecord,
  TEST_TENANT_A,
  TestStorageProvider,
} from '@/modules/api-routes/src/__tests__/route-test-helpers'

const digest = (body: Buffer) => createHash('sha256').update(body).digest('hex')
const tenantId = TEST_TENANT_A
const actor = {
  scope: 'county' as const,
  role: 'county_admin' as const,
  tenantId,
  subject: 'integration-owner',
  sessionId: 'local-integration-session',
}
const now = '2026-10-19T12:00:00.000Z'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/**
 * Joins the production import/admission/tenant-state/library classes on local filesystem stores.
 * The only processing boundary stubbed here is conversion output plus its validator evidence;
 * page extraction, rendering, quality tooling, and any paid model call are deliberately absent.
 */
it.each([
  { autoApprove: false, publish: false },
  { autoApprove: false, publish: true },
  { autoApprove: true, publish: false },
  { autoApprove: true, publish: true },
])(
  'imports, retains and applies PDF settings (auto=$autoApprove, publish=$publish)',
  async ({ autoApprove, publish }) => {
    const root = await mkdtemp(join(tmpdir(), 'paperlyft-local-import-workflow-'))
    roots.push(root)
    const delivery = new FsHtmlDeliveryStore(root)
    const importStore = new DocumentImportStore(delivery)
    const documents = new InMemoryTenantDocumentRepository()
    const jobs = new InMemoryJobStore(() => now)
    const audit = new InMemoryTenantAuditLedger()
    const physicalStorage = new TestStorageProvider()
    const providerSnapshot = createTestTenantDocumentRecord({ tenantId }).providerSnapshot
    const acceptedMessages: Array<{ message: DocumentWorkMessage; job: CompatibilityDocumentJob }> =
      []
    const preparedMessages: DocumentWorkMessage[] = []
    const scopeResolver = {
      async resolve(jobId: string) {
        const parent = (await documents.list(tenantId)).find((record) => record.jobId === jobId)
        if (!parent) throw new Error('No tenant parent for local workflow job')
        if (!('versionId' in parent.source))
          throw new Error('Local workflow source version is missing')
        return {
          internalJobId: jobId,
          tenantId,
          publicDocumentId: parent.documentId,
          sourceVersionId: parent.source.versionId,
        }
      },
    }
    const localStorage = createLocalDocumentStorage(physicalStorage, scopeResolver)
    const library = new DocumentLibraryService(delivery)
    const libraryActor = { tenantId, subject: actor.subject, administrator: false }
    const observer = createDocumentLibraryTerminalObserver({
      library,
      documents,
      jobs,
      storage: localStorage,
      next: { async observeTerminal() {} },
      now: () => now,
    })
    const workerWorkflow = createTenantDocumentWorkerWorkflow(documents, {
      terminalObserver: observer,
    })
    const admission = createLocalDocumentImportAdmission({
      // Admission writes tenant-keyed source bytes before the parent record is created; use the
      // same physical store the normal local upload runtime supplies at that boundary.
      uploadStorage: physicalStorage,
      uploadAdmission: {
        tenantDocuments: documents,
        tenantAudit: audit,
        quoteProcessing: async () => ({ outputFormat: 'pdf', billingPagePriceCents: 0 }),
        providerResolver: { resolveForNewJob: async () => providerSnapshot },
        prepareDocumentWork: async (message) => {
          preparedMessages.push(message)
        },
        nowEpochMilliseconds: () => Date.parse(now),
      },
      queueDispatcher: {
        async submit(command) {
          if (!('job' in command))
            throw new Error('Expected local enqueue command to carry its admitted job')
          const { job } = command
          await jobs.createJob(job)
          const message = preparedMessages.at(-1)
          if (!message) throw new Error('Expected tenant worker work before queue dispatch')
          acceptedMessages.push({ message, job: compatibilityDocumentJobSchema.parse(job) })
        },
      },
    })
    const imported = new DocumentImportService({
      store: importStore,
      fetch: async (url) => ({
        url,
        body: Buffer.from(`%PDF-1.4\nsynthetic public source: ${url}\n%%EOF`),
      }),
      inspect: async () => ({ sourcePages: 1 }),
      quote: async (_tenant, sourcePages) => ({
        outputFormat: 'pdf',
        sourcePages,
        freePages: 1,
        paidPages: 0,
        pagePriceCents: 0,
        estimatedChargeCents: 0,
      }),
      admit: admission,
      enqueue: async () => undefined,
      now: () => now,
    })

    // Consent starts private and manual; a terminal candidate is retained, not made public.
    await library.configure({ ...libraryActor, administrator: true }, 0, publish, autoApprove)
    const agendaUrl = 'https://county.example/records/agenda.pdf'
    const minutesUrl = 'https://county.example/records/minutes.pdf'
    const urls = [agendaUrl, minutesUrl, agendaUrl]
    const batch = await imported.prepare(
      actor,
      { urls, mode: 'urls' },
      'integration-import-operation-01',
    )
    expect(
      (await imported.prepare(actor, { urls, mode: 'urls' }, 'integration-import-operation-01')).id,
    ).toBe(batch.id)
    await imported.process(tenantId, batch.id)
    await imported.process(tenantId, batch.id)
    const ready = await imported.get(actor, batch.id)
    expect(ready.status).toBe('ready')
    expect(ready.counts.total).toBe(2)
    await imported.start(actor, batch.id, {
      revision: ready.revision,
      operationId: '11111111-1111-4111-8111-111111111111',
      outputFormat: 'pdf',
      expectedPagePriceCents: 0,
    })
    await imported.process(tenantId, batch.id)
    await imported.process(tenantId, batch.id)
    const submitted = await imported.get(actor, batch.id)
    expect(submitted.status).toBe('completed')
    expect(submitted.items.map((item) => item.status)).toEqual(['submitted', 'submitted'])
    expect(acceptedMessages).toHaveLength(2)
    const documentIds = acceptedMessages.map(({ message }) => message.documentId)
    expect(new Set(documentIds).size).toBe(2)

    // Deterministic renderer/validator boundary: real tenant transitions and retention still
    // validate the hash-bound artifacts, ownership, page count, and consent for both documents.
    for (const { message, job } of acceptedMessages) {
      expect(message.tenantId).toBe(tenantId)
      expect((await documents.get({ tenantId, documentId: message.documentId }))?.state).toBe(
        'queued',
      )
      expect(
        await documents.get({ tenantId: `tnt_${'b'.repeat(26)}`, documentId: message.documentId }),
      ).toBeNull()
      const parent = (await documents.get({ tenantId, documentId: message.documentId }))!
      await workerWorkflow.recordProcessingState({ message, processingAt: now })
      const finalPdf = Buffer.from(
        `%PDF-1.7\nsynthetic local renderer output: ${message.documentId}\n%%EOF`,
      )
      const pdfHash = digest(finalPdf)
      const finalKey = getDocumentFinalPdfKey(job.jobId)
      const validationKey = getDocumentFinalValidationKey(job.jobId)
      await localStorage.put(finalKey, finalPdf, 'application/pdf')
      const evidence = {
        status: 'passed',
        pageCount: { expected: 1, actual: 1 },
        compositionProvenance: { finalPdfSha256: pdfHash },
        technicalValidationProvenance: { status: 'completed', finalPdfSha256: pdfHash },
        veraPdf: { pass: true, pdfSha256: pdfHash, failedRules: 0, failedChecks: 0, failures: [] },
        visualPreservation: {
          status: 'PASS',
          finalPdfSha256: pdfHash,
          pages: [{ pageNumber: 1, status: 'PASS' }],
        },
        wcag: {
          rules: WCAG_PDF_RULE_IDS.map((ruleId) => ({
            ruleId,
            status: 'PASS',
            pdfSha256: pdfHash,
          })),
        },
        classification: { status: 'passed', issues: [] },
      }
      await localStorage.put(
        validationKey,
        Buffer.from(JSON.stringify(evidence)),
        'application/json',
      )
      await jobs.updateJob(job.jobId, {
        state: 'ready',
        completedAt: now,
        metadata: {
          ...(job.metadata as Record<string, unknown>),
          pageCount: 1,
          finalPdfKey: finalKey,
          finalValidationKey: validationKey,
          extractionResult: { totalPages: 1, approvedPages: 1, failedPages: 0 },
        },
      })
      await workerWorkflow.recordTerminalState({
        key: { tenantId, documentId: parent.documentId },
        jobId: job.jobId,
        attempt: 0,
        state: 'completed',
        terminalAt: now,
        finalArtifact: {
          key: parent.storageKeys.final,
          versionId: `sha256-${pdfHash}`,
          checksumSha256: pdfHash,
          sizeBytes: finalPdf.length,
        },
      })

      let retained = await library.get(libraryActor, parent.documentId)
      if (!retained) throw new Error('Terminal observer did not retain the accepted document')
      if (autoApprove) {
        expect(retained?.approved.pdf).toBe(retained?.outputs.pdf?.id)
        expect(retained?.automaticApproval?.publicationState).toBe(
          publish ? 'published' : 'not_requested',
        )
      } else {
        expect(retained?.publication).toBeNull()
        expect(retained?.approved.pdf).toBeUndefined()
        retained = await library.approve(libraryActor, parent.documentId, retained!.revision, [
          'pdf',
        ])
      }
      if (publish && !autoApprove)
        retained = await library.publish(libraryActor, parent.documentId, retained.revision, {})
      if (publish) {
        expect(retained.publication?.outputs.pdf?.id).toBe(retained.outputs.pdf?.id)
        expect(retained.publication?.original).toBeUndefined()
      } else expect(retained.publication).toBeNull()
      expect(
        await library.get(
          { tenantId: `tnt_${'b'.repeat(26)}`, subject: actor.subject, administrator: false },
          parent.documentId,
        ),
      ).toBeNull()
    }
  },
)
