import { describe, expect, it } from 'vitest'
import {
  defaultPeriod, formatRange, latestPeriod, nextPeriod, overlaps, periodError, periodName, periodOrLatest, periodsError, sortPeriods, type FiscalPeriod,
} from './periods'

const p = (id: string, name: string, start: string, end: string): FiscalPeriod => ({ id, name, start, end })
const y2024 = p('a', '2024', '2024-01-01', '2024-12-31')
const y2025 = p('b', '2025', '2025-01-01', '2025-12-31')
const fy2526 = p('c', '2025/26', '2025-07-01', '2026-06-30')

describe('periodError', () => {
  it('accepts a period with a name and a start before its end, next to periods it doesn’t touch', () => {
    expect(periodError(y2025, [y2024])).toBeNull()
    expect(periodError(p('n', 'Dagen efter', '2025-01-01', '2025-01-02'), [y2024])).toBeNull()
  })

  it('requires a name, not already used by another period of the company (ignoring case and spaces)', () => {
    expect(periodError({ ...y2025, name: '  ' }, [])).toBe('Giv perioden et navn.')
    expect(periodError(p('x', ' 2024 ', '2026-01-01', '2026-12-31'), [y2024])).toContain('allerede')
    // Its own name is fine: the period itself is among the others when it's edited.
    expect(periodError(y2024, [y2024, y2025])).toBeNull()
  })

  it('requires two real dates', () => {
    expect(periodError({ ...y2025, start: '' }, [])).toBe('Angiv både en start- og en slutdato.')
    expect(periodError({ ...y2025, end: '2025-02-30' }, [])).toBe('Angiv både en start- og en slutdato.')
    expect(periodError({ ...y2025, start: '1.1.2025' }, [])).toBe('Angiv både en start- og en slutdato.')
  })

  it('requires the start before the end', () => {
    expect(periodError({ ...y2025, start: '2025-12-31', end: '2025-01-01' }, [])).toBe('Startdatoen skal ligge før slutdatoen.')
    expect(periodError({ ...y2025, end: '2025-01-01' }, [])).toBe('Startdatoen skal ligge før slutdatoen.')
  })

  it('refuses an overlap with another period, even by a single day, and names it', () => {
    expect(periodError(fy2526, [y2024, y2025])).toBe('Perioden overlapper 2025 (1.1.2025–31.12.2025).')
    expect(periodError(p('x', 'Kant', '2024-12-31', '2025-03-31'), [y2024])).toContain('overlapper 2024')
    expect(periodError(p('x', 'Indeni', '2025-03-01', '2025-03-31'), [y2025])).toContain('overlapper 2025')
    expect(periodError(p('x', 'Omkring', '2023-01-01', '2026-12-31'), [y2025])).toContain('overlapper 2025')
  })
})

describe('periodsError', () => {
  it('needs at least one period, and reports the first invalid one', () => {
    expect(periodsError([])).toBe('Virksomheden skal have mindst én periode.')
    expect(periodsError([y2024, y2025])).toBeNull()
    expect(periodsError([y2025, fy2526])).toMatch(/^2025: Perioden overlapper 2025\/26/)
  })
})

describe('overlaps', () => {
  it('counts both ends as inside', () => {
    expect(overlaps(y2024, y2025)).toBe(false)
    expect(overlaps(y2024, { start: '2024-12-31', end: '2025-01-05' })).toBe(true)
  })
})

describe('choosing a period', () => {
  it('sorts by start, and takes the one that starts last as the latest', () => {
    expect(sortPeriods([fy2526, y2024, y2025]).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(latestPeriod([y2025, fy2526, y2024])?.id).toBe('c')
    expect(latestPeriod([])).toBeUndefined()
  })

  it('finds a period by id, or falls back to the latest', () => {
    expect(periodOrLatest([y2024, y2025], 'a')?.id).toBe('a')
    expect(periodOrLatest([y2024, y2025], 'gone')?.id).toBe('b')
    expect(periodOrLatest([y2024, y2025], undefined)?.id).toBe('b')
  })
})

describe('periodName', () => {
  it('names a calendar year by its year, and a twelve-month fiscal year as 2025/26', () => {
    expect(periodName({ start: '2025-01-01', end: '2025-12-31' })).toBe('2025')
    expect(periodName({ start: '2025-07-01', end: '2026-06-30' })).toBe('2025/26')
    expect(periodName({ start: '2099-04-01', end: '2100-03-31' })).toBe('2099/00')
  })

  it('uses the dates for anything else', () => {
    expect(periodName({ start: '2025-01-01', end: '2025-06-30' })).toBe('1.1.2025–30.6.2025')
    expect(periodName({ start: '2025-07-15', end: '2026-07-14' })).toBe('15.7.2025–14.7.2026')
    expect(periodName({ start: '2024-01-01', end: '2025-12-31' })).toBe('1.1.2024–31.12.2025')
  })

  it('formats a range the Danish way', () => {
    expect(formatRange({ start: '2025-07-01', end: '2026-06-30' })).toBe('1.7.2025–30.6.2026')
  })
})

describe('defaultPeriod', () => {
  it('is last calendar year', () => {
    expect(defaultPeriod('x', new Date('2026-11-11'))).toEqual(p('x', '2025', '2025-01-01', '2025-12-31'))
  })
})

describe('nextPeriod', () => {
  it('follows the latest period with one as long, so it never overlaps', () => {
    expect(nextPeriod('n', [y2024, y2025])).toEqual(p('n', '2026', '2026-01-01', '2026-12-31'))
    expect(nextPeriod('n', [fy2526])).toEqual(p('n', '2026/27', '2026-07-01', '2027-06-30'))
    expect(nextPeriod('n', [p('q', 'Q1', '2025-01-01', '2025-03-31')])).toMatchObject({ start: '2025-04-01', end: '2025-06-30' })
    // Not whole months: the same number of days.
    expect(nextPeriod('n', [p('d', 'Ti dage', '2025-01-05', '2025-01-14')])).toMatchObject({ start: '2025-01-15', end: '2025-01-24' })
  })

  it('handles leap years and month ends', () => {
    expect(nextPeriod('n', [p('m', 'Jan', '2024-01-01', '2024-01-31')])).toMatchObject({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('follows the period that ends last, not the one listed last', () => {
    expect(nextPeriod('n', [y2025, y2024]).start).toBe('2026-01-01')
  })

  it('is valid among the existing periods, with the dates as its name if the usual one is taken', () => {
    const taken = [y2024, p('b', '2026', '2025-01-01', '2025-12-31')]
    const next = nextPeriod('n', taken)
    expect(next.name).toBe('1.1.2026–31.12.2026')
    expect(periodError(next, taken)).toBeNull()
  })

  it('gives last year to a company without periods', () => {
    expect(nextPeriod('n', [], new Date('2026-11-11'))).toEqual(p('n', '2025', '2025-01-01', '2025-12-31'))
  })
})
