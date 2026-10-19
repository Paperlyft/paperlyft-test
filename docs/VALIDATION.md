# Initial validation

Validated on the development machine against the current `new_pipeline` UI contracts in the separate PaperLyft application checkout. This repository contains no application source or copied dependencies from that checkout.

- TypeScript compilation and offline harness self-tests pass.
- Playwright discovers 20 real-target browser tests across seven spec files.
- The anonymous local smoke suite executed in installed Edge against a temporary real frontend on `http://127.0.0.1:3107`: 2 passed, 0 failed, 0 skipped. It checked the public homepage and anonymous rejection from the documents API.
- The temporary frontend was stopped afterward. No worker was started, document submitted, or Gemini/provider process invoked.
- The user-supplied local corpus contains 49 PDFs, totaling 96,969,720 bytes. Local inspection marked 48 eligible; one failed PDF parsing. The largest source file is 30,432,968 bytes; the highest successfully parsed page count is 70. Source documents stay in their original folder, with only ignored manifest metadata in this repo.
- Synthetic lab checks validate actual PDF page counts, duplicate content, folder pagination, nested/gzip sitemaps, HTTP failures, changed file versions, and conditional responses.

Authenticated processing, approval, publishing, bulk-import admission, real-corpus OCR/language quality, and staging/production runs have **not** been executed. They require separately captured dedicated account sessions and, for public URL imports, a public HTTPS fixture host. Paid processing remains disabled pending the user's explicit authorization.

The scenario catalog records both implemented tests and remaining cases. Its implementation count is not a claim that all those tests have run or that every possible customer document is supported. Use each run's summary to assess actual execution; skips make acceptance incomplete.
