import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import { scope1Line, scope1Summary, type Scope1Line } from './scope1'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const line = (overrides: Partial<Scope1Line>): Scope1Line => ({
  id: '1',
  group: 's1-diesel',
  date: '2025-03-15',
  quantity: 1000,
  ...overrides,
})

describe('scope1Line', () => {
  // Expected values were checked against the original app's own calculation.
  it.each([
    ['s1-diesel', 1000, 2.57082],
    ['s1-benzin', 1000, 2.06916],
    ['s1-naturgas', 5000, 10.3336],
    ['s1-gasolie', 250, 0.6888525],
    ['s1-hfc134a', 2, 2.6],
  ] as const)('%s: %d units give %d tCO2e', (group, quantity, expected) => {
    expect(scope1Line(line({ group, quantity }), factors, year2025).tCO2e).toBeCloseTo(expected, 10)
  })

  it('is pending for "other refrigerant" until a GWP is entered', () => {
    const r = scope1Line(line({ group: 's1-koel-andet', quantity: 3 }), factors, year2025)
    expect(r.pending).toBe(true)
    expect(r.tCO2e).toBe(0)
    expect(r.factorValue).toBeNull()
  })

  it('uses a custom factor, e.g. the GWP of a specific refrigerant', () => {
    const r = scope1Line(line({ group: 's1-koel-andet', quantity: 3, customFactor: 2088 }), factors, year2025)
    expect(r.pending).toBe(false)
    expect(r.tCO2e).toBeCloseTo(6.264, 10)
    expect(r.factorValue).toBe(2088)
  })

  it('reports the factor it used, with its source', () => {
    const r = scope1Line(line({}), factors, year2025)
    expect(r.factor?.id).toBe('f-s1-diesel')
    expect(r.factor?.source).toBe('BEIS GHG Conversion Factors 2025')
    expect(r.warning).toBeNull()
  })

  it('flags an invalid quantity instead of counting it as 0', () => {
    const r = scope1Line(line({ quantity: Number.NaN }), factors, year2025)
    expect(r.pending).toBe(true)
    expect(r.warning).toBe('Mængden er ikke et gyldigt tal.')
  })

  it('throws on an unknown group rather than silently skipping the line', () => {
    expect(() => scope1Line(line({ group: 'nope' as never }), factors, year2025)).toThrow('Unknown Scope 1 group')
  })
})

describe('scope1Summary', () => {
  const lines: Scope1Line[] = [
    line({ id: 'a', group: 's1-diesel', quantity: 1000 }),
    line({ id: 'b', group: 's1-benzin', quantity: 500 }),
    line({ id: 'c', group: 's1-naturgas', quantity: 5000 }),
    line({ id: 'd', group: 's1-hfc134a', quantity: 1 }),
    line({ id: 'e', group: 's1-koel-andet', quantity: 2 }),
    line({ id: 'f', group: 's1-diesel', quantity: 9999, date: '2024-06-01' }),
  ]
  const s = scope1Summary(lines, factors, year2025)

  it('leaves out lines outside the period', () => {
    expect(s.lines.map((r) => r.line.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('splits totals into mobile, stationary and fugitive', () => {
    expect(s.mobile).toBeCloseTo(2.57082 + 1.03458, 10)
    expect(s.stationary).toBeCloseTo(10.3336, 10)
    expect(s.fugitive).toBeCloseTo(1.3, 10)
    expect(s.total).toBeCloseTo(s.mobile + s.stationary + s.fugitive, 10)
  })

  it('counts pending lines', () => {
    expect(s.pendingCount).toBe(1)
  })

  it('gives zeros for no lines', () => {
    const empty = scope1Summary([], factors, year2025)
    expect(empty).toMatchObject({ total: 0, mobile: 0, stationary: 0, fugitive: 0, pendingCount: 0, lines: [] })
  })

  it('prorates a line that crosses the period boundary', () => {
    // 62 days, 31 of them in 2025.
    const r = scope1Summary([line({ date: '2024-12-01', dateTo: '2025-01-31', quantity: 620 })], factors, year2025)
    expect(r.lines[0].quantityInPeriod).toBeCloseTo(310, 10)
    expect(r.total).toBeCloseTo((310 * 2.57082) / 1000, 10)
  })
})

describe('scope1Line across a change of factor', () => {
  // No Scope 1 factor spans years yet; a 2026 BEIS update would. Simulate one.
  const withDiesel2026: Factor[] = [
    ...factors.map((f) => (f.id === 'f-s1-diesel' ? { ...f, family: 'diesel', validTo: '2025-12-31' } : f)),
    { ...factors.find((f) => f.id === 'f-s1-diesel')!, id: 'f-s1-diesel-2026', value: 2.5, family: 'diesel', validFrom: '2026-01-01' },
  ]
  const twoYears = { start: '2025-01-01', end: '2026-12-31' }
  // 1 Dec 2025 – 28 Feb 2026: 31 days in 2025, 59 in 2026.
  const crossing = line({ date: '2025-12-01', dateTo: '2026-02-28', quantity: 900 })

  it('uses each year’s factor for its own days', () => {
    const r = scope1Line(crossing, withDiesel2026, twoYears)
    expect(r.tCO2e).toBeCloseTo((310 * 2.57082 + 590 * 2.5) / 1000, 10)
    expect(r.quantityInPeriod).toBeCloseTo(900, 10)
    expect(r.factor?.id).toBe('f-s1-diesel-2026')
    expect(r.factorValue! * r.quantityInPeriod! / 1000).toBeCloseTo(r.tCO2e, 10)
  })

  it('still uses a custom factor for the whole line', () => {
    expect(scope1Line({ ...crossing, customFactor: 3 }, withDiesel2026, twoYears).tCO2e).toBeCloseTo(2.7, 10)
  })

  it('flags an invalid quantity on a split line too', () => {
    const r = scope1Line({ ...crossing, quantity: Number.NaN }, withDiesel2026, twoYears)
    expect(r.pending).toBe(true)
    expect(r.quantityInPeriod).toBeNull()
  })
})
