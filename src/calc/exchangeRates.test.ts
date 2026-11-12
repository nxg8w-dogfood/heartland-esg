import { describe, expect, it } from 'vitest'
import { currencyRates } from '../data/currencies'
import { dailyRates } from '../data/exchangeRates'
import type { Factor } from '../data/factors'
import { appRates, dailyDkkRate, dkkRate, type DailyRates, type RateSource } from './exchangeRates'
import { noDeflation, spendLine, type SpendGroup, type SpendLine } from './spend'

// Friday 2026-01-02 and Monday 2026-01-05; nothing over the weekend
const daily: DailyRates = {
  codes: ['DKK', 'GBP', 'USD'],
  days: [
    ['2026-01-02', [7.47, 0.83, 1.1]],
    ['2026-01-05', [7.46, 0.80, null]],
  ],
}
const source: RateSource = { fixed: currencyRates, daily }

describe('dailyDkkRate', () => {
  it('converts the per-euro rates to DKK per unit', () => {
    expect(dailyDkkRate(daily, 'GBP', '2026-01-05')).toEqual({ value: 7.46 / 0.8, rateDate: '2026-01-05' })
    expect(dailyDkkRate(daily, 'EUR', '2026-01-05')).toEqual({ value: 7.46, rateDate: '2026-01-05' })
  })

  it('uses the last business day before a weekend', () => {
    expect(dailyDkkRate(daily, 'GBP', '2026-01-04')).toEqual({ value: 7.47 / 0.83, rateDate: '2026-01-02' })
  })

  it('goes further back when a day has no rate for the currency', () => {
    expect(dailyDkkRate(daily, 'USD', '2026-01-05')?.rateDate).toBe('2026-01-02')
  })

  it('has no rate before the table, more than a week after it, or for an unknown currency', () => {
    expect(dailyDkkRate(daily, 'GBP', '2025-12-31')).toBeNull()
    expect(dailyDkkRate(daily, 'GBP', '2026-01-13')).toBeNull()
    expect(dailyDkkRate(daily, 'CHF', '2026-01-05')).toBeNull()
  })
})

describe('dkkRate', () => {
  it('is 1 for DKK and a missing currency', () => {
    expect(dkkRate(source, 'DKK', '2026-01-05').value).toBe(1)
    expect(dkkRate(source, '', '2026-01-05').value).toBe(1)
  })

  it('falls back to a known fixed rate and says so', () => {
    const r = dkkRate(source, 'EUR', '2027-06-01')
    expect(r.value).toBe(7.4604)
    expect(r.note).toMatch(/fast kurs/)
  })

  it('gives no rate for a currency without a daily or fixed rate, rather than treating it as DKK', () => {
    expect(dkkRate(source, 'GBP', '2027-06-01')).toMatchObject({ value: null, note: 'Ingen kurs for GBP den 2027-06-01.' })
  })

  it('keeps the old behaviour with fixed rates only', () => {
    expect(dkkRate(currencyRates, 'EUR', '2026-01-05').value).toBe(7.4604)
    expect(dkkRate(currencyRates, 'GBP', '2026-01-05').value).toBe(1)
  })
})

describe('spend lines with daily rates', () => {
  const rent: Factor = { id: 'f-rent', scope: 'Scope 3', category: 'x', name: 'Rent', region: 'UK', unit: 'kg CO2e/GBP', value: 0.15, source: 's', reference: 'r', method: 'spend' }
  const group: SpendGroup = { id: 'g', label: 'Husleje', sector: '', factorId: 'f-rent' }
  const line = (o: Partial<SpendLine> = {}): SpendLine => ({ id: 'l', group: 'g', date: '2026-01-05', amount: 9325, currency: 'DKK', ...o })
  const period = { start: '2026-01-01', end: '2026-12-31' }

  it('convert DKK to the factor\'s currency at the rate on the line\'s date', () => {
    const r = spendLine(line(), group, [rent], source, noDeflation, period)
    expect(r.amountInFactorCurrency).toBeCloseTo(9325 / (7.46 / 0.8), 9)
    expect(r.tCO2e).toBeCloseTo((1000 * 0.15) / 1000, 9)
    expect(r.rateDate).toBe('2026-01-05')
    expect(r.warning).toBeNull()
  })

  it('are pending, with a warning, when there is no rate', () => {
    const r = spendLine(line({ date: '2027-06-01' }), group, [rent], source, noDeflation, { start: '2027-01-01', end: '2027-12-31' })
    expect(r).toMatchObject({ pending: true, tCO2e: 0, amountInFactorCurrency: null })
    expect(r.warning).toMatch(/Ingen kurs for GBP/)
  })

  it('need no rate when the line is already in the factor\'s currency', () => {
    const r = spendLine(line({ currency: 'GBP', amount: 100, date: '2030-01-01' }), group, [rent], source, noDeflation, { start: '2030-01-01', end: '2030-12-31' })
    expect(r).toMatchObject({ amountInFactorCurrency: 100, rateDate: null, pending: false })
  })
})

describe('the generated rate table', () => {
  it('is sorted by date, starts with DKK and looks like ECB rates', () => {
    const dates = dailyRates.days.map(([d]) => d)
    expect(dates).toEqual([...dates].sort())
    expect(dailyRates.codes[0]).toBe('DKK')
    for (const [, v] of dailyRates.days) expect(v[0]).toBeGreaterThan(7.4)
    expect(dates[0] <= '2024-01-02').toBe(true)
  })

  it('is what the app uses', () => {
    expect(dkkRate(appRates, 'EUR', dailyRates.days[0][0]).rateDate).toBe(dailyRates.days[0][0])
  })
})
