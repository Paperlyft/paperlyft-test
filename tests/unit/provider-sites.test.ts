import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { PROVIDER_SITE_PROFILES } from '../../src/lab/provider-sites.js'
import { startLab } from '../../src/lab/server.js'

test('provider site catalog documents representative synthetic discovery paths', () => {
  assert.ok(PROVIDER_SITE_PROFILES.length <= 8)
  assert.ok(PROVIDER_SITE_PROFILES.length >= 7)
  for (const profile of PROVIDER_SITE_PROFILES) {
    assert.ok(profile.id && profile.providerFamily && profile.entryPath && profile.discoveryMethod)
    assert.ok(profile.expectedPdfPaths.length > 0)
    assert.ok(profile.limitations.length > 0)
  }
})

test('discovery-only mode keeps root sitemap empty and advertises its isolation', async () => {
  const lab = await startLab({ discoveryOnly: true })
  try {
    const robots = await (await fetch(`${lab.baseURL}/robots.txt`)).text()
    assert.match(robots, /Allow: \/\n/)
    assert.doesNotMatch(robots, /Sitemap:/)
    const sitemap = await (await fetch(`${lab.baseURL}/sitemap.xml`)).text()
    assert.match(sitemap, /<urlset/)
    assert.doesNotMatch(sitemap, /<url>/)
    assert.deepEqual(await (await fetch(`${lab.baseURL}/lab-capabilities`)).json(), {
      providerDiscoveryIsolated: true,
    })
    assert.equal((await fetch(`${lab.baseURL}/`)).status, 200)
  } finally {
    await lab.close()
  }
})

test('synthetic sites expose distinct PDF discovery patterns and auth boundaries', async () => {
  const lab = await startLab()
  try {
    for (const profile of PROVIDER_SITE_PROFILES) {
      const entry = await fetch(new URL(profile.entryPath, lab.baseURL))
      assert.equal(entry.status, 200, `${profile.id} entry`)
      let discoveredPages = 0
      for (const pdfPath of profile.expectedPdfPaths) {
        const response = await fetch(new URL(pdfPath, lab.baseURL), { redirect: 'manual' })
        if (response.status === 302) {
          const target = new URL(response.headers.get('location')!, lab.baseURL)
          const targetResponse = await fetch(target)
          assert.equal(
            targetResponse.headers.get('content-type'),
            'application/pdf',
            `${profile.id} redirect target`,
          )
          const count = (await PDFDocument.load(await targetResponse.arrayBuffer())).getPageCount()
          assert.ok(count > 0)
          discoveredPages += count
        } else {
          assert.equal(
            response.headers.get('content-type'),
            'application/pdf',
            `${profile.id} expected PDF`,
          )
          const count = (await PDFDocument.load(await response.arrayBuffer())).getPageCount()
          assert.ok(count > 0)
          discoveredPages += count
        }
      }
      assert.equal(discoveredPages, profile.expectedSourcePages, `${profile.id} PDF page count`)
    }
    const wp = await fetch(`${lab.baseURL}/wp-network/wp-json/wp/v2/media?page=1`)
    assert.equal(wp.status, 200)
    assert.equal(wp.headers.get('x-wp-totalpages'), '2')
    const wp2 = await fetch(`${lab.baseURL}/wp-network/wp-json/wp/v2/media?page=2`)
    assert.notEqual(await wp.text(), await wp2.text())
    assert.deepEqual(
      await (await fetch(`${lab.baseURL}/wp-network/wp-json/wp/v2/media?page=3`)).json(),
      [],
    )

    const drupal = await fetch(`${lab.baseURL}/drupal/sites/default/files/minutes.pdf`)
    assert.equal(drupal.headers.get('content-type'), 'application/pdf')
    const granicus = await fetch(`${lab.baseURL}/granicus/ShowDocument?id=100`)
    assert.equal(granicus.headers.get('content-type'), 'application/pdf')
    assert.equal((await fetch(`${lab.baseURL}/opencities/Agenda%20Packets/packet.pdf`)).status, 200)
    const revize = await fetch(`${lab.baseURL}/revize/files/Minutes%20%26%20Agenda.pdf`)
    assert.equal(revize.headers.get('content-type'), 'application/pdf')
    assert.match(
      await (await fetch(`${lab.baseURL}/revize/departments/meetings`)).text(),
      /<base href="\/revize\/">/,
    )
    assert.equal(
      (
        await fetch(`${lab.baseURL}/sharepoint/sites/council/Shared%20Documents/2026/Agenda.pdf`, {
          redirect: 'manual',
        })
      ).status,
      302,
    )
    assert.equal((await fetch(`${lab.baseURL}/sharepoint/login`)).status, 401)
    assert.equal((await fetch(`${lab.baseURL}/sharepoint/token-expired`)).status, 403)
    assert.equal(
      (
        await fetch(`${lab.baseURL}/joomla/index.php?option=com_docman&task=doc_download&gid=7`)
      ).headers.get('content-type'),
      'application/pdf',
    )

    const clientPage = await (await fetch(`${lab.baseURL}/site-builder`)).text()
    assert.match(clientPage, /id="load-more-records"/)
    assert.match(clientPage, /fetch\(`\/api\/records\?page=\$\{pageNumber\}`\)/)
    assert.match(clientPage, /button\.disabled=!d\.hasMore/)
    const records = (await (await fetch(`${lab.baseURL}/api/records?page=2`)).json()) as {
      items: Array<{ href: string }>
    }
    assert.match(records.items[0]!.href, /multi-page-3p\.pdf/)
    assert.deepEqual(
      ((await (await fetch(`${lab.baseURL}/api/records?page=3`)).json()) as { items: unknown[] })
        .items,
      [],
    )
    assert.equal((await fetch(`${lab.baseURL}/legacy/board.php`)).status, 200)
    assert.equal(
      (await fetch(`${lab.baseURL}/legacy/old-minutes.php`, { redirect: 'manual' })).status,
      301,
    )
  } finally {
    await lab.close()
  }
})
