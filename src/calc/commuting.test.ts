import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { category7, commutingModes, surveyResult, type Survey } from './commuting'
import { periodYearsList, yearShare } from './dates'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const survey = (o: Partial<Survey> = {}): Survey => ({
  id: 's',
  label: 'Pendling 2025',
  date: '2025-03-01',
  employees: 100,
  responses: 40,
  workWeeksPerYear: 46,
  modes: {
    // 40 respondents: 20 by diesel car, 10 by train, 10 by bike.
    'k7-diesel': { respondents: 20, distanceKm: 15, officeDaysPerWeek: 4 },
    'k7-tog': { respondents: 10, distanceKm: 30, officeDaysPerWeek: 3 },
    'k7-cykel': { respondents: 10, distanceKm: 5, officeDaysPerWeek: 5 },
  },
  ...o,
})

describe('yearShare', () => {
  it('is 1 for a whole calendar year, leap years included', () => {
    expect(yearShare(2025, year2025)).toBe(1)
    expect(yearShare(2024, { start: '2024-01-01', end: '2024-12-31' })).toBe(1)
  })

  it('counts the period days in that year over the year length', () => {
    expect(yearShare(2025, { start: '2025-01-01', end: '2025-03-31' })).toBe(90 / 365)
    expect(yearShare(2024, { start: '2024-01-01', end: '2024-03-31' })).toBe(91 / 366)
  })

  it('splits a financial year between the two calendar years', () => {
    const fy = { start: '2025-07-01', end: '2026-06-30' }
    expect(yearShare(2025, fy)).toBe(184 / 365)
    expect(yearShare(2026, fy)).toBe(181 / 365)
    expect(yearShare(2027, fy)).toBe(0)
  })

  it('is 0 for a reversed or invalid period', () => {
    expect(yearShare(2025, { start: '2025-12-31', end: '2025-01-01' })).toBe(0)
    expect(yearShare(2025, { start: '', end: '2025-01-01' })).toBe(0)
  })
})

describe('periodYearsList', () => {
  it('lists the calendar years a period touches', () => {
    expect(periodYearsList({ start: '2024-07-01', end: '2026-02-28' })).toEqual([2024, 2025, 2026])
    expect(periodYearsList(year2025)).toEqual([2025])
    expect(periodYearsList({ start: '2025-12-31', end: '2025-01-01' })).toEqual([])
  })
})

describe('surveyResult', () => {
  // Expected values were checked against the original app's own calculation.
  const r = surveyResult(survey(), factors, year2025)
  const mode = (id: string) => r.modes.find((m) => m.mode.id === id)!

  it('scales each mode up to all employees by its share of respondents', () => {
    expect(r.totalRespondents).toBe(40)
    expect(mode('k7-diesel').share).toBe(0.5)
    // 15 km × 2 × 4 days × 46 weeks × 0.5 × 100 employees
    expect(mode('k7-diesel').kmPerYear).toBe(276_000)
    expect(mode('k7-tog').kmPerYear).toBe(30 * 2 * 3 * 46 * 0.25 * 100)
  })

  it('multiplies km by the mode factor', () => {
    expect(mode('k7-diesel').tCO2e).toBeCloseTo((276_000 * 0.17304) / 1000, 9)
    expect(mode('k7-tog').tCO2e).toBeCloseTo((207_000 * 0.03546) / 1000, 9)
    expect(mode('k7-cykel').tCO2e).toBe(0)
    expect(r.total).toBeCloseTo(47.75904 + 7.34022, 9)
  })

  it('reports the response rate', () => {
    expect(r.responseRate).toBe(40)
    expect(surveyResult(survey({ responses: null }), factors, year2025).responseRate).toBeNull()
  })

  it('scales to a shorter period', () => {
    const q1 = surveyResult(survey(), factors, { start: '2025-01-01', end: '2025-03-31' })
    expect(q1.total).toBeCloseTo((r.total * 90) / 365, 9)
    expect(q1.annualT).toBeCloseTo(r.total, 9)
  })

  it('stands for the calendar year it is dated in', () => {
    expect(r.year).toBe(2025)
    expect(r.yearShare).toBe(1)
    expect(surveyResult(survey({ date: 'nope' }), factors, year2025)).toMatchObject({ year: null, yearShare: 0, total: 0 })
  })

  it('uses the Danish-adjusted factor for electric cars when chosen', () => {
    const answers = { respondents: 10, distanceKm: 20, officeDaysPerWeek: 5 }
    const beis = surveyResult(survey({ modes: { 'k7-el': answers } }), factors, year2025)
    const dk = surveyResult(survey({ modes: { 'k7-el': { ...answers, factorId: 'f-c-el-dk' } } }), factors, year2025)
    expect(beis.modes.find((m) => m.mode.id === 'k7-el')!.factorValue).toBe(0.04047)
    expect(dk.total / beis.total).toBeCloseTo(0.01347 / 0.04047, 12)
  })

  it('is pending for "other" until a factor is entered', () => {
    const answers = { respondents: 5, distanceKm: 10, officeDaysPerWeek: 5 }
    const pending = surveyResult(survey({ modes: { 'k7-andet': answers } }), factors, year2025)
    expect(pending.modes.find((m) => m.mode.id === 'k7-andet')!.pending).toBe(true)
    const entered = surveyResult(survey({ modes: { 'k7-andet': { ...answers, customFactor: 0.1 } } }), factors, year2025)
    expect(entered.total).toBeCloseTo((10 * 2 * 5 * 46 * 100 * 0.1) / 1000, 9)
  })

  it('gives zero without employees, respondents or work weeks', () => {
    expect(surveyResult(survey({ employees: null }), factors, year2025).total).toBe(0)
    expect(surveyResult(survey({ workWeeksPerYear: 0 }), factors, year2025).total).toBe(0)
    expect(surveyResult(survey({ modes: {} }), factors, year2025).totalRespondents).toBe(0)
  })

  it('lists every mode, in the original order', () => {
    expect(r.modes.map((m) => m.mode.id)).toEqual(commutingModes.map((m) => m.id))
  })
})

describe('category7', () => {
  const twoYears = { start: '2024-01-01', end: '2025-12-31' }

  it('counts a survey for the part of its year inside the period', () => {
    const c = category7([survey({ id: 'a' }), survey({ id: 'b', date: '2024-06-01' })], factors, year2025)
    expect(c.surveys.map((s) => s.survey.id)).toEqual(['a'])
    expect(c.total).toBeCloseTo(surveyResult(survey(), factors, year2025).total, 9)
  })

  it('counts each survey once for its own year in a two-year period', () => {
    const annual = surveyResult(survey(), factors, year2025).annualT
    const c = category7([survey({ id: 'a' }), survey({ id: 'b', date: '2024-06-01' })], factors, twoYears)
    expect(c.total).toBeCloseTo(2 * annual, 9)
    expect(c.duplicateYears).toEqual([])
    expect(c.yearsWithoutSurvey).toEqual([])
  })

  it('takes half of each year for a July–June financial year', () => {
    const fy = { start: '2025-07-01', end: '2026-06-30' }
    const c = category7([survey({ id: 'a', date: '2025-03-01' }), survey({ id: 'b', date: '2026-02-01', employees: 200 })], factors, fy)
    const annual = surveyResult(survey(), factors, year2025).annualT
    expect(c.total).toBeCloseTo(annual * (184 / 365) + 2 * annual * (181 / 365), 9)
  })

  it('counts a survey dated outside the period if its year overlaps it', () => {
    // Dated March 2025; the period starts in July 2025.
    const c = category7([survey({ date: '2025-03-01' })], factors, { start: '2025-07-01', end: '2025-12-31' })
    expect(c.surveys).toHaveLength(1)
    expect(c.surveys[0].yearShare).toBe(184 / 365)
  })

  it('flags two surveys for the same year', () => {
    const c = category7([survey({ id: 'a' }), survey({ id: 'b', date: '2025-10-01' })], factors, year2025)
    expect(c.duplicateYears).toEqual([2025])
  })

  it('flags years in the period without a survey', () => {
    expect(category7([survey({})], factors, twoYears).yearsWithoutSurvey).toEqual([2024])
    expect(category7([], factors, year2025).yearsWithoutSurvey).toEqual([2025])
  })

  it('gives zero with no surveys', () => {
    expect(category7([], factors, year2025)).toMatchObject({ surveys: [], total: 0, duplicateYears: [] })
  })
})
