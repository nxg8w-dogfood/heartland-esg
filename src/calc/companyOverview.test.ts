import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { emptyAccount, type AccountData } from '../storage/account'
import { accountTotals } from './accountTotals'
import { companyOverview, findNode, monthlyTrees, monthlyValues, nodePath, periodMonths, sharePct, type DrillNode } from './companyOverview'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const sample = (): AccountData => {
  const a = emptyAccount()
  return {
    ...a,
    scope1Lines: [
      { id: 'd', group: 's1-diesel', date: '2025-03-01', quantity: 1000 },
      { id: 'b', group: 's1-benzin', date: '2025-03-01', dateTo: '2025-08-31', quantity: 400 },
      { id: 'g', group: 's1-naturgas', date: '2025-03-01', quantity: 500 },
    ],
    locations: [{ id: 'hq', name: 'Storetorv 1', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks', heatingFactorId: 'f-s2-fjernvarme-beis' }],
    scope2Lines: [
      { id: 'e', locationId: 'hq', kind: 'electricity', date: '2025-01-01', dateTo: '2025-12-31', kWh: 100_000 },
      { id: 'h', locationId: 'hq', kind: 'heating', date: '2025-01-01', dateTo: '2025-12-31', kWh: 50_000 },
    ],
    cat5Lines: [
      { id: 'w1', group: 'k5-erhverv-forbr', date: '2025-05-01', dateTo: '2025-05-31', quantity: 2 },
      { id: 'w2', group: 'k5-papir-gen', date: '2025-06-01', dateTo: '2025-06-30', quantity: 1 },
    ],
  }
}

/** Every node with parts equals the sum of its counted parts */
function expectPartsAddUp(node: DrillNode) {
  if (node.children.length === 0) return
  const sum = node.children.reduce((t, c) => t + (c.excluded ? 0 : c.value), 0)
  expect(sum, node.id || 'I alt').toBeCloseTo(node.value, 9)
  node.children.forEach(expectPartsAddUp)
}

describe('companyOverview', () => {
  it('has the totals the Koncern page counts the company with', () => {
    const a = sample()
    const o = companyOverview(a, factors, year2025)
    const t = accountTotals(a, factors, year2025)
    expect(o.totals).toEqual(t)
    expect(o.market).toBeCloseTo(t.scope1 + t.scope2Market + t.scope3, 12)
    expect(o.location).toBeCloseTo(t.scope1 + t.scope2Location + t.scope3, 12)
    expect(o.tree.value).toBeCloseTo(o.market, 12)
    expect(companyOverview(a, factors, year2025, 'location').tree.value).toBeCloseTo(o.location, 12)
  })

  it('splits every figure into parts that add up to it, in both methods', () => {
    expectPartsAddUp(companyOverview(sample(), factors, year2025).tree)
    expectPartsAddUp(companyOverview(sample(), factors, year2025, 'location').tree)
  })

  it('drills from Scope 1 to the source and on to the fuel', () => {
    const tree = companyOverview(sample(), factors, year2025).tree
    const mobile = findNode(tree, 's1/mobile')!
    expect(mobile.children.map((c) => c.id)).toEqual(expect.arrayContaining(['s1/mobile/s1-diesel', 's1/mobile/s1-benzin']))
    expect(nodePath(tree, 's1/mobile/s1-diesel').map((n) => n.id)).toEqual(['', 's1', 's1/mobile', 's1/mobile/s1-diesel'])
  })

  it('splits a location into electricity and heating, electricity by the chosen method', () => {
    const market = findNode(companyOverview(sample(), factors, year2025).tree, 's2/hq')!
    const location = findNode(companyOverview(sample(), factors, year2025, 'location').tree, 's2/hq')!
    expect(market.label).toBe('Storetorv 1')
    expect(location.children.map((c) => c.label)).toEqual(['El', 'Fjernvarme'])
    // Heating is the same in both methods; electricity follows the method.
    const part = (n: DrillNode, label: string) => n.children.find((c) => c.label === label)?.value ?? 0
    expect(part(market, 'Fjernvarme')).toBeCloseTo(part(location, 'Fjernvarme'), 12)
    expect(part(market, 'El')).not.toBeCloseTo(part(location, 'El'), 6)
  })

  it('lists all 15 Scope 3 categories; only relevant ones count', () => {
    const a = sample()
    a.relevance = { ...a.relevance, 5: { ...a.relevance[5], relevant: false } }
    const s3 = findNode(companyOverview(a, factors, year2025).tree, 's3')!
    expect(s3.children.map((c) => c.nr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    const cat5 = s3.children[4]
    expect(cat5.excluded).toBe(true)
    expect(cat5.value).toBeGreaterThan(0)
    expect(cat5.children).toHaveLength(2)
    expect(s3.children[7].note).toBe('Beregnes ikke i appen endnu')
    expect(s3.value).toBeCloseTo(s3.children.filter((c) => !c.excluded).reduce((t, c) => t + c.value, 0), 12)
  })
})

describe('month by month', () => {
  it('cuts the period into calendar months', () => {
    const months = periodMonths({ start: '2025-08-15', end: '2026-02-10' })
    expect(months.map((m) => m.label)).toEqual(['aug 2025', 'sep 2025', 'okt 2025', 'nov 2025', 'dec 2025', 'jan 2026', 'feb 2026'])
    expect(months[0]).toMatchObject({ start: '2025-08-15', end: '2025-08-31' })
    expect(months[6]).toMatchObject({ start: '2026-02-01', end: '2026-02-10' })
  })

  it('adds up to the period, for the whole account and for a part', () => {
    const a = sample()
    const months = monthlyTrees(a, factors, year2025, 'market')
    const tree = companyOverview(a, factors, year2025).tree
    for (const id of ['', 's1', 's1/mobile/s1-benzin', 's2/hq', 's3/5']) {
      const total = monthlyValues(months, id).reduce((t, m) => t + m.value, 0)
      expect(total, id || 'I alt').toBeCloseTo(findNode(tree, id)!.value, 9)
    }
    // The waste was all in May and June.
    expect(monthlyValues(months, 's3/5').map((m) => m.value > 0)).toEqual([false, false, false, false, true, true, false, false, false, false, false, false])
  })
})

describe('sharePct', () => {
  it('is the part in percent, and null without a total', () => {
    expect(sharePct(25, 200)).toBe(12.5)
    expect(sharePct(5, 0)).toBeNull()
  })
})
