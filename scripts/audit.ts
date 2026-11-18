// CI's dependency audit (`npm run audit`): fails on a high or critical advisory, except those
// waived in docs/waivers.md (scripts/lib/audit.ts lists them, each with a review date).

import { spawnSync } from 'node:child_process'
import { auditExceptions, checkAudit } from './lib/audit.ts'

// npm audit exits non-zero when it finds anything, so its exit code isn't the verdict.
const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error('npm audit gave no report:', run.stderr || run.stdout)
  process.exit(1)
}
if (report.error) {
  console.error('npm audit failed:', report.error.summary ?? report.error)
  process.exit(1)
}

const { blocking, waived, expired } = checkAudit(report, auditExceptions, new Date().toISOString().slice(0, 10))
for (const a of waived) console.log(`Waived (docs/waivers.md): ${a.name} ${a.severity} — ${a.title} ${a.url}`)
for (const e of expired) console.error(`The waiver for ${e.id} was due for review by ${e.reviewBy}. Check for a fix, then renew or remove it in docs/waivers.md and scripts/lib/audit.ts.`)
for (const a of blocking) console.error(`${a.severity}: ${a.name} — ${a.title} ${a.url}`)
if (blocking.length) {
  console.error(`${blocking.length} high or critical ${blocking.length === 1 ? 'advisory' : 'advisories'}. Run npm audit for the fixes.`)
  process.exit(1)
}
console.log('No high or critical advisories, apart from any waived above.')
