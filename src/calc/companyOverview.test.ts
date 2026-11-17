import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { emptyAccount, type AccountData } from '../storage/account'
import { accountTotals } from './accountTotals'
import { companyOverview, sharePct } from './companyOverview'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const sample = (): AccountData => {
  const a = emptyAccount()
  return {
    ...a,
    scope1Lines: [
      { id: 'd', group: 's1-diesel', date: '2025-03-01', quantity: 1000 },
      { id: 'g', group: 's1-naturgas', date: '2025-03-01', quantity: 500 },
    ],
    locations: [{ id: 'hq', name: 'Storetorv 1', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks', heatingFactorId: 'f-s2-fjernvarme-beis' }],
    scope2Lines: [{ id: 'e', locationId: 'hq', kind: 'electricity', date: '2025-01-01', dateTo: '2025-12-31', kWh: 100_000 }],
    cat5Lines: [{ id: 'w', group: 'k5-erhverv-forbr', date: '2025-05-01', quantity: 2 }],
  }
}

describe('companyOverview', () => {
  it('has the totals the Koncern page counts the company with', () => {
    const a = sample()
    const o = companyOverview(a, factors, year2025)
    const t = accountTotals(a, factors, year2025)
    expect(o.totals).toEqual(t)
    expect(o.market).toBeCloseTo(t.scope1 + t.scope2Market + t.scope3, 12)
    expect(o.location).toBeCloseTo(t.scope1 + t.scope2Location + t.scope3, 12)
  })

  it('splits Scope 1 by source, and the parts add up to Scope 1', () => {
    const o = companyOverview(sample(), factors, year2025)
    const [mobile, stationary, fugitive] = o.scope1
    expect(mobile.value).toBeGreaterThan(0)
    expect(stationary.value).toBeGreaterThan(0)
    expect(fugitive.value).toBe(0)
    expect(o.scope1.reduce((s, p) => s + p.value, 0)).toBeCloseTo(o.totals.scope1, 12)
  })

  it('splits Scope 2 by location in both methods', () => {
    const o = companyOverview(sample(), factors, year2025)
    expect(o.scope2).toHaveLength(1)
    expect(o.scope2[0]).toMatchObject({ id: 'hq', name: 'Storetorv 1' })
    expect(o.scope2[0].location).toBeCloseTo(o.totals.scope2Location, 12)
    expect(o.scope2[0].market).toBeCloseTo(o.totals.scope2Market, 12)
  })

  it('lists every calculated Scope 3 category, and only relevant ones add up to Scope 3', () => {
    const a = sample()
    a.relevance = { ...a.relevance, 5: { ...a.relevance[5], relevant: false } }
    const o = companyOverview(a, factors, year2025)
    expect(o.scope3.map((p) => p.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 15])
    const cat5 = o.scope3.find((p) => p.nr === 5)!
    expect(cat5.excluded).toBe(true)
    expect(cat5.value).toBeGreaterThan(0)
    const included = o.scope3.filter((p) => !p.excluded).reduce((s, p) => s + p.value, 0)
    expect(included).toBeCloseTo(o.totals.scope3, 12)
  })
})

describe('sharePct', () => {
  it('is the part in percent, and null without a total', () => {
    expect(sharePct(25, 200)).toBe(12.5)
    expect(sharePct(5, 0)).toBeNull()
  })
})
