import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { buildFixtures, type FixtureManifest } from './fixtures.js'

export type LabOptions = { host?: string; port?: number }
export type LabHandle = { baseURL: string; close(): Promise<void> }
const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`
const xml = (urls: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`

export async function startLab(options: LabOptions = {}): Promise<LabHandle> {
  const host = options.host ?? '127.0.0.1'
  const dir = await mkdtemp(path.join(tmpdir(), 'paperlyft-fixture-lab-'))
  let manifest: FixtureManifest
  try {
    manifest = await buildFixtures(dir)
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  let version = 1
  let closed = false
  const openTimers = new Set<ReturnType<typeof setTimeout>>()
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://fixture.local')
      const pathname = url.pathname
      if (pathname === '/')
        return send(
          res,
          200,
          page(
            'PaperLyft Fixture Lab',
            '<a href="/sitemap.xml">Sitemap</a><a href="/document-center">Document Center</a>',
          ),
        )
      if (pathname === '/customer-site')
        return send(
          res,
          200,
          page(
            'Fixture customer site',
            '<main><h2>Public meeting materials</h2><a href="/agenda/packet">Download the meeting packet</a></main>',
          ),
        )
      if (pathname === '/robots.txt')
        return send(
          res,
          200,
          `User-agent: *\nAllow: /\nSitemap: ${origin(req)}/sitemap.xml\n`,
          'text/plain; charset=utf-8',
        )
      if (pathname === '/sitemap.xml')
        return send(
          res,
          200,
          `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin(req)}/nested/sitemap.xml</loc></sitemap></sitemapindex>`,
          'application/xml; charset=utf-8',
        )
      if (pathname === '/sitemap-index.xml')
        return send(
          res,
          200,
          `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin(req)}/nested/sitemap.xml</loc></sitemap></sitemapindex>`,
          'application/xml; charset=utf-8',
        )
      if (pathname === '/nested/sitemap.xml')
        return send(
          res,
          200,
          xml([`${origin(req)}/agenda/packet`, `${origin(req)}/alias-a.pdf`]),
          'application/xml; charset=utf-8',
        )
      if (pathname === '/sitemap-gzip.xml') {
        res.writeHead(200, { 'content-type': 'application/xml', 'content-encoding': 'gzip' })
        return res.end(gzipSync(xml([`${origin(req)}/agenda/packet`])))
      }
      if (pathname === '/document-center') {
        const current = new URL(req.url ?? '/', 'http://fixture.local')
        if (current.searchParams.has('folder'))
          return send(
            res,
            200,
            page(
              'Document Center: folder',
              '<a href="/simple-1p.pdf">Folder notice</a><a href="/document-center?page=2">Next page</a>',
            ),
          )
        if (current.searchParams.get('page') === '2')
          return send(
            res,
            200,
            page('Document Center: page 2', '<a href="/multi-page-3p.pdf">Page two packet</a>'),
          )
        return send(
          res,
          200,
          page(
            'Document Center',
            '<a href="/document-center?folder=1">Folder</a><a href="/document-center?page=2">Next page</a><a href="/agenda/packet">Meeting packet</a><a href="/multi-page-3p.pdf">Public minutes</a>',
          ),
        )
      }
      if (pathname === '/agenda/packet')
        return send(
          res,
          200,
          await readFile(path.join(dir, 'multi-page-3p.pdf')),
          'application/pdf',
          { 'content-disposition': 'attachment; filename="packet"' },
        )
      if (pathname === '/javascript-links')
        return send(
          res,
          200,
          page(
            'Script links',
            '<script>const u="/simple-1p.pdf"; document.body.insertAdjacentHTML("beforeend", `<a href="${u}">download</a>`)</script>',
          ),
        )
      if (pathname === '/frames')
        return send(
          res,
          200,
          page(
            'Embedded links',
            '<iframe src="/frame-content"></iframe><object data="/simple-1p.pdf" type="application/pdf"></object>',
          ),
        )
      if (pathname === '/frame-content')
        return send(res, 200, page('Frame', '<a href="/multi-page-3p.pdf">PDF</a>'))
      if (pathname === '/control/version' && req.method === 'POST') {
        version++
        return send(res, 200, JSON.stringify({ version }), 'application/json')
      }
      if (pathname === '/versioned.pdf') {
        const data = await readFile(
          path.join(dir, version === 1 ? 'simple-1p.pdf' : 'multi-page-3p.pdf'),
        )
        const etag = `"${createHash('sha256').update(data).digest('hex')}"`
        const lastModified = new Date(Date.UTC(2026, 0, version)).toUTCString()
        if (
          req.headers['if-none-match'] === etag ||
          (!req.headers['if-none-match'] && req.headers['if-modified-since'] === lastModified)
        ) {
          res.writeHead(304, { etag, 'last-modified': lastModified })
          return res.end()
        }
        return send(res, 200, data, 'application/pdf', { etag, 'last-modified': lastModified })
      }
      if (pathname === '/status/403' || pathname === '/status/404' || pathname === '/status/503')
        return send(res, Number(pathname.split('/').pop()), 'Fixture status response')
      if (pathname === '/status/429')
        return send(res, 429, 'Rate limited', 'text/plain', { 'retry-after': '3' })
      if (pathname === '/slow') {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            openTimers.delete(timer)
            if (!res.destroyed) send(res, 200, 'delayed response')
            resolve()
          }, 5000)
          openTimers.add(timer)
          res.once('close', () => {
            clearTimeout(timer)
            openTimers.delete(timer)
            resolve()
          })
        })
        return
      }
      if (pathname === '/redirect-loop-a' || pathname === '/loop-a') {
        res.writeHead(302, { location: '/redirect-loop-b' })
        return res.end()
      }
      if (pathname === '/redirect-loop-b') {
        res.writeHead(302, { location: '/redirect-loop-a' })
        return res.end()
      }
      if (pathname === '/redirect') {
        res.writeHead(302, { location: '/simple-1p.pdf' })
        return res.end()
      }
      if (pathname === '/bad-pdf')
        return send(res, 200, '<html>not actually a PDF</html>', 'application/pdf')
      if (pathname === '/bad-html') return send(res, 200, '%PDF-1.4\nnot valid', 'text/html')
      if (pathname === '/alias-a.pdf' || pathname === '/alias-b.pdf')
        return send(
          res,
          200,
          await readFile(path.join(dir, 'duplicate-a-1p.pdf')),
          'application/pdf',
        )
      if (pathname === '/simple-1p.pdf')
        return send(res, 200, await readFile(path.join(dir, 'simple-1p.pdf')), 'application/pdf')
      const match = pathname.match(/^\/(.+\.pdf)$/)
      if (match) {
        const record = manifest.fixtures.find((item) => item.path === match[1])
        if (record)
          return send(res, 200, await readFile(path.join(dir, record.path)), 'application/pdf')
      }
      return send(res, 404, 'Not found')
    } catch (error) {
      if (!res.headersSent)
        send(res, 500, error instanceof Error ? error.message : 'Internal error')
      else res.destroy()
    }
  })
  let address: { port: number }
  try {
    address = await new Promise<{ port: number }>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port ?? 0, host, () => {
        server.off('error', reject)
        resolve(server.address() as { port: number })
      })
    })
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  return {
    baseURL: `http://${host}:${address.port}`,
    async close() {
      if (closed) return
      closed = true
      for (const timer of openTimers) clearTimeout(timer)
      openTimers.clear()
      const closing = new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      )
      server.closeAllConnections()
      await closing
      await rm(dir, { recursive: true, force: true })
    },
  }
}

function origin(req: IncomingMessage): string {
  return `http://${req.headers.host}`
}
function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer | Uint8Array,
  contentType = 'text/html; charset=utf-8',
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': contentType, ...headers })
  res.end(body)
}
