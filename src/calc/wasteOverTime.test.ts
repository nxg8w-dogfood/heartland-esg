import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import type { ActivityLine } from './activity'
import { category5 } from './scope3'
import { wasteArea, wasteOverTime } from './wasteOverTime'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const lines: ActivityLine[] = [
  { id: 'a', group: 'k5-papir-gen', date: '2025-01-01', dateTo: '2025-01-31', quantity: 1 },
  { id: 'b', group: 'k5-papir-gen', date: '2025-02-01', dateTo: '2025-03-31', quantity: 2 },
  { id: 'c', group: 'k5-papir-dep', date: '2025-02-01', dateTo: '2025-02-28', quantity: 0.5 },
  { id: 'd', group: 'k5-plast-gen', date: '2025-06-01', dateTo: '2025-06-30', quantity: 0.25 },
  { id: 'e', group: 'k5-erhverv-forbr', date: '2025-11-01', dateTo: '2025-11-30', quantity: 3 },
]

describe('wasteArea', () => {
  it('splits a row type into its fraction and its treatment', () => {
    expect(wasteArea('Pap/papir – genanvendelse', 'fraction')).toBe('Pap/papir')
    expect(wasteArea('Pap/papir – genanvendelse', 'treatment')).toBe('Genanvendelse')
    expect(wasteArea('Restaffald fra erhverv – forbrænding m/energi', 'treatment')).toBe('Forbrænding m/energi')
    expect(wasteArea('Pap/papir – genanvendelse', 'type')).toBe('Pap/papir – genanvendelse')
  })
})

describe('wasteOverTime', () => {
  it('adds up to the period, in tonnes and tCO2e', () => {
    const { total, series } = wasteOverTime(lines, factors, year2025, 'type')
    const period = category5(lines, factors, year2025)
    expect(total.tonnes).toBeCloseTo(6.75, 9)
    expect(total.t).toBeCloseTo(period.total, 9)
    expect(series.reduce((t, s) => t + s.tonnes, 0)).toBeCloseTo(total.tonnes, 9)
    expect(total.months).toHaveLength(12)
  })

  it('spreads a line over the months it covers', () => {
    const paper = wasteOverTime(lines, factors, year2025, 'type').series.find((s) => s.key === 'Pap/papir – genanvendelse')!
    const [jan, feb, mar, apr] = paper.months.map((m) => m.tonnes)
    expect(jan).toBeCloseTo(1, 9)
    expect(feb + mar).toBeCloseTo(2, 9)
    expect(feb).toBeCloseTo((2 * 28) / 59, 9)
    expect(apr).toBe(0)
  })

  it('groups by fraction or treatment, largest first', () => {
    expect(wasteOverTime(lines, factors, year2025, 'fraction').series.map((s) => [s.label, s.tonnes])).toEqual([
      ['Pap/papir', 3.5],
      ['Restaffald fra erhverv', 3],
      ['Plast', 0.25],
    ])
    expect(wasteOverTime(lines, factors, year2025, 'treatment').series.map((s) => s.label)).toEqual(['Genanvendelse', 'Forbrænding m/energi', 'Deponi'])
  })

  it('has nothing for a period without waste', () => {
    const { total, series } = wasteOverTime(lines, factors, { start: '2024-01-01', end: '2024-12-31' }, 'type')
    expect(total.tonnes).toBe(0)
    expect(series).toEqual([])
  })
})
