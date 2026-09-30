import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import { periodShare } from './dates'
import { factorSegments } from './factorSegments'

const grid = 'f-s2-el-dk-2025'
const twoYears = { start: '2024-01-01', end: '2025-12-31' }
const ids = (segs: ReturnType<typeof factorSegments>) => segs.map((s) => s.factor?.id)

describe('factorSegments', () => {
  it('splits a bill crossing the new year by days, each part with its year', () => {
    // 1 Dec 2024 – 28 Feb 2025: 31 days in 2024, 59 in 2025, 90 in all.
    const segs = factorSegments(factors, grid, { date: '2024-12-01', dateTo: '2025-02-28' }, twoYears)
    expect(ids(segs)).toEqual(['f-s2-el-dk-2024', 'f-s2-el-dk-2025'])
    expect(segs[0].share).toBeCloseTo(31 / 90, 12)
    expect(segs[1].share).toBeCloseTo(59 / 90, 12)
  })

  it('only includes the part inside the period', () => {
    const segs = factorSegments(factors, grid, { date: '2024-12-01', dateTo: '2025-02-28' }, { start: '2025-01-01', end: '2025-12-31' })
    expect(ids(segs)).toEqual(['f-s2-el-dk-2025'])
    expect(segs[0].share).toBeCloseTo(59 / 90, 12)
  })

  it('keeps a line within one year as one segment', () => {
    const segs = factorSegments(factors, grid, { date: '2025-01-01', dateTo: '2025-06-30' }, twoYears)
    expect(segs).toEqual([{ factor: expect.objectContaining({ id: 'f-s2-el-dk-2025' }), share: 1 }])
  })

  it('keeps a single-day line as one segment with its date', () => {
    expect(ids(factorSegments(factors, grid, { date: '2024-07-01' }, twoYears))).toEqual(['f-s2-el-dk-2024'])
  })

  it('never splits a factor without a family', () => {
    const segs = factorSegments(factors, 'f-s1-diesel', { date: '2024-12-01', dateTo: '2025-02-28' }, twoYears)
    expect(segs).toHaveLength(1)
    expect(segs[0].share).toBe(1)
  })

  it('gives no segments for a line outside the period', () => {
    expect(factorSegments(factors, grid, { date: '2023-01-01', dateTo: '2023-03-31' }, twoYears)).toEqual([])
  })

  it('uses the fallback (the latest member) for days no member covers', () => {
    // 2025 is the latest; December 2025 → February 2026 all falls back to 2025, as one segment.
    const segs = factorSegments(factors, grid, { date: '2025-12-01', dateTo: '2026-02-28' }, { start: '2025-01-01', end: '2026-12-31' })
    expect(ids(segs)).toEqual(['f-s2-el-dk-2025'])
    expect(segs[0].share).toBeCloseTo(1, 12)
  })

  it('handles three years and a leap year', () => {
    const family: Factor[] = [2024, 2025, 2026].map((y) => ({
      id: `g${y}`, scope: 'Scope 2', category: 'x', name: String(y), region: '', unit: 'kg CO2e/kWh', value: y - 2020,
      source: '', reference: '', family: 'g', validFrom: `${y}-01-01`, validTo: `${y}-12-31`,
    }))
    const line = { date: '2024-01-01', dateTo: '2026-12-31' }
    const segs = factorSegments(family, 'g2025', line, { start: '2024-01-01', end: '2026-12-31' })
    expect(ids(segs)).toEqual(['g2024', 'g2025', 'g2026'])
    expect(segs.map((s) => Math.round(s.share * 1096))).toEqual([366, 365, 365])
  })

  it('always adds up to the line’s share of the period', () => {
    const lines = [
      { date: '2024-11-15', dateTo: '2025-03-10' },
      { date: '2024-02-10', dateTo: '2026-05-01' },
      { date: '2025-06-01', dateTo: '2025-06-30' },
      { date: '2023-10-01', dateTo: '2024-01-31' },
    ]
    const periods = [twoYears, { start: '2024-12-15', end: '2025-01-15' }, { start: '2025-02-01', end: '2025-02-28' }]
    for (const line of lines) {
      for (const period of periods) {
        const sum = factorSegments(factors, grid, line, period).reduce((t, s) => t + s.share, 0)
        expect(sum, JSON.stringify({ line, period })).toBeCloseTo(periodShare(line, period), 12)
      }
    }
  })
})
