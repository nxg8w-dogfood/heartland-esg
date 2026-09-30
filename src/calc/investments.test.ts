import { describe, expect, it } from 'vitest'
import { currencyRates, toDKK } from '../data/currencies'
import { category15, investmentResult, type Investment } from './investments'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const holding = (o: Partial<Investment> = {}): Investment => ({
  id: '1', date: '2025-06-30', company: 'Selskab A/S', ownershipPct: 25, accountingMethod: 'Ass.', climateMethod: '', dataSource: '',
  basis: 'CO2e', totalKgCO2e: 400_000, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null,
  factorKgPerEUR: null, factorSource: '', country: 'Danmark', ...o,
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
    const r = investmentResult(holding(), currencyRates)
    expect(r.share).toBe(0.25)
    expect(r.kgCO2e).toBe(100_000)
    expect(r.included).toBe(true)
    expect(r.pending).toBe(false)
  })

  it('includes holdings of exactly 50 % and leaves out anything above', () => {
    expect(investmentResult(holding({ ownershipPct: 50 }), currencyRates).included).toBe(true)
    expect(investmentResult(holding({ ownershipPct: 50.01 }), currencyRates).included).toBe(false)
    expect(investmentResult(holding({ ownershipPct: 100 }), currencyRates).included).toBe(false)
  })

  it('leaves out a holding with no ownership share', () => {
    const r = investmentResult(holding({ ownershipPct: null }), currencyRates)
    expect(r.included).toBe(false)
    expect(r.kgCO2e).toBe(0)
  })

  it('is pending without reported emissions', () => {
    expect(investmentResult(holding({ totalKgCO2e: null }), currencyRates).pending).toBe(true)
  })

  it('estimates from revenue in DKK, converted to EUR, × factor × share', () => {
    const r = investmentResult(holding({ basis: 'Revenue', revenueDKK: 74_604_000, factorKgPerEUR: 0.1272 }), currencyRates)
    expect(r.revenueEUR).toBeCloseTo(10_000_000, 6)
    expect(r.kgCO2e).toBeCloseTo(10_000_000 * 0.1272 * 0.25, 6)
  })

  it('uses local amount × rate when revenue in DKK is blank', () => {
    const r = investmentResult(holding({ basis: 'Revenue', revenueLocal: 10_000_000, localCurrency: 'SEK', rateLocalToDKK: 0.6688, factorKgPerEUR: 0.0768 }), currencyRates)
    expect(r.revenueEUR).toBeCloseTo(6_688_000 / 7.4604, 6)
    expect(r.kgCO2e).toBeCloseTo((6_688_000 / 7.4604) * 0.0768 * 0.25, 6)
  })

  it('is pending on revenue without a factor, but not with zero revenue', () => {
    expect(investmentResult(holding({ basis: 'Revenue', revenueDKK: 1_000_000 }), currencyRates).pending).toBe(true)
    expect(investmentResult(holding({ basis: 'Revenue', revenueDKK: 0 }), currencyRates).pending).toBe(false)
  })

  it('never calculates the "Investment" basis', () => {
    const r = investmentResult(holding({ basis: 'Investment' }), currencyRates)
    expect(r.kgCO2e).toBe(0)
    expect(r.pending).toBe(true)
  })
})

describe('category15', () => {
  it('adds up included holdings in tonnes and counts consolidated ones', () => {
    const c = category15([
      holding({ id: 'a' }),
      holding({ id: 'b', ownershipPct: 10, totalKgCO2e: 2_000_000 }),
      holding({ id: 'c', ownershipPct: 80, totalKgCO2e: 9_000_000 }),
      holding({ id: 'd', totalKgCO2e: null }),
    ], currencyRates, year2025)
    expect(c.total).toBeCloseTo(100 + 200, 9)
    expect(c.consolidatedCount).toBe(1)
    expect(c.pendingCount).toBe(1)
    expect(c.periodUnderOneYear).toBe(false)
  })

  it('only includes holdings dated in the period', () => {
    const c = category15([holding({ id: 'a' }), holding({ id: 'b', date: '2024-12-31' })], currencyRates, year2025)
    expect(c.rows.map((r) => r.investment.id)).toEqual(['a'])
  })

  it('flags a period shorter than a year, since investee figures are annual', () => {
    expect(category15([holding()], currencyRates, { start: '2025-04-01', end: '2025-06-30' }).periodUnderOneYear).toBe(true)
    expect(category15([], currencyRates, { start: '2025-04-01', end: '2025-06-30' }).periodUnderOneYear).toBe(false)
  })
})
