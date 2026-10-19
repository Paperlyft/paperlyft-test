# PaperLyft real-user tests

A separate test harness for a running PaperLyft application. Use it to exercise actual uploads, processing, approval, publishing, bulk imports, account boundaries, and the website integration script. No application API responses are mocked in live suites.

**Paid Gemini/provider processing is disabled by default. Do not enable it until explicitly authorized.** Offline checks and the public smoke suite never submit documents or call Gemini.

## Start here

Requires Node 22.13+ and pnpm 10.32.0. Browser tests use installed Chrome (or `PAPERLYFT_BROWSER_CHANNEL=msedge`). No Docker stack, cloud resources, or browser downloads are created by this repo.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
Copy-Item .env.example .env.local
pnpm check
pnpm fixtures
pnpm doctor --suite smoke
pnpm e2e --suite smoke
```

Run the PaperLyft application and worker using that application's existing development instructions first. The default target is `http://localhost:3000`; this repo does not start, reconfigure, or stop your application. Harness tests run with one browser worker and no automatic retries.

## Real document corpus

Use the supplied `C:\Users\kirta\Downloads\Testing Documents` folder through the corpus command documented in [docs/CORPUS.md](docs/CORPUS.md). It indexes PDFs locally and selects a reproducible random sample, with repeats allowed. Original documents are never modified or committed. Generated manifests and downloaded/browser evidence are ignored by Git.

The fixture generator also provides small synthetic PDFs, a scan-like raster PDF, corrupt inputs, and 299/300/301-page boundary files. Arabic/CJK/Indic OCR quality requires appropriate real corpus documents; a synthetic English fixture is not evidence of those capabilities.

## Dedicated accounts

Capture test sessions manually so normal sign-in and MFA remain in place:

```powershell
pnpm auth --role adminA
pnpm auth --role memberA
pnpm auth --role adminB
pnpm auth --role individual
```

`adminA` and `memberA` belong to one test organization. `adminB` belongs to a second organization; `individual` is a personal workspace. Optional `platform` is a dedicated platform operator. The script verifies the selected role, records the subject and tenant from the real session, and saves ignored files under `.auth/<environment>/`. It does not provision users, modify permission sets, or store passwords. Session cookies are credentials: never commit or share them. Refresh captures when they expire.

The complete `roles` and `all` suites also require `pnpm auth --role platform`; narrower suites do not. Cross-tenant denial additionally needs `PAPERLYFT_ISOLATION_DOCUMENT_ID` set to a test document owned by `adminA`.

## Suites

| Command                        | Exercises                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm check`                   | Harness self-tests and typecheck; no product processing                                    |
| `pnpm test:lab`                | Local synthetic source-site browser checks; no PaperLyft target or account                 |
| `pnpm test:product-offline`    | Selected real application component suites with their existing test doubles                |
| `pnpm test:product-local`      | Native PDF pipeline with scripted AI, bulk approval lifecycle, and local corpus inspection |
| `pnpm typecheck:product`       | Product integration types against the default sibling application checkout                 |
| `pnpm e2e --suite smoke`       | Anonymous real homepage and protected API rejection                                        |
| `pnpm e2e --suite experience`  | Signed-in desktop/phone accessibility, keyboard and import-dialog defaults                 |
| `pnpm e2e --suite journeys`    | Actual upload, processing, approval, and the four approval/publication combinations        |
| `pnpm e2e --suite corpus`      | Seeded random real PDFs from the supplied corpus, with repeat selections allowed           |
| `pnpm e2e --suite imports`     | Real public URL import preparation, idempotency, reviewed admission and processing         |
| `pnpm e2e --suite discovery`   | Real website-import preparation against public synthetic provider profiles; no conversion  |
| `pnpm e2e --suite roles`       | Dedicated session roles and cross-tenant document denial                                   |
| `pnpm e2e --suite integration` | Script copy, role visibility, private-reader denial and customer-host reader integration   |
| `pnpm e2e --suite all`         | All suites; requires all configured accounts and external prerequisites                    |
| `pnpm e2e:list --suite all`    | List browser tests without executing them                                                  |
| `pnpm coverage`                | Implemented scenarios and explicit remaining gaps                                          |

## Offline application workflow suites

Run the selected application-repository workflow tests without starting the app or calling paid providers:

```powershell
pnpm test:product-offline
```

The command defaults to the sibling `../paperlyft-html-review` checkout. Override it with `--main-repo <path>` and the ignored result location with `--report <json-path>`. It runs the selected Node Vitest files serially, sets `LLM_LIVE_TESTS=0`, and removes common provider credentials from the child environment. Its structured JSON report records the exact command, exit status, suite boundaries, and bounded output tails. Vitest's normal nonzero result for no matching test files is preserved; the command does not enable `--passWithNoTests`.

These are offline component/integration checks, not browser E2E or proof of real document processing. They use generated data, mocked HTTP/provider/storage dependencies, in-memory repositories, and synthetic quality evidence as described per suite in the report. Passing them demonstrates only those selected code paths; it does not verify a paid provider, real cloud storage, a live application stack, or accessibility/reader output.

For the selected cross-repository no-cost Vitest tests under `tests/product/`, run `pnpm test:product-local`. It uses the sibling application checkout by default; `--main-repo <path>` and `--report <json-path>` override the target and ignored JSON artifact. The runner starts that checkout's installed Vitest directly, does not load `.env` files, disables live LLM tests, removes common provider credentials, and passes the local corpus manifest only if it exists. On Windows it may point at an already installed qpdf executable; it never installs one. These tests still use fake providers and local test dependencies; their result is not paid processing or end-to-end production evidence.

The native pipeline requires the application's existing Python dependencies, qpdf, verified PaperLyft WeasyPrint image, and PDF validator runtime. It generates a small PDF and exercises real preflight, rasterization, page tooling and final output assembly. Only the AI authoring and visual decisions are scripted; this does not establish conversion accuracy. The bulk lifecycle test uses a filesystem-backed library with in-memory job/document stores, controlled source responses, and synthetic final artifacts/quality evidence. It tests two unique PDFs plus a duplicate URL across all four approval/publication combinations. No real customer account or website is changed. Missing corpus files are reported as incomplete; skipped cases cannot produce a complete pass. A stale result is removed before each run.

Generate the ignored corpus manifest with `pnpm corpus generate` before the local product suite. This checks import metadata for each supplied file, then cross-checks three seeded samples through native preflight. Oversized files receive metadata checks without reading their full contents. `pnpm typecheck:product` uses the default sibling checkout; the regular `pnpm check` remains independent of an application checkout. The no-cost runs do not prove signed-in browser journeys, cloud deployment behavior, or compatibility with every CMS. See [the run record](docs/LOCAL-TEST-RESULTS.md).

Run `pnpm doctor --suite <name>` before a live suite. A missing prerequisite is reported as blocked. Missing roles/corpus/public documents can cause explicit skips; **any skipped case makes the run incomplete, not a pass**. Expected product failures also fail the suite rather than being converted into successful processing.

## Processing permission and budgets

Only after explicit authorization, set `PAPERLYFT_ALLOW_MUTATIONS=1` and `PAPERLYFT_ALLOW_PAID_PROCESSING=1` in the ignored `.env.local`. Set `PAPERLYFT_MAX_SOURCE_PAGES` and `PAPERLYFT_MAX_COST_CENTS` to the approved run limits. Admissions reserve the verified page count and quoted charge against the aggregate run budget before starting work; uncertain submissions are not refunded. Keep dedicated accounts quiet while tests change their approval/publication settings. Review any interrupted run's remaining documents and settings before another run.

This initial harness does not transact payments, activate paid service, clear real accounts, bypass MFA, or run stress tests. Billing failures, long-running monitoring cycles, uncommon language/layout fixtures, provider outages and other gaps are explicitly listed in [docs/COVERAGE.md](docs/COVERAGE.md). A scenario in that inventory is not a claim it has run successfully.

## Website fixture lab and public imports

```powershell
pnpm lab
```

The lab runs on `http://127.0.0.1:4179`; stop it with Ctrl+C. Routes and capabilities are in [src/lab/README.md](src/lab/README.md). This is a synthetic source website, not a simulated PaperLyft application.

PaperLyft correctly rejects private/loopback source URLs. For actual URL imports, host this lab at a customer-controlled public HTTPS origin and set `PAPERLYFT_PUBLIC_FIXTURE_BASE_URL`. Hosting/tunnel infrastructure is not provisioned automatically. Do not disable SSRF protection. Website-script integration also needs a published document associated with that fixture source; otherwise it reports a missing prerequisite.

Provider-site priorities and known crawler limits are in [docs/PROVIDER-COVERAGE.md](docs/PROVIDER-COVERAGE.md). The discovery suite saves import reports, so it requires a dedicated `adminA` account, a public HTTPS fixture host, a local or staging environment, and `PAPERLYFT_ALLOW_MUTATIONS=1`. Start the hosted fixture lab with `PAPERLYFT_LAB_DISCOVERY_ONLY=1`; the suite checks `/lab-capabilities` for `providerDiscoveryIsolated: true` before preparing an import. This isolates provider URLs from the general lab sitemap. For example, set the flag before starting `pnpm lab`, then configure `PAPERLYFT_PUBLIC_FIXTURE_BASE_URL` to that public HTTPS origin and run `pnpm doctor --suite discovery` followed by `pnpm e2e --suite discovery`. The suite stops before conversion admission and does not need the paid-processing flag. It has six implemented but unrun profile journeys; several currently expose known crawler gaps. Synthetic profiles are not vendor certifications. Production is not supported.

## Local → staging → production

1. Use local for fixtures, selectors, document journeys, and recovery experiments.
2. Set `PAPERLYFT_ENV=staging`, remove the local base URL override, capture separate staging test sessions, and repeat approved suites. Keep processing off until authorized.
3. Set `PAPERLYFT_ENV=production`, remove the staging base URL override, and run only `pnpm e2e --suite smoke --canary`. Production additionally requires `PAPERLYFT_ALLOW_PROD_CANARY=1`, `PAPERLYFT_PROD_ACK=production-canary`, and the dedicated `PAPERLYFT_PROD_TEST_SUBJECT`. Production processing/mutation journeys are deliberately unsupported in this first version.

The normal GitHub workflow runs offline checks and test discovery. The separate manual canary workflow makes read-only requests; production requires its environment secret. Neither workflow enables paid processing. Add GitHub environment reviewers in repository settings before using production.

## Results and limitations

Each browser run writes ignored `artifacts/<run-id>/playwright.json`, a compact `summary.json`, failed-test screenshots, and a processing-budget ledger if needed. `pnpm report artifacts/<run-id>/playwright.json` prints a summary without document contents or cookies. Traces and videos are off by default; screenshots may contain test-document content. Keep artifacts private and remove them when review is complete. No raw browser artifacts are uploaded automatically in CI.

[docs/PLAN.md](docs/PLAN.md) contains the implementation plan. [docs/COVERAGE.md](docs/COVERAGE.md) separates executable checks from planned/manual/external-fixture cases. No finite sample establishes support for every possible PDF, language, CMS, or customer workflow.
