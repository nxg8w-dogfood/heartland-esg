// The CI dependency audit: `npm audit --audit-level=high`, except for advisories waived in
// docs/waivers.md. Each exception names one advisory and a date by which it's looked at again;
// after that date it no longer applies, so a forgotten waiver fails the build instead of lasting.

export type AuditException = {
  /** The GitHub advisory, e.g. GHSA-fc5q-39xc-vjpf */
  id: string
  /** Why it's waived, as in docs/waivers.md */
  reason: string
  /** ISO date; from the day after, the advisory blocks again */
  reviewBy: string
}

/** The advisories waived in docs/waivers.md. Remove an entry when its waiver ends. */
export const auditExceptions: readonly AuditException[] = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    reason: 'picomatch ReDoS: no patched version exists; only the build and test tools (vite, vitest) use it.',
    reviewBy: '2026-12-18',
  },
]

type Advisory = { title: string; url: string; severity: string; range?: string; name?: string }
/** The part of `npm audit --json` this reads */
export type AuditReport = { vulnerabilities?: Record<string, { via: (string | Advisory)[] }> }

export type AuditResult = {
  /** High or critical advisories that fail the build */
  blocking: Advisory[]
  /** Waived advisories found, and still waived */
  waived: Advisory[]
  /** Exceptions past their review date, whose advisory is still found */
  expired: AuditException[]
}

const BLOCKING = new Set(['high', 'critical'])
const ghsa = (url: string) => url.match(/GHSA-[\w-]+$/i)?.[0] ?? url

export function checkAudit(report: AuditReport, exceptions: readonly AuditException[], today: string): AuditResult {
  // A package that's vulnerable only through another lists that package's name instead of an
  // advisory, so each advisory is counted once, where it's reported.
  const advisories = new Map<string, Advisory>()
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    for (const a of v.via) if (typeof a !== 'string') advisories.set(a.url, { ...a, name: a.name ?? name })
  }
  const result: AuditResult = { blocking: [], waived: [], expired: [] }
  for (const a of advisories.values()) {
    if (!BLOCKING.has(a.severity)) continue
    const exception = exceptions.find((e) => e.id.toLowerCase() === ghsa(a.url).toLowerCase())
    if (!exception) result.blocking.push(a)
    else if (today > exception.reviewBy) {
      result.blocking.push(a)
      result.expired.push(exception)
    } else result.waived.push(a)
  }
  return result
}
