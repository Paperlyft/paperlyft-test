# Implementation plan

Build a standalone acceptance-test repository for https://github.com/Paperlyft/paperlyft-test. Commit and push only with the user's explicit authorization and verified VanGoghCode GitHub identity. The application source used for contract inspection is D:/Code/paperlyft-html-review on new_pipeline; its existing edits belong to the user and must remain untouched.

## Execution stages

1. Offline: validate the harness itself, generate deterministic small PDF fixtures, and test a controllable website lab. This proves fixture and harness behavior, not PaperLyft processing.
2. Local: run real browser journeys against the already configured local PaperLyft stack, using dedicated accounts and real worker/provider processing. Capture authentication interactively; do not bypass MFA or create mock sessions.
3. Staging: repeat acceptance journeys against dedicated staging accounts, with explicit mutation and processing budgets. Public URL imports need a publicly reachable HTTPS fixture lab because the importer deliberately rejects localhost/private network URLs.
4. Production: run a separate, small canary with dedicated accounts and explicit authorization flags and budgets. Exclude stress, destructive administration, real payments, security attacks, and bulk county crawls.

## Workstreams

- Core: TypeScript tooling, environment validation, run budgets, role manifests, doctor checks, browser configuration, orchestration, evidence summaries, CI, documentation, and harness self-tests.
- Fixture lab: deterministic PDFs and URL-list inputs; HTTP website scenarios for HTML/XML sitemaps, nested folders, pagination, duplicate and changed files, redirects, extensionless downloads, content-type errors, 403/404/429/5xx, slow responses, iframes and script-generated links. Explicit capabilities for optional multilingual, scanned, encrypted, malformed and large fixtures.
- Real product journeys: upload and bulk-import preparation/admission; state polling; human approval; all four auto-approval/publication combinations; saved settings restoration; separate account sessions and permission boundaries; error recovery and duplicate submissions.
- Experience and coverage: live UI accessibility/responsive checks; customer-site script integration using the actual script; public reader and withdrawn/private visibility; scenario catalog across customer types, document types/languages, failures, account/billing limits, concurrency and lifecycle events.

## Shared interfaces

The core exports loadRuntimeConfig() from src/config.ts:

```ts
type Environment = 'local' | 'staging' | 'production'
type AccountKey = 'adminA' | 'memberA' | 'adminB' | 'individual' | 'platform'
type Account = {
  storageState: string
  expectedRole: string
  expectedSubject?: string
  expectedTenantId?: string
}
type RuntimeConfig = {
  environment: Environment
  baseURL: string
  labBaseURL: string
  publicFixtureBaseURL?: string
  accounts: Partial<Record<AccountKey, Account>>
  allowMutations: boolean
  allowProdCanary: boolean
  maxSourcePages: number
  maxCostCents: number
  runId: string
  outputDir: string
}
```

The fixture lab exports startLab({host?,port?}?) -> Promise<{baseURL:string;close():Promise<void>}> from src/lab/server.ts, and buildFixtures(outputDir) -> Promise<FixtureManifest> from src/lab/fixtures.ts. Manifest records include id, path, pages (when valid), bytes, sha256, kind, and language. Fixtures must be generated, not downloaded from real customers. Provide src/lab/README.md with exact routes and manifest schema.

The journey adapter lives in src/driver/. Tests use @playwright/test and loadRuntimeConfig(). Live tests have @live; mutating tests also @mutation; production-eligible tests have @canary. Each test requiring an absent role or public fixture source reports an explicit skip reason. The runner must fail readiness if a requested live suite lacks required prerequisites. Never count skipped tests as product acceptance. Avoid product API mocks in this repository.

The experience workstream should use the same config and inspect source contracts directly; coordinate driver reuse with the journey agent. Own tests/e2e/experience.spec.ts, tests/e2e/website-integration.spec.ts, scenarios/catalog.ts, and docs/COVERAGE.md. Each scenario records a stable id, category, priority, environments, implementation status, test file if implemented, prerequisites, and expected observable result. Planned/manual cases must not be represented as automated coverage.

## Acceptance

- Install once, typecheck, and run offline self-tests successfully.
- List/discover live browser tests without credentials or product mocks.
- Doctor clearly identifies missing target/auth/public fixture/budget prerequisites and does not claim live readiness.
- Run real local tests possible with current access. Record exact failures/blockers; don't invent credentials or claim unrun live cases passed.
- Provide commands and examples to progress local -> staging -> production.
- CI runs offline checks on normal events and requires explicit configuration for live suites.
- Leave application-source changes untouched. Publish test-repo changes only when authorized; never change account identity or deploy the product as part of test setup.
- Use the supplied local corpus by reference, with seeded sampling and repeats. Do not copy or commit the original documents.
- Keep paid Gemini/provider processing disabled until explicitly authorized. Initial validation covers offline and read-only checks only.
