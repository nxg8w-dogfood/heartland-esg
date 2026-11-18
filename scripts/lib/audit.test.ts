import { describe, expect, it } from 'vitest'
import { checkAudit, type AuditReport } from './audit.ts'

const advisory = (id: string, severity: string, name = 'pkg') => ({ title: `${name} issue`, url: `https://github.com/advisories/${id}`, severity, name })
const report: AuditReport = {
  vulnerabilities: {
    picomatch: { via: [advisory('GHSA-fc5q-39xc-vjpf', 'high', 'picomatch')] },
    vite: { via: ['picomatch', 'tinyglobby'] },
    minimatch: { via: [advisory('GHSA-g3hv-75wg-m249', 'moderate', 'minimatch')] },
  },
}
const exception = { id: 'GHSA-fc5q-39xc-vjpf', reason: 'no fix', reviewBy: '2026-12-18' }

describe('checkAudit', () => {
  it('blocks on a high advisory that isn’t waived, counted once', () => {
    const r = checkAudit(report, [], '2026-11-18')
    expect(r.blocking.map((a) => a.name)).toEqual(['picomatch'])
  })

  it('ignores moderate advisories, as --audit-level=high does', () => {
    const r = checkAudit({ vulnerabilities: { minimatch: report.vulnerabilities!.minimatch } }, [], '2026-11-18')
    expect(r.blocking).toEqual([])
  })

  it('lets a waived advisory through until its review date', () => {
    expect(checkAudit(report, [exception], '2026-12-18')).toMatchObject({ blocking: [], waived: [{ name: 'picomatch' }], expired: [] })
  })

  it('blocks again after the review date', () => {
    const r = checkAudit(report, [exception], '2026-12-19')
    expect(r.blocking.map((a) => a.name)).toEqual(['picomatch'])
    expect(r.expired).toEqual([exception])
  })

  it('still blocks a new high advisory next to a waived one', () => {
    const more: AuditReport = { vulnerabilities: { ...report.vulnerabilities, lodash: { via: [advisory('GHSA-xxxx-yyyy-zzzz', 'critical', 'lodash')] } } }
    expect(checkAudit(more, [exception], '2026-11-18').blocking.map((a) => a.name)).toEqual(['lodash'])
  })
})
