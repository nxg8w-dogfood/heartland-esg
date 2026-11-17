import { describe, expect, it } from 'vitest'
import { currencyRates, toDKK } from '../data/currencies'
import type { Factor } from '../data/factors'
import { category15, coverLabel, investmentFactors, investmentResult, type Investment } from './investments'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const holding = (o: Partial<Investment> = {}): Investment => ({
  id: '1', date: '2025-12-31', company: 'Selskab A/S', ownershipPct: 25, accountingMethod: 'Ass.', climateMethod: '', dataSource: '',
  basis: 'CO2e', totalKgCO2e: 400_000, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null,
  investmentDKK: null, factorKgPerEUR: null, factorSource: '', country: 'Danmark', ...o,
})

describe('toDKK', () => {
  it('uses the original rates and treats DKK and unknown codes as 1', () => {
    expect(toDKK(currencyRates, 'EUR')).toBe(7.4604)
    expect(toDKK(currencyRates, 'DKK')).toBe(1)
    expect(toDKK(currencyRates, 'XYZ')).toBe(1)
    expect(toDKK(currencyRates, null)).toBe(1)
  })
})

describe('investmentResult', () => {
  // Expected values were checked against the original app's own calculation.
  it('takes the ownership share of reported emissions', () => {
    const r = investmentResult(holding(), currencyRates, year2025, [])
    expect(r.share).toBe(0.25)
    expect(r.kgCO2e).toBe(100_000)
    expect(r.included).toBe(true)
    expect(r.pending).toBe(false)
  })

  it('includes holdings of exactly 50 % and leaves out anything above', () => {
    expect(investmentResult(holding({ ownershipPct: 50 }), currencyRates, year2025, []).included).toBe(true)
    expect(investmentResult(holding({ ownershipPct: 50.01 }), currencyRates, year2025, []).included).toBe(false)
    expect(investmentResult(holding({ ownershipPct: 100 }), currencyRates, year2025, []).included).toBe(false)
  })

  it('leaves out a holding with no ownership share', () => {
    const r = investmentResult(holding({ ownershipPct: null }), currencyRates, year2025, [])
    expect(r.included).toBe(false)
    expect(r.kgCO2e).toBe(0)
  })

  it('is pending without reported emissions', () => {
    expect(investmentResult(holding({ totalKgCO2e: null }), currencyRates, year2025, []).pending).toBe(true)
  })

  it('estimates from revenue in DKK, converted to EUR, × factor × share', () => {
    const r = investmentResult(holding({ basis: 'Revenue', revenueDKK: 74_604_000, factorKgPerEUR: 0.1272 }), currencyRates, year2025, [])
    expect(r.revenueEUR).toBeCloseTo(10_000_000, 6)
    expect(r.kgCO2e).toBeCloseTo(10_000_000 * 0.1272 * 0.25, 6)
  })

  it('uses local amount × rate when revenue in DKK is blank', () => {
    const r = investmentResult(holding({ basis: 'Revenue', revenueLocal: 10_000_000, localCurrency: 'SEK', rateLocalToDKK: 0.6688, factorKgPerEUR: 0.0768 }), currencyRates, year2025, [])
    expect(r.revenueEUR).toBeCloseTo(6_688_000 / 7.4604, 6)
    expect(r.kgCO2e).toBeCloseTo((6_688_000 / 7.4604) * 0.0768 * 0.25, 6)
  })

  it('is pending on revenue without a factor, but not with zero revenue', () => {
    expect(investmentResult(holding({ basis: 'Revenue', revenueDKK: 1_000_000 }), currencyRates, year2025, []).pending).toBe(true)
    expect(investmentResult(holding({ basis: 'Revenue', revenueDKK: 0 }), currencyRates, year2025, []).pending).toBe(false)
  })

  it("calculates the data manual's method: the amount invested in EUR × the factor, without the ownership share", () => {
    const eur = toDKK(currencyRates, 'EUR')
    const r = investmentResult(holding({ basis: 'Investment', ownershipPct: 25, investmentDKK: eur * 2_000_000, factorKgPerEUR: 0.1 }), currencyRates, year2025, [])
    expect(r.investmentEUR).toBeCloseTo(2_000_000, 6)
    expect(r.annualKgCO2e).toBeCloseTo(200_000, 6)
    expect(r.kgCO2e).toBeCloseTo(200_000, 6)
    expect(r.included).toBe(true)
    expect(r.pending).toBe(false)
  })

  it('still leaves out a holding over 50 % on the investment amount', () => {
    expect(investmentResult(holding({ basis: 'Investment', ownershipPct: 60, investmentDKK: 1_000_000, factorKgPerEUR: 0.1 }), currencyRates, year2025, []).included).toBe(false)
  })

  it('is pending on the investment amount without an amount, without a factor, or with a negative amount', () => {
    const on = (o: Partial<Investment>) => investmentResult(holding({ basis: 'Investment', investmentDKK: 1_000_000, factorKgPerEUR: 0.1, ...o }), currencyRates, year2025, [])
    for (const r of [on({ investmentDKK: null }), on({ factorKgPerEUR: null }), on({ investmentDKK: -6_766_896 })]) {
      expect(r.pending).toBe(true)
      expect(r.kgCO2e).toBe(0)
    }
    expect(on({ investmentDKK: 0, factorKgPerEUR: null }).pending).toBe(false)
  })
})

describe('category15', () => {
  it('adds up included holdings in tonnes and counts consolidated ones', () => {
    const c = category15([
      holding({ id: 'a' }),
      holding({ id: 'b', ownershipPct: 10, totalKgCO2e: 2_000_000 }),
      holding({ id: 'c', ownershipPct: 80, totalKgCO2e: 9_000_000 }),
      holding({ id: 'd', totalKgCO2e: null }),
    ], currencyRates, year2025, [])
    expect(c.total).toBeCloseTo(100 + 200, 9)
    expect(c.consolidatedCount).toBe(1)
    expect(c.pendingCount).toBe(1)
  })

  it('only includes holdings whose 12 months overlap the period', () => {
    const c = category15([holding({ id: 'a' }), holding({ id: 'b', date: '2024-12-31' })], currencyRates, year2025, [])
    expect(c.rows.map((r) => r.investment.id)).toEqual(['a'])
  })

  it('scales the annual figure to a period shorter than a year', () => {
    const q2 = category15([holding()], currencyRates, { start: '2025-04-01', end: '2025-06-30' }, [])
    expect(q2.rows[0].shareInPeriod).toBe(91 / 365)
    expect(q2.total).toBeCloseTo((100 * 91) / 365, 9)
    expect(q2.rows[0].annualKgCO2e).toBe(100_000)
  })

  it('takes half of each year for a July–June financial year', () => {
    const fy = { start: '2025-07-01', end: '2026-06-30' }
    const c = category15([holding({ id: 'a', date: '2025-12-31' }), holding({ id: 'b', date: '2026-12-31', totalKgCO2e: 800_000 })], currencyRates, fy, [])
    expect(c.total).toBeCloseTo((100 * 184) / 365 + (200 * 181) / 365, 9)
  })

  it("counts a holding dated outside the period when its 12 months overlap it", () => {
    // Dated 31 Dec 2025, the period is the first half of 2025.
    const c = category15([holding({ date: '2025-12-31' })], currencyRates, { start: '2025-01-01', end: '2025-06-30' }, [])
    expect(c.rows).toHaveLength(1)
    expect(c.rows[0].shareInPeriod).toBe(181 / 365)
  })

  it('counts each year once in a two-year period', () => {
    const twoYears = { start: '2024-01-01', end: '2025-12-31' }
    const c = category15([holding({ id: 'a', date: '2024-12-31' }), holding({ id: 'b' })], currencyRates, twoYears, [])
    expect(c.total).toBeCloseTo(200, 9)
    expect(c.duplicates).toEqual([])
  })

  it('flags the same company with holdings whose months overlap', () => {
    // 15.01.2025 covers 16.01.2024–15.01.2025, which overlaps the calendar year 2025.
    const c = category15([holding({ id: 'a' }), holding({ id: 'b', company: ' selskab a/s ', date: '2025-01-15' })], currencyRates, year2025, [])
    expect(c.duplicates).toEqual([{ company: 'Selskab A/S', covers: '2025' }])
  })

  it('does not flag consecutive fiscal years of one company', () => {
    const twoYears = { start: '2024-08-01', end: '2026-07-31' }
    const c = category15([holding({ id: 'a', date: '2025-07-31' }), holding({ id: 'b', date: '2026-07-31' })], currencyRates, twoYears, [])
    expect(c.duplicates).toEqual([])
    expect(c.total).toBeCloseTo(200, 9)
  })
})

describe('a factor from the factor table', () => {
  const spend = (id: string, value: number | null, unit = 'kg CO2e/EUR'): Factor => ({
    id, scope: 'Scope 3', category: 'Spendfaktor (EXIOBASE)', name: id, region: 'Danmark', unit, value, source: 'EXIOBASE', reference: '', method: 'spend',
  })
  const table = [spend('obs', 0.5), spend('blank', null), spend('gbp', 0.3, 'kg CO2e/GBP')]
  const onRevenue = (o: Partial<Investment>) => holding({ basis: 'Revenue', totalKgCO2e: null, revenueDKK: toDKK(currencyRates, 'EUR') * 1_000_000, factorKgPerEUR: 9, ...o })

  it("uses the chosen factor's value instead of the holding's own", () => {
    const r = investmentResult(onRevenue({ factorId: 'obs' }), currencyRates, year2025, table)
    expect(r.factor?.id).toBe('obs')
    expect(r.factorKgPerEUR).toBe(0.5)
    expect(r.annualKgCO2e).toBeCloseTo(1_000_000 * 0.5 * 0.25, 6)
    expect(r.pending).toBe(false)
  })

  it('is missing, not the own value, when the chosen factor has no value, is gone or is not per EUR', () => {
    for (const factorId of ['blank', 'gone', 'gbp']) {
      const r = investmentResult(onRevenue({ factorId }), currencyRates, year2025, table)
      expect(r.factorKgPerEUR).toBeNull()
      expect(r.annualKgCO2e).toBe(0)
      expect(r.pending).toBe(true)
    }
  })

  it("uses the holding's own factor when none is chosen", () => {
    expect(investmentResult(onRevenue({ factorId: null }), currencyRates, year2025, table).factorKgPerEUR).toBe(9)
  })

  it('offers only spend factors per EUR', () => {
    expect(investmentFactors([...table, { ...spend('activity', 1), method: undefined }]).map((f) => f.id)).toEqual(['obs', 'blank'])
  })
})

describe('the 12 months a holding covers', () => {
  const fy2526 = { start: '2025-08-01', end: '2026-07-31' }

  it('counts a holding dated 31 July fully in the fiscal year August–July it closes', () => {
    const r = investmentResult(holding({ date: '2026-07-31' }), currencyRates, fy2526, [])
    expect(r.covers).toEqual({ start: '2025-08-01', end: '2026-07-31' })
    expect(r.shareInPeriod).toBe(1)
    expect(r.kgCO2e).toBe(100_000)
  })

  it('counts the previous fiscal year not at all', () => {
    expect(investmentResult(holding({ date: '2025-07-31' }), currencyRates, fy2526, []).shareInPeriod).toBe(0)
  })

  it('splits a fiscal-year holding over the calendar years it touches', () => {
    // 01.08.2025–31.07.2026 has 153 days in 2025 and 212 in 2026.
    expect(investmentResult(holding({ date: '2026-07-31' }), currencyRates, year2025, []).shareInPeriod).toBe(153 / 365)
    expect(investmentResult(holding({ date: '2026-07-31' }), currencyRates, { start: '2026-01-01', end: '2026-12-31' }, []).shareInPeriod).toBe(212 / 365)
  })

  it('leaves out a holding with an invalid date', () => {
    const r = investmentResult(holding({ date: 'ukendt' }), currencyRates, year2025, [])
    expect(r.covers).toBeNull()
    expect(r.shareInPeriod).toBe(0)
  })

  it('names a calendar year by its year and a fiscal year by both', () => {
    expect(coverLabel({ start: '2025-01-01', end: '2025-12-31' })).toBe('2025')
    expect(coverLabel({ start: '2025-08-01', end: '2026-07-31' })).toBe('2025/26')
    expect(coverLabel(null)).toBe('uden dato')
  })
})
