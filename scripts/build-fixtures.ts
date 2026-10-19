import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFixtures } from '../src/lab/fixtures.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] ?? path.join(root, 'fixtures', 'generated'))
const manifest = await buildFixtures(output)
process.stdout.write(`Wrote ${manifest.fixtures.length} fixtures to ${output}\n`)
