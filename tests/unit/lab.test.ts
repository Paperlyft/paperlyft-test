import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { buildFixtures } from '../../src/lab/fixtures.js'
import { startLab } from '../../src/lab/server.js'

test('fixture generator returns stable, hashed small and boundary PDFs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'paperlyft-fixtures-'))
  try {
    const first = await buildFixtures(dir)
    const bytes1 = await readFile(path.join(dir, first.fixtures[0].path))
    const second = await buildFixtures(dir)
    const bytes2 = await readFile(path.join(dir, second.fixtures[0].path))
    assert.deepEqual(first, second)
    assert.deepEqual(bytes1, bytes2)
    for (const pages of [1, 3, 299, 300, 301]) {
      const record = first.fixtures.find((fixture) => fixture.pages === pages)
      assert.ok(record)
      assert.equal(
        (await PDFDocument.load(await readFile(path.join(dir, record.path)))).getPageCount(),
        pages,
      )
    }
    assert.ok(first.fixtures.some((fixture) => fixture.kind === 'corrupted'))
    const scan = first.fixtures.find((fixture) => fixture.kind === 'scanned-image-only')
    assert.ok(scan)
    assert.equal(scan.pages, 1)
    assert.match(
      (await readFile(path.join(dir, scan.path))).toString('latin1'),
      /\/Subtype \/Image/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('lab serves crawler scenarios, failure modes, validators and controlled version changes', async () => {
  const lab = await startLab({ host: '127.0.0.1', port: 0 })
  try {
    const sitemap = await fetch(`${lab.baseURL}/sitemap.xml`)
    assert.equal(sitemap.status, 200)
    assert.match(await sitemap.text(), /nested/)
    assert.equal((await fetch(`${lab.baseURL}/sitemap-index.xml`)).status, 200)
    const page1 = await (await fetch(`${lab.baseURL}/document-center`)).text()
    const page2 = await (await fetch(`${lab.baseURL}/document-center?page=2`)).text()
    const folder = await (await fetch(`${lab.baseURL}/document-center?folder=1`)).text()
    assert.notEqual(page1, page2)
    assert.notEqual(page1, folder)
    assert.match(page2, /href="[^"]+\.pdf"/)
    assert.match(folder, /href="[^"]+\.pdf"/)
    const agenda = await fetch(`${lab.baseURL}/agenda/packet`)
    assert.equal(agenda.headers.get('content-type'), 'application/pdf')
    assert.equal((await PDFDocument.load(await agenda.arrayBuffer())).getPageCount(), 3)
    assert.match(
      await (await fetch(`${lab.baseURL}/customer-site`)).text(),
      /href="\/agenda\/packet"/,
    )
    assert.equal((await fetch(`${lab.baseURL}/javascript-links`)).status, 200)
    assert.match(await (await fetch(`${lab.baseURL}/frames`)).text(), /iframe/)
    assert.match(await (await fetch(`${lab.baseURL}/robots.txt`)).text(), /Sitemap:/)
    const aliasA = Buffer.from(await (await fetch(`${lab.baseURL}/alias-a.pdf`)).arrayBuffer())
    const aliasB = Buffer.from(await (await fetch(`${lab.baseURL}/alias-b.pdf`)).arrayBuffer())
    assert.deepEqual(aliasA, aliasB)
    const simple = Buffer.from(await (await fetch(`${lab.baseURL}/simple-1p.pdf`)).arrayBuffer())
    assert.notDeepEqual(simple, aliasA)
    assert.equal(
      (await fetch(`${lab.baseURL}/redirect-loop-a`, { redirect: 'manual' })).status,
      302,
    )
    assert.equal(
      (await fetch(`${lab.baseURL}/bad-pdf`)).headers.get('content-type'),
      'application/pdf',
    )
    assert.equal((await fetch(`${lab.baseURL}/status/403`)).status, 403)
    assert.equal((await fetch(`${lab.baseURL}/status/404`)).status, 404)
    assert.equal((await fetch(`${lab.baseURL}/status/429`)).headers.get('retry-after'), '3')
    assert.equal((await fetch(`${lab.baseURL}/status/503`)).status, 503)
    const compressed = await fetch(`${lab.baseURL}/sitemap-gzip.xml`)
    assert.match(await compressed.text(), /agenda\/packet/)

    const initial = await fetch(`${lab.baseURL}/versioned.pdf`)
    const etag = initial.headers.get('etag')
    const modified = initial.headers.get('last-modified')
    assert.ok(etag && modified)
    assert.equal(
      (await fetch(`${lab.baseURL}/versioned.pdf`, { headers: { 'if-none-match': etag } })).status,
      304,
    )
    assert.equal(
      (await fetch(`${lab.baseURL}/versioned.pdf`, { headers: { 'if-modified-since': modified! } }))
        .status,
      304,
    )
    const change = await fetch(`${lab.baseURL}/control/version`, { method: 'POST' })
    assert.equal(change.status, 200)
    const changed = await fetch(`${lab.baseURL}/versioned.pdf`)
    assert.notEqual(changed.headers.get('etag'), etag)
    assert.equal((await PDFDocument.load(await changed.arrayBuffer())).getPageCount(), 3)
    assert.equal((await fetch(`${lab.baseURL}/loop-a`, { redirect: 'manual' })).status, 302)
  } finally {
    await lab.close()
  }
})
