import { describe, expect, it } from 'vitest'
import { currencyRates } from '../data/currencies'
import { factors } from '../data/factors'
import { emptyAccount, parseAccount } from '../storage/account'
import { accountTotals } from './accountTotals'
import type { ActivityLine } from './activity'
import { category4, category4Groups } from './scope3'
import { noDeflation, type SpendLine } from './spend'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const freight = (o: Partial<ActivityLine>): ActivityLine => ({ id: 'f', group: 'k4-lastbil', date: '2025-03-01', quantity: 10_000, ...o })
const courier = (o: Partial<SpendLine> = {}): SpendLine => ({ id: 'c', group: 'k4-kurer', date: '2025-03-01', amount: 74_604, currency: 'DKK', ...o })
const cat4 = (lines: ActivityLine[], spend: SpendLine[] = [], fs = factors) => category4(lines, spend, fs, currencyRates, noDeflation, year2025)

describe('category 4, freight by tonne-km', () => {
  it('multiplies tonne-km by each mode’s DESNZ average', () => {
    const r = cat4([
      freight({ id: '1', group: 'k4-vare-diesel', quantity: 1_000 }),
      freight({ id: '2', group: 'k4-lastbil', quantity: 10_000 }),
      freight({ id: '3', group: 'k4-fragt-fly', quantity: 1_000 }),
      freight({ id: '4', group: 'k4-fragt-skib', quantity: 100_000 }),
    ])
    expect(r.freightT).toBeCloseTo((1_000 * 0.6313 + 10_000 * 0.10163 + 1_000 * 0.89939 + 100_000 * 0.01612) / 1000, 12)
    expect(r.total).toBeCloseTo(r.freightT, 12)
    expect(r.pendingCount).toBe(0)
  })

  it('has one line type per freight factor, in tonne-km', () => {
    expect(category4Groups.map((g) => [g.factorId, g.unit])).toEqual([
      ['f-fr-vare-diesel', 'tonkm'], ['f-fr-lastbil', 'tonkm'], ['f-fr-fly', 'tonkm'], ['f-fr-skib', 'tonkm'],
    ])
  })

  it('prorates a line across the period boundary', () => {
    const r = cat4([freight({ date: '2024-12-01', dateTo: '2025-01-31', quantity: 6_200 })])
    expect(r.freightT).toBeCloseTo((3_100 * 0.10163) / 1000, 12)
  })
})

describe('category 4, courier and parcels by spend', () => {
  it('is pending while the EXIOBASE factor has no value, and is never guessed', () => {
    const r = cat4([], [courier()])
    expect(r.courierT).toBe(0)
    expect(r.pendingCount).toBe(1)
  })

  it('converts DKK to EUR and uses the factor once it has a value', () => {
    const fs = factors.map((f) => (f.id === 'f-exio-post' ? { ...f, value: 0.2 } : f))
    const r = cat4([], [courier({ amount: 74_604 })], fs) // 74,604 DKK = 10,000 EUR at 7.4604
    expect(r.courierT).toBeCloseTo((10_000 * 0.2) / 1000, 9)
    expect(r.total).toBeCloseTo(r.courierT, 12)
  })

  it('throws on an unknown courier type', () => {
    expect(() => cat4([], [courier({ group: 'k1-software' })])).toThrow('Unknown group')
  })
})

describe('category 4 in the account', () => {
  it('counts in Scope 3 only when marked relevant, and flags pending lines then', () => {
    const base = { ...emptyAccount(), cat4Lines: [freight({})], cat4SpendLines: [courier()] }
    const off = accountTotals(base, factors, year2025)
    expect(off.scope3ByCategory[4]).toBeCloseTo(1.0163, 9)
    expect(off.scope3).toBe(0 + off.scope3ByCategory[1] + off.scope3ByCategory[3] + off.scope3ByCategory[5] + off.scope3ByCategory[6] + off.scope3ByCategory[7] + off.scope3ByCategory[15])
    expect(off.issues.join(' ')).not.toContain('kategori 4')
    const on = accountTotals({ ...base, relevance: { ...base.relevance, 4: { relevant: true, reason: 'Fragt af varer' } } }, factors, year2025)
    expect(on.scope3 - off.scope3).toBeCloseTo(1.0163, 9)
    expect(on.issues).toContain('1 linje i kategori 4 afventer en faktor')
    expect(on.issues.join(' ')).not.toMatch(/kategori.*4.*beregnes ikke/i)
  })

  it('loads saved category 4 lines, and accounts saved before it as empty', () => {
    const a = { ...emptyAccount(), cat4Lines: [freight({})], cat4SpendLines: [courier()] }
    const r = parseAccount(JSON.parse(JSON.stringify(a)))
    expect(r.ok && [r.account.cat4Lines, r.account.cat4SpendLines]).toEqual([a.cat4Lines, a.cat4SpendLines])
    const old = JSON.parse(JSON.stringify(emptyAccount()))
    delete old.cat4Lines
    delete old.cat4SpendLines
    const o = parseAccount(old)
    expect(o.ok && [o.account.cat4Lines, o.account.cat4SpendLines]).toEqual([[], []])
    expect(o.ok && o.dropped).toBe(0)
  })

  it('drops lines of an unknown type', () => {
    const r = parseAccount({ ...JSON.parse(JSON.stringify(emptyAccount())), cat4Lines: [freight({ group: 'k5-papir-gen' })] })
    expect(r.ok && r.account.cat4Lines).toEqual([])
    expect(r.ok && r.dropped).toBe(1)
  })
})
