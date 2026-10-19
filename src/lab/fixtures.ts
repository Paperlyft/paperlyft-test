import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

export type FixtureKind =
  | 'simple'
  | 'multi-page'
  | 'rotated'
  | 'tables-columns'
  | 'duplicate-content'
  | 'corrupted'
  | 'boundary'
  | 'scanned-image-only'
export type FixtureRecord = {
  id: string
  path: string
  pages: number | null
  bytes: number
  sha256: string
  kind: FixtureKind
  language: string
}
export type FixtureManifest = {
  version: 1
  fixtures: FixtureRecord[]
  languageInventory: Array<{
    language: string
    available: boolean
    coverage: string
    requirement?: string
  }>
  largeFixtures: { enabledByDefault: false; description: string }
}

async function makePdf(
  pages: number,
  label: string,
  options: { rotate?: boolean; columns?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(label)
  doc.setAuthor('PaperLyft Fixture Lab')
  doc.setCreator('Deterministic local fixture generator')
  doc.setProducer('PaperLyft Fixture Lab')
  doc.setCreationDate(new Date('2026-01-01T00:00:00.000Z'))
  doc.setModificationDate(new Date('2026-01-01T00:00:00.000Z'))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792])
    if (options.rotate && i === 0) page.setRotation(degrees(90))
    if (options.columns) {
      page.drawText(`${label} — page ${i + 1}`, {
        x: 45,
        y: 745,
        size: 15,
        font,
        color: rgb(0.1, 0.2, 0.4),
      })
      page.drawText('Column A: agenda item and meeting notes', { x: 45, y: 680, size: 10, font })
      page.drawText('Column B: action, owner, and status', { x: 320, y: 680, size: 10, font })
      for (let row = 0; row < 8; row++) {
        const y = 640 - row * 32
        page.drawRectangle({
          x: 42,
          y: y - 6,
          width: 525,
          height: 25,
          borderWidth: 0.5,
          borderColor: rgb(0.65, 0.68, 0.72),
        })
        page.drawText(`Item ${row + 1}`, { x: 50, y, size: 9, font })
        page.drawText(`Assigned ${row + 1}`, { x: 325, y, size: 9, font })
      }
    } else page.drawText(`${label} — page ${i + 1} of ${pages}`, { x: 45, y: 735, size: 14, font })
  }
  return doc.save({ useObjectStreams: false, addDefaultPage: false })
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(name: string, data: Uint8Array): Buffer {
  const type = Buffer.from(name, 'ascii')
  const body = Buffer.concat([type, Buffer.from(data)])
  const chunk = Buffer.alloc(12 + data.byteLength)
  chunk.writeUInt32BE(data.byteLength, 0)
  body.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(body), 8 + data.byteLength)
  return chunk
}

function scanPng(): Buffer {
  const width = 420
  const height = 560
  const pixels = Buffer.alloc(height * (1 + width * 3), 255)
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3)
    pixels[row] = 0
    for (let x = 0; x < width; x++) {
      const isTextLine =
        y > 55 &&
        y < 510 &&
        y % 29 < 5 &&
        x > 38 &&
        x < 385 &&
        (x + Math.floor(y / 29) * 13) % 47 < 31
      const isNoise = (x * 37 + y * 19) % 997 === 0
      const shade = isTextLine ? 45 + ((x + y) % 30) : isNoise ? 170 : 255
      const pixel = row + 1 + x * 3
      pixels[pixel] = shade
      pixels[pixel + 1] = shade
      pixels[pixel + 2] = shade
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function makeScannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Synthetic image-only scan sample')
  doc.setAuthor('PaperLyft Fixture Lab')
  doc.setCreator('Deterministic local fixture generator')
  doc.setProducer('PaperLyft Fixture Lab')
  doc.setCreationDate(new Date('2026-01-01T00:00:00.000Z'))
  doc.setModificationDate(new Date('2026-01-01T00:00:00.000Z'))
  const image = await doc.embedPng(scanPng())
  const page = doc.addPage([612, 792])
  page.drawImage(image, { x: 96, y: 62, width: 420, height: 560 })
  return doc.save({ useObjectStreams: false })
}

export async function buildFixtures(outputDir: string): Promise<FixtureManifest> {
  const target = path.resolve(outputDir)
  const records: FixtureRecord[] = []
  await mkdir(target, { recursive: true })
  const add = async (
    id: string,
    pages: number | null,
    kind: FixtureKind,
    bytes: Uint8Array,
    language = 'en',
  ) => {
    const filename = `${id}.pdf`
    await writeFile(path.join(target, filename), bytes)
    records.push({
      id,
      path: filename,
      pages,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      kind,
      language,
    })
  }
  await add('simple-1p', 1, 'simple', await makePdf(1, 'Simple one page'))
  await add('multi-page-3p', 3, 'multi-page', await makePdf(3, 'Three page sample'))
  await add('rotated-1p', 1, 'rotated', await makePdf(1, 'Rotated sample', { rotate: true }))
  await add(
    'tables-columns-1p',
    1,
    'tables-columns',
    await makePdf(1, 'Tables and columns', { columns: true }),
  )
  const duplicate = await makePdf(1, 'Duplicate content')
  await add('duplicate-a-1p', 1, 'duplicate-content', duplicate)
  await add('duplicate-b-1p', 1, 'duplicate-content', duplicate)
  await add(
    'corrupted',
    null,
    'corrupted',
    new TextEncoder().encode('%PDF-1.7\nnot a valid PDF object graph\n%%EOF\n'),
  )
  await add('scanned-image-only-1p', 1, 'scanned-image-only', await makeScannedPdf(), 'scanned')
  for (const pages of [299, 300, 301])
    await add(
      `boundary-${pages}p`,
      pages,
      'boundary',
      await makePdf(pages, `Boundary ${pages} pages`),
    )
  const manifest: FixtureManifest = {
    version: 1,
    fixtures: records,
    languageInventory: [
      {
        language: 'en',
        available: true,
        coverage: 'Generated selectable text using PDF standard Helvetica font.',
      },
      {
        language: 'ar',
        available: false,
        coverage:
          'No Arabic sample shipped; Unicode and right-to-left rendering are not represented.',
        requirement: 'Provide licensed Arabic font and corpus fixture before enabling.',
      },
      {
        language: 'zh',
        available: false,
        coverage: 'No Chinese sample shipped; CJK glyph coverage is not represented.',
        requirement: 'Provide licensed CJK font and corpus fixture before enabling.',
      },
      {
        language: 'hi',
        available: false,
        coverage: 'No Devanagari sample shipped; script coverage is not represented.',
        requirement: 'Provide licensed Devanagari font and corpus fixture before enabling.',
      },
      {
        language: 'scanned',
        available: true,
        coverage:
          'One generated grayscale image-only page demonstrates raster-only PDF input. Its artificial marks are not linguistic text and establish no OCR accuracy.',
      },
    ],
    largeFixtures: {
      enabledByDefault: false,
      description:
        'Files over 100 MB are not generated. Add an explicitly invoked opt-in generator only when needed.',
    },
  }
  await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
