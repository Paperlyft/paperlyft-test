# Local no-cost test run

Run date: October 19, 2026. Application: the local `new_pipeline` checkout at `D:/Code/paperlyft-html-review`, including its existing uncommitted UI changes. No application release, staging mutation, production mutation, payment, or paid model request was made.

## Results

| Check                       | Result                              | What ran                                                                                                                                                                                   |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:product-offline` | 320 passed, 26 files                | Existing application import, admission, authorization, worker, library, approval, retention, extraction and finalization suites. Their test doubles are listed in the ignored JSON report. |
| `pnpm test:product-local`   | 60 passed, 4 files, no skips        | New cross-repository integration checks described below.                                                                                                                                   |
| Application UI suites       | 68 passed, 4 files                  | DocumentImportsSection, DocumentApprovalSection, UploadBatchReview and ReviewSection in jsdom, using their mocked API clients.                                                             |
| `pnpm check`                | 39 passed; harness typecheck passed | Harness guards, fixtures, configuration and runner behavior.                                                                                                                               |
| `pnpm typecheck:product`    | Passed                              | Integration tests checked against application types, including job dispatch, source versions and library manifests.                                                                        |

The local integration checks comprise:

- Real PDF pipeline: a generated one-page PDF runs through native preflight, rasterization, page extraction, the actual WeasyPrint renderer, page validation and final document assembly/validation. Its final PDF is parsed and checked for the expected page count. The AI provider is scripted, including orientation, authoring and visual-review decisions. No quality receipt is fabricated in this pipeline test. This proves pipeline execution, not AI fidelity to arbitrary documents.
- Bulk lifecycle: two unique URL sources plus a repeated URL are prepared and admitted; prepare replay preserves the batch identity and duplicate URLs do not add a third document. Both documents traverse worker state transitions, retention, approval and publication under all four combinations of automatic approval and publishing consent. Another tenant cannot read them. This uses real application services and a filesystem library, but in-memory repositories, controlled source responses and synthetic final output/quality evidence. It does not run the converter for those imported documents.
- Real local corpus: all 49 supplied PDFs are inspected against the saved manifest. The 48 eligible PDFs retain their expected page counts; the known malformed PDF is rejected. Three reproducibly selected samples also pass native preflight. No source documents are copied, uploaded, changed or committed. Future oversized corpus entries receive metadata-only inventory checks.
- Cost guards: constructing a real provider or making an accidental external HTTP request fails immediately in this Vitest project. Live-model tests are disabled and common provider credentials are removed from the child environment.

## Fixes made while testing

The application UI test for upload estimates called its deferred response before React had started the request. Waiting for the request fixes that test race. That one-line test change remains uncommitted in the application checkout; no application runtime code changed.

The harness now resolves the installed application modules from the separate test repository, recognizes an existing Windows qpdf installation, blocks real provider/network use, clears stale JSON reports before running, validates fresh results, and reports skipped or zero-pass runs as incomplete.

## What remains unverified

These checks do not establish signed-in browser end-to-end acceptance, real model OCR/layout quality, a full URL-import-to-conversion-to-public-reader journey in one running application, actual cloud queues/storage, payment processing, staging/production readiness, or compatibility with every CMS. Dedicated browser sessions and a safe isolated no-cost runtime composition are still needed for those full running-app journeys. Existing browser processing suites remain blocked by the paid-processing guard.

The real crawler's bounded/static discovery limitations still apply: JavaScript/API pagination, extensionless downloads without PDF hints, HTML `<base>` handling and complete inventories of large sites require further product work. See [provider coverage](PROVIDER-COVERAGE.md). Synthetic provider profiles are test inputs, not proof that every installation of that CMS works.

## Repeat

Use the existing application checkout and dependencies. Keep the supplied documents local:

```powershell
pnpm corpus generate
pnpm check
pnpm typecheck:product
pnpm test:product-offline
pnpm test:product-local
```

The local command needs the application's native Python dependencies, qpdf, verified WeasyPrint image and PDF validator runtime. It uses installed tools and short-lived renderer/validator containers. It neither provisions infrastructure nor downloads images. JSON evidence is ignored under `artifacts/product-offline/latest.json` and `artifacts/product-local/latest.json`; reruns replace it. A non-default application checkout can be selected with `--main-repo`; the dedicated product typecheck configuration assumes the default sibling directory.

Temporary native test directories and containers are removed after execution. Existing Docker images, shared data volumes and the unrelated running PostgreSQL service are preserved. No retained Docker space was reclaimed because the image/cache inventory stayed within its budget.
