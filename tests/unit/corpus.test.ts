import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { scanCorpus } from '../../src/lab/corpus.js'
import { loadCorpus, sampleCorpus } from '../../src/lab/corpus.js'

test('scanner records escaped IDs, page counts, hashes, and eligibility errors without following symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paperlyft-corpus-'))
  try {
    const nested = path.join(root, 'nested folder')
    await mkdir(nested, { recursive: true })
    const doc = await PDFDocument.create()
    doc.addPage()
    const valid = await doc.save()
    await writeFile(path.join(nested, 'agenda one.pdf'), valid)
    await writeFile(path.join(root, 'broken.pdf'), '%PDF broken')
    await writeFile(path.join(root, 'not-a-pdf.txt'), 'ignore')
    const records = await scanCorpus(root, { maxBytes: 100_000, maxPages: 300 })
    assert.equal(records.length, 2)
    const good = records.find((record) => record.pages === 1)
    assert.ok(good)
    assert.match(good.id, /%20/)
    assert.match(good.sha256 ?? '', /^[a-f0-9]{64}$/)
    assert.equal(good.eligible, true)
    const bad = records.find((record) => record.id === 'broken.pdf')
    assert.ok(bad)
    assert.equal(bad.eligible, false)
    assert.ok(bad.error)
    await assert.rejects(() => loadCorpus(path.join(root, 'missing.json')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sampler is deterministic for a seed, permits repeats, and samples only eligible records', () => {
  const records = [
    {
      id: 'ready',
      path: 'a.pdf',
      pages: 1,
      bytes: 10,
      sha256: 'a'.repeat(64),
      eligible: true,
      reasons: [],
    },
    {
      id: 'blocked',
      path: 'b.pdf',
      pages: 301,
      bytes: 10,
      sha256: 'b'.repeat(64),
      eligible: false,
      reasons: ['page-limit'],
    },
  ]
  const first = sampleCorpus(records, 12, 'seed-42')
  const again = sampleCorpus(records, 12, 'seed-42')
  assert.deepEqual(first, again)
  assert.equal(first.length, 12)
  assert.ok(first.every((record) => record.id === 'ready'))
  assert.ok(new Set(first.map((record) => record.id)).size < first.length)
  assert.throws(() => sampleCorpus([], 1, 'seed'), /eligible/)
  assert.throws(() => sampleCorpus(records, 0, 'seed'), /positive/)
})

test('loadCorpus rejects invalid manifest shape and scanner records size-blocked PDFs before parsing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paperlyft-corpus-'))
  try {
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({ version: 1, fixtures: [{ id: 'wrong' }] }),
    )
    await assert.rejects(
      () => loadCorpus(path.join(root, 'manifest.json')),
      /invalid corpus manifest/,
    )
    const doc = await PDFDocument.create()
    doc.addPage()
    await writeFile(path.join(root, 'larger.pdf'), await doc.save())
    const records = await scanCorpus(root, { maxBytes: 1 })
    assert.equal(records.length, 1)
    assert.equal(records[0].pages, null)
    assert.equal(records[0].sha256, null)
    assert.equal(records[0].eligible, false)
    assert.ok(records[0].reasons.includes('size-limit'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
