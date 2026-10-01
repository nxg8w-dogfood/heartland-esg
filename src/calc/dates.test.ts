import { describe, expect, it } from 'vitest'
import { dayValue, periodShare } from './dates'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

describe('periodShare', () => {
  it('counts a single-day line inside the period fully', () => {
    expect(periodShare({ date: '2025-06-15' }, year2025)).toBe(1)
  })

  it('includes both the first and last day of the period', () => {
    expect(periodShare({ date: '2025-01-01' }, year2025)).toBe(1)
    expect(periodShare({ date: '2025-12-31' }, year2025)).toBe(1)
  })

  it('leaves out a single-day line outside the period', () => {
    expect(periodShare({ date: '2024-12-31' }, year2025)).toBe(0)
    expect(periodShare({ date: '2026-01-01' }, year2025)).toBe(0)
  })

  it('counts a range fully inside the period fully', () => {
    expect(periodShare({ date: '2025-03-01', dateTo: '2025-03-31' }, year2025)).toBe(1)
  })

  it('splits a range across the period boundary by days, counting both ends', () => {
    // 2024-12-01..2025-01-31 is 62 days, of which 31 are in 2025.
    expect(periodShare({ date: '2024-12-01', dateTo: '2025-01-31' }, year2025)).toBe(31 / 62)
  })

  it('gives 0 for a range entirely outside the period', () => {
    expect(periodShare({ date: '2024-01-01', dateTo: '2024-06-30' }, year2025)).toBe(0)
  })

  it('treats an end date before or equal to the start as a single day', () => {
    expect(periodShare({ date: '2025-05-01', dateTo: '2025-04-01' }, year2025)).toBe(1)
    expect(periodShare({ date: '2025-05-01', dateTo: '2025-05-01' }, year2025)).toBe(1)
  })

  it('gives 0 for invalid dates instead of guessing', () => {
    expect(periodShare({ date: 'not a date' }, year2025)).toBe(0)
    expect(periodShare({ date: '2025-06-15' }, { start: '', end: '2025-12-31' })).toBe(0)
  })

  it('treats an invalid end date as a single-day line', () => {
    expect(periodShare({ date: '2025-06-15', dateTo: 'soon' }, year2025)).toBe(1)
  })

  it('handles a period spanning a leap day', () => {
    // Feb 2024 has 29 days; the line covers all of February, the period its first half.
    expect(periodShare({ date: '2024-02-01', dateTo: '2024-02-29' }, { start: '2024-02-01', end: '2024-02-14' })).toBe(14 / 29)
  })
})

describe('dayValue', () => {
  it('ignores a time part, so timestamps land on their UTC day', () => {
    expect(dayValue('2025-06-15T23:59:00+02:00')).toBe(dayValue('2025-06-15'))
  })

  it('is NaN for empty input', () => {
    expect(dayValue('')).toBeNaN()
    expect(dayValue(null)).toBeNaN()
  })
})
