import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { emptyAccount, type AccountData } from '../storage/account'
import { GROUP_VERSION, newCompany, type Company, type GroupData } from '../storage/group'
import { accountTotals } from './accountTotals'
import { applyFactorSources } from './factorSources'
import { factorPublications } from '../data/factorPublications'
import { dataYears, factorSourceDifferences, groupSummary, marketTotal, yearOverYear, yearSlices } from './groupSummary'
import type { Investment } from './investments'

const DIESEL = 2.57082 / 1000 // t per litre
const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const twoYears = { start: '2025-01-01', end: '2026-12-31' }
const diesel = (id: string, date: string, quantity: number) => ({ id, group: 's1-diesel' as const, date, quantity })
const withLines = (...lines: ReturnType<typeof diesel>[]): AccountData => ({ ...emptyAccount(), scope1Lines: lines })
const company = (name: string, account: AccountData, ownership = [{ fromYear: 2000, pct: 100 }]): Company => ({ ...newCompany(name, account), ownership })
const groupOf = (...companies: Company[]): GroupData => ({ version: GROUP_VERSION, name: 'G', companies, activeCompanyId: companies[0].id, summaryPeriod: year2025 })
const builtin = () => factors
const holding = (o: Partial<Investment>): Investment => ({
  id: 'i1', date: '2025-06-30', company: 'Datter ApS', ownershipPct: 30, accountingMethod: 'Ass.', climateMethod: '', dataSource: '',
  basis: 'CO2e', totalKgCO2e: 100_000, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null,
  factorKgPerEUR: null, factorSource: '', country: 'Danmark', ...o,
})

describe('yearSlices', () => {
  it('splits a period at each new year', () => {
    expect(yearSlices({ start: '2024-07-01', end: '2026-03-31' })).toEqual([
      { year: 2024, period: { start: '2024-07-01', end: '2024-12-31' } },
      { year: 2025, period: { start: '2025-01-01', end: '2025-12-31' } },
      { year: 2026, period: { start: '2026-01-01', end: '2026-03-31' } },
    ])
  })
})

describe('groupSummary, equity share', () => {
  it('counts a wholly owned company in full, and equals its own account', () => {
    const a = company('Mor A/S', withLines(diesel('1', '2025-03-01', 100)))
    const s = groupSummary(groupOf(a), builtin, year2025)
    expect(s.total.scope1).toBeCloseTo(100 * DIESEL, 12)
    expect(s.total).toEqual(s.companies[0].full)
    expect(s.companies[0].full.scope1).toBeCloseTo(accountTotals(a.account, factors, year2025).scope1, 12)
  })

  it('counts each company with the group’s share in it', () => {
    const mor = company('Mor A/S', withLines(diesel('1', '2025-03-01', 100)))
    const datter = company('Datter ApS', withLines(diesel('2', '2025-03-01', 1000)), [{ fromYear: 2020, pct: 60 }])
    const s = groupSummary(groupOf(mor, datter), builtin, year2025)
    expect(s.companies[1].full.scope1).toBeCloseTo(1000 * DIESEL, 12)
    expect(s.companies[1].share.scope1).toBeCloseTo(600 * DIESEL, 12)
    expect(s.total.scope1).toBeCloseTo(700 * DIESEL, 12)
  })

  it('uses each year’s own share when it changes during the period', () => {
    const c = company('Datter ApS', withLines(diesel('1', '2025-03-01', 100), diesel('2', '2026-03-01', 100)), [{ fromYear: 2025, pct: 50 }, { fromYear: 2026, pct: 100 }])
    const s = groupSummary(groupOf(c), builtin, twoYears)
    expect(s.total.scope1).toBeCloseTo((50 + 100) * DIESEL, 12)
    expect(s.companies[0].ownership).toEqual([{ year: 2025, pct: 50 }, { year: 2026, pct: 100 }])
  })

  it('adds up the year parts to the whole period exactly, for a line across New Year', () => {
    const line = { ...diesel('1', '2025-12-01', 620), dateTo: '2026-01-31' }
    const a = company('Mor A/S', withLines(line))
    const whole = accountTotals(a.account, factors, twoYears)
    expect(groupSummary(groupOf(a), builtin, twoYears).total.scope1).toBeCloseTo(whole.scope1, 12)
  })

  it('counts a year without an ownership share as 0 % and says so', () => {
    const c = company('Datter ApS', withLines(diesel('1', '2025-03-01', 100)), [{ fromYear: 2026, pct: 100 }])
    const s = groupSummary(groupOf(c), builtin, year2025)
    expect(s.total.scope1).toBe(0)
    expect(s.companies[0].issues).toContain('Ejerandelen mangler for 2025, så virksomheden tæller med 0 %')
  })
})

describe('groupSummary, holdings in other group companies', () => {
  const mor = (investments: Investment[]) => company('Mor A/S', { ...emptyAccount(), investments })
  const datter = company('Datter ApS', withLines(diesel('1', '2025-03-01', 100)), [{ fromYear: 2020, pct: 30 }])

  it('leaves a category 15 holding in a group company out of the group total, not out of the company’s own figures', () => {
    const s = groupSummary(groupOf(mor([holding({})]), datter), builtin, year2025)
    expect(s.companies[0].full.scope3).toBeCloseTo(30, 9) // 30 % of 100 t
    expect(s.companies[0].share.scope3).toBeCloseTo(0, 9)
    expect(s.companies[0].intraGroupCat15).toBeCloseTo(30, 9)
    expect(s.companies[0].issues.join(' ')).toContain('Datter ApS')
  })

  it('matches the company name regardless of case and spaces, and keeps other holdings', () => {
    const s = groupSummary(groupOf(mor([holding({ company: '  datter aps ' }), holding({ id: 'i2', company: 'Fremmed A/S' })]), datter), builtin, year2025)
    expect(s.companies[0].share.scope3).toBeCloseTo(30, 9)
  })

  it('does nothing when category 15 is not relevant', () => {
    const m = mor([holding({})])
    m.account.relevance = { ...m.account.relevance, 15: { relevant: false, reason: 'x' } }
    const s = groupSummary(groupOf(m, datter), builtin, year2025)
    expect(s.companies[0].share.scope3).toBe(0)
    expect(s.companies[0].intraGroupCat15).toBe(0)
  })
})

describe('groupSummary, per-company factor sources', () => {
  it('calculates each company with its own factors', () => {
    const own = { ...withLines(), scope2Lines: [], factorSources: { 'f-s1-diesel': { kind: 'manual' as const, value: 3, source: 'x', date: '' } } }
    const a = company('A', withLines(diesel('1', '2025-03-01', 100)))
    const b = company('B', { ...own, scope1Lines: [diesel('2', '2025-03-01', 100)] })
    const factorsFor = (c: Company) => applyFactorSources(factors, c.account.factorSources, factorPublications)
    const s = groupSummary(groupOf(a, b), factorsFor, year2025)
    expect(s.companies[0].share.scope1).toBeCloseTo(100 * DIESEL, 12)
    expect(s.companies[1].share.scope1).toBeCloseTo(0.3, 12)
    expect(factorSourceDifferences(groupOf(a, b), factors).map((d) => d.factor.id)).toEqual(['f-s1-diesel'])
  })

  it('reports no difference with one company, or when all chose the same', () => {
    const src = { 'f-s2-el-dk-2025': { kind: 'publication' as const, publicationId: 'ens-el-emissionsfaktoren-2025-2035' } }
    const a = company('A', { ...emptyAccount(), factorSources: src })
    const b = company('B', { ...emptyAccount(), factorSources: src })
    expect(factorSourceDifferences(groupOf(a), factors)).toEqual([])
    expect(factorSourceDifferences(groupOf(a, b), factors)).toEqual([])
  })
})

describe('year over year', () => {
  it('lists the years any company has data for, and sums each', () => {
    const a = company('A', withLines(diesel('1', '2024-05-01', 100), diesel('2', '2026-05-01', 200)))
    const b = company('B', { ...emptyAccount(), surveys: [{ id: 's', date: '2025-01-15', modes: {}, workWeeks: 46 } as never] })
    const g = groupOf(a, b)
    expect(dataYears(g)).toEqual([2024, 2025, 2026])
    const yoy = yearOverYear(g, builtin, [2024, 2026])
    expect(yoy.map((y) => [y.year, y.summary.total.scope1])).toEqual([[2024, expect.closeTo(100 * DIESEL, 12)], [2026, expect.closeTo(200 * DIESEL, 12)]])
    // The total also includes Scope 3 category 3, the fuel's upstream emissions.
    expect(marketTotal(yoy[0].summary.total)).toBeCloseTo(100 * DIESEL + (100 * 0.61101) / 1000, 12)
  })
})
