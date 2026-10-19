# Local document corpus

This tool inventories the user-supplied `C:/Users/kirta/Downloads/Testing Documents` tree and samples eligible PDFs for later, separately authorized product journeys. It reads PDF bytes locally to get each SHA-256 and actual page count. It never copies or modifies source PDFs, uploads files, starts processing, or calls Gemini.

The current eligibility limits are 100,000,000 bytes and 300 pages, inclusive. Recursive traversal does not follow symbolic links. Each manifest row retains its escaped relative-path ID, absolute source path, byte size, page count when parsable, SHA-256 when the file was small enough to read, eligibility, and reasons. Invalid PDFs and size-blocked files remain in the manifest; size-blocked files have `pages: null` and `sha256: null` because the scanner rejects them before reading their contents. A file that cannot be statted is retained as a metadata error where directory enumeration still exposes it.

Generate the ignored private manifest:

```powershell
node --import tsx scripts/corpus.ts generate
```

The default output is `fixtures/private/corpus.json`, which is already ignored by Git. Use `--source` and `--manifest` to select other paths. Generation stores only metadata and hashes; source files stay in place.

Select eight documents with replacement using a reproducible seed:

```powershell
node --import tsx scripts/corpus.ts sample --seed 42 --count 8
```

Without `--seed`, the CLI generates a random UUID seed and prints it with the sample. Sampling chooses only currently eligible entries and permits repeats. The selection command prints paths and metadata for local use. It performs no processing; any later upload or paid/Gemini work requires separate explicit authorization.
