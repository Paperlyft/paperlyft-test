import { scenarioCatalog } from '../scenarios/catalog.js'
const counts = new Map<string, number>()
for (const scenario of scenarioCatalog)
  counts.set(scenario.status, (counts.get(scenario.status) ?? 0) + 1)
console.log('Scenario inventory (implementation status, not evidence of live execution):')
for (const [status, count] of counts) console.log(`${status}: ${count}`)
console.log(
  '\nActual run evidence is in artifacts/<run-id>/summary.json; skipped cases do not pass acceptance.',
)
