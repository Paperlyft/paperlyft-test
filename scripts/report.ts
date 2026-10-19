import { readFile } from 'node:fs/promises'
import { summarizeReport } from '../src/report.js'
const path = process.argv[2]
if (!path) throw new Error('Usage: pnpm report artifacts/<run-id>/playwright.json')
console.log(JSON.stringify(summarizeReport(JSON.parse(await readFile(path, 'utf8'))), null, 2))
