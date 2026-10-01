import { describe, expect, it } from 'vitest'
import { currencyRates } from '../data/currencies'
import { factors } from '../data/factors'
import { category1, category1Groups } from './scope3'
import { deflationFor, defaultPriceIndexSeries, noDeflation, spendLine, type Deflation, type SpendLine } from './spend'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const consulting = category1Groups.find((g) => g.id === 'k1-raadgivning')!
const software = category1Groups.find((g) => g.id === 'k1-software')!
const line = (o: Partial<SpendLine> = {}): SpendLine => ({ id: '1', group: 'k1-raadgivning', date: '2025-05-01', amount: 746_040, currency: 'DKK', ...o })

const ppi = (points: [number, number][]) => defaultPriceIndexSeries.map((s) => (s.id === 'idx-dst-ppi' ? { ...s, points: points.map(([year, value]) => ({ year, value })) } : s))
const deflating = (o: Partial<Deflation> = {}): Deflation => ({
  active: true, seriesId: 'idx-dst-ppi', series: ppi([[2020, 100], [2025, 125]]), factorSettings: { 'f-exio-obs-dk': { baseYear: 2020 } }, ...o,
})

// Expected values were checked against the original app's own calculation.
describe('spendLine', () => {
  it('converts DKK to EUR and multiplies by the factor per EUR', () => {
    const r = spendLine(line(), consulting, factors, currencyRates, noDeflation, year2025)
    expect(r.factorCurrency).toBe('EUR')
    expect(r.amountInFactorCurrency).toBeCloseTo(100_000, 6)
    expect(r.tCO2e).toBeCloseTo((100_000 * 0.1272) / 1000, 9)
    expect(r.pending).toBe(false)
  })

  it('converts from other currencies via DKK', () => {
    const r = spendLine(line({ amount: 100_000, currency: 'SEK' }), consulting, factors, currencyRates, noDeflation, year2025)
    expect(r.amountInFactorCurrency).toBeCloseTo((100_000 * 0.6688) / 7.4604, 6)
  })

  it('is pending when the sector factor has no value yet, as most Danish EXIOBASE ones', () => {
    const r = spendLine(line({ group: 'k1-software' }), software, factors, currencyRates, noDeflation, year2025)
    expect(r.factorValue).toBeNull()
    expect(r.pending).toBe(true)
    expect(r.tCO2e).toBe(0)
  })

  it('uses a custom factor per EUR', () => {
    const r = spendLine(line({ group: 'k1-software', customFactor: 0.2 }), software, factors, currencyRates, noDeflation, year2025)
    expect(r.tCO2e).toBeCloseTo(20, 9)
  })

  it('leaves excluded groups out without making them pending', () => {
    const water = category1Groups.find((g) => g.id === 'k1-vand')!
    const r = spendLine(line({ group: 'k1-vand' }), water, factors, currencyRates, noDeflation, year2025)
    expect(r).toMatchObject({ excluded: true, pending: false, tCO2e: 0 })
  })

  it('counts only the part of a line inside the period', () => {
    const r = spendLine(line({ date: '2024-12-01', dateTo: '2025-01-31' }), consulting, factors, currencyRates, noDeflation, year2025)
    expect(r.amountInFactorCurrency).toBeCloseTo((100_000 * 31) / 62, 6)
  })
})

describe('price deflation', () => {
  it('deflates to the factor’s price year: amount ÷ (index now ÷ index base)', () => {
    const r = spendLine(line(), consulting, factors, currencyRates, deflating(), year2025)
    expect(r.deflation).toMatchObject({ status: 'applied', ratio: 1.25, baseYear: 2020, year: 2025 })
    expect(r.deflatedAmount).toBeCloseTo(80_000, 6)
    expect(r.tCO2e).toBeCloseTo((80_000 * 0.1272) / 1000, 9)
  })

  it('does nothing when switched off', () => {
    expect(deflationFor(noDeflation, factors.find((f) => f.id === 'f-exio-obs-dk')!, '2025-05-01').status).toBe('not-active')
  })

  it('never applies to activity factors', () => {
    expect(deflationFor(deflating(), factors.find((f) => f.id === 'f-s1-diesel')!, '2025-05-01').status).toBe('not-spend')
  })

  it('needs a series, a base year and both index points, and warns when one is missing', () => {
    expect(spendLine(line(), consulting, factors, currencyRates, deflating({ seriesId: null }), year2025).deflation.status).toBe('no-series')
    const noBase = spendLine(line(), consulting, factors, currencyRates, deflating({ factorSettings: {} }), year2025)
    expect(noBase.deflation.status).toBe('no-base-year')
    expect(noBase.warning).toBe('Spendfaktoren mangler basisår — indeksregulering kan ikke anvendes.')
    const noPoint = spendLine(line({ date: '2026-02-01' }), consulting, factors, currencyRates, deflating(), { start: '2026-01-01', end: '2026-12-31' })
    expect(noPoint.deflation.status).toBe('no-index-point')
    expect(noPoint.warning).toBe('Indeksserien mangler værdi for linjens år eller for faktorens basisår.')
    expect(noPoint.deflatedAmount).toBeCloseTo(100_000, 6)
  })

  it('lets a factor use its own series', () => {
    const series = ppi([]).map((s) => (s.id === 'idx-bnp-deflator' ? { ...s, points: [{ year: 2020, value: 100 }, { year: 2025, value: 110 }] } : s))
    const r = spendLine(line(), consulting, factors, currencyRates, deflating({ series, factorSettings: { 'f-exio-obs-dk': { baseYear: 2020, seriesId: 'idx-bnp-deflator' } } }), year2025)
    expect(r.deflation.ratio).toBeCloseTo(1.1, 12)
  })

  it('treats an index of 0 for the base year as missing', () => {
    expect(spendLine(line(), consulting, factors, currencyRates, deflating({ series: ppi([[2020, 0], [2025, 125]]) }), year2025).deflation.status).toBe('no-index-point')
  })
})

describe('category1', () => {
  it('has the original 21 purchase types, water and banking excluded', () => {
    expect(category1Groups).toHaveLength(21)
    expect(category1Groups.filter((g) => g.excluded).map((g) => g.id)).toEqual(['k1-vand', 'k1-bank'])
    for (const g of category1Groups.filter((x) => !x.excluded)) expect(factors.some((f) => f.id === g.factorId), g.id).toBe(true)
  })

  it('adds up lines and counts pending, excluded and deflated ones', () => {
    const c = category1([
      line({ id: 'a' }),
      line({ id: 'b', group: 'k1-software' }),
      line({ id: 'c', group: 'k1-bank' }),
      line({ id: 'd', date: '2024-05-01' }),
    ], factors, currencyRates, deflating(), year2025)
    expect(c.lines.map((r) => r.line.id)).toEqual(['a', 'b', 'c'])
    expect(c.total).toBeCloseTo((80_000 * 0.1272) / 1000, 9)
    expect(c).toMatchObject({ pendingCount: 1, excludedCount: 1, deflatedCount: 1 })
  })

  it('throws on an unknown group', () => {
    expect(() => category1([line({ group: 'nope' })], factors, currencyRates, noDeflation, year2025)).toThrow('Unknown group: nope')
  })
})
