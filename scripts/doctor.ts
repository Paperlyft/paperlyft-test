import { loadRuntimeConfig } from '../src/config.js'
import { doctor, suites, type Suite } from '../src/doctor.js'
const index = process.argv.indexOf('--suite')
const suite = (index >= 0 ? process.argv[index + 1] : 'smoke') as Suite
if (!suites.includes(suite)) throw new Error(`Choose --suite ${suites.join('|')}`)
const checks = await doctor(loadRuntimeConfig(), suite, process.argv.includes('--canary'))
for (const check of checks)
  console.log(`${check.ok ? 'PASS' : 'BLOCKED'} ${check.name}: ${check.detail}`)
process.exitCode = checks.every((check) => check.ok) ? 0 : 2
