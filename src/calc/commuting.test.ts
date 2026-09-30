import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { category7, commutingModes, periodYears, surveyResult, type Survey } from './commuting'

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

describe('periodYears', () => {
  it('counts days inclusive over 365', () => {
    expect(periodYears(year2025)).toBe(1)
    expect(periodYears({ start: '2024-01-01', end: '2024-12-31' })).toBe(366 / 365)
    expect(periodYears({ start: '2025-01-01', end: '2025-03-31' })).toBe(90 / 365)
  })

  it('is 0 for a reversed or invalid period', () => {
    expect(periodYears({ start: '2025-12-31', end: '2025-01-01' })).toBe(0)
    expect(periodYears({ start: '', end: '2025-01-01' })).toBe(0)
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
  it('only counts surveys dated inside the period', () => {
    const c = category7([survey({ id: 'a' }), survey({ id: 'b', date: '2024-06-01' })], factors, year2025)
    expect(c.surveys.map((s) => s.survey.id)).toEqual(['a'])
    expect(c.overlappingSurveys).toBe(false)
  })

  it('flags more than one survey in the period, since each is scaled to the whole period', () => {
    const twoYears = { start: '2024-01-01', end: '2025-12-31' }
    const c = category7([survey({ id: 'a' }), survey({ id: 'b', date: '2024-06-01' })], factors, twoYears)
    expect(c.overlappingSurveys).toBe(true)
    expect(c.total).toBeCloseTo(2 * surveyResult(survey(), factors, twoYears).total, 9)
  })

  it('gives zero with no surveys', () => {
    expect(category7([], factors, year2025)).toEqual({ surveys: [], total: 0, overlappingSurveys: false })
  })
})
