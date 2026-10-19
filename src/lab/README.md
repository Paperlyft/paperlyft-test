# Fixture lab

`startLab({ host?, port? })` starts an ephemeral local HTTP server and returns `{ baseURL, close() }`. Port `0` selects an available port. `close()` is idempotent, closes connections/timers, and deletes the generated temporary fixture files. The lab binds to loopback by default. A public deployment must be hosted separately; it is never started automatically.

Routes:

Eight additional synthetic provider delivery profiles are defined in [provider-sites.ts](provider-sites.ts): media REST pagination, Drupal files, extensionless document IDs, encoded folders, HTML base URLs, public library redirects, query downloads, and JavaScript load-more pagination. `pnpm test:lab` checks the browser-driven fixtures locally without loading product accounts. These are source-site fixtures, not vendor compatibility or PaperLyft processing evidence.

For the real preparation-only `discovery` suite, start the hosted lab with `PAPERLYFT_LAB_DISCOVERY_ONLY=1`. This makes `/sitemap.xml` empty and removes general sitemap links from `/robots.txt`, so the crawler cannot mix unrelated fixture PDFs into a profile's report. `/lab-capabilities` exposes `providerDiscoveryIsolated` for the suite preflight. Other routes remain available. The default lab mode preserves the general sitemap scenarios below.

| Route                                                            | Behavior                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                              | Links to the sitemap and document center                                                                                     |
| `/customer-site`                                                 | Minimal customer page with an extensionless meeting packet link, suitable for injecting the real account script in a browser |
| `/sitemap.xml`                                                   | Sitemap referencing a nested sitemap and HTML page                                                                           |
| `/sitemap-index.xml`, `/nested/sitemap.xml`, `/sitemap-gzip.xml` | Nested XML sitemap index, sitemap content, and gzip-compressed sitemap                                                       |
| `/document-center`                                               | CivicPlus-like folder and pagination links (`folder=1`, `page=2`)                                                            |
| `/agenda/packet`                                                 | AgendaCenter-like extensionless PDF response                                                                                 |
| `/javascript-links`                                              | Link inserted only by client-side JavaScript                                                                                 |
| `/frames`, `/frame-content`                                      | PDF object plus iframe page with a PDF link                                                                                  |
| `/alias-a.pdf`, `/alias-b.pdf`                                   | Distinct URLs returning identical bytes                                                                                      |
| `/redirect`, `/redirect-loop-a`, `/redirect-loop-b`              | Redirect and redirect-loop cases                                                                                             |
| `/bad-pdf`, `/bad-html`                                          | HTML labeled PDF, and malformed PDF labeled HTML                                                                             |
| `/status/403`, `/status/404`, `/status/429`, `/status/503`       | HTTP failure cases; 429 sends `Retry-After: 3`                                                                               |
| `/slow`                                                          | Response delayed by five seconds; closing the lab clears its timer                                                           |
| `/versioned.pdf`                                                 | Versioned PDF with ETag and Last-Modified; honors conditional requests with 304                                              |
| `POST /control/version`                                          | Local-only control that increments the version served by `/versioned.pdf`                                                    |
| `/<fixture-name>.pdf`                                            | Generated fixture file by manifest filename                                                                                  |

`buildFixtures(outputDir)` returns a versioned manifest with `fixtures`, `languageInventory`, and `largeFixtures`. Each fixture record has `id`, relative `path`, `pages` (null for invalid PDFs), byte count, SHA-256, `kind`, and `language`. The generator creates selectable-text English examples, 299/300/301-page boundaries, duplicate content, a rotated page, table/column layout, a malformed PDF, and one synthetic grayscale image-only scan page. The synthetic marks are not linguistic text and establish no OCR accuracy. Large files over 100 MB are never generated by default. Arabic, Chinese, and Hindi remain explicitly unavailable; no glyph coverage is claimed without licensed source corpora and fonts.

Generate persistent sample files with `node --import tsx scripts/build-fixtures.ts [outputDir]`. The default output is `fixtures/generated`; lab servers instead use and remove a temporary directory.
