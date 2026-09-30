// Scope 3 category 7, employee commuting: a staff survey scaled up to the whole workforce,
// ported from the original app.
//
// For each transport mode:
//   km per year = one-way km × 2 × office days per week × work weeks per year
//                 × (mode's respondents ÷ all respondents) × employees
//
// Each survey stands for the calendar year it's dated in, and counts for the days of the
// reporting period that fall in that year, as a share of that year's days. A full year counts
// exactly once; a July–June period takes half of each year's survey. This deliberately
// differs from the original, which scaled every survey dated in the period by the whole
// period's days ÷ 365, so two surveys in a two-year period counted the commuting twice.

import type { Factor } from '../data/factors'
import { dayValue, periodYearsList, yearShare, type Period } from './dates'
import { findFactor } from './findFactor'

export const commutingModes = [
  { id: 'k7-diesel', label: 'Dieselbil', factorId: 'f-c-diesel' },
  { id: 'k7-benzin', label: 'Benzinbil', factorId: 'f-c-benzin' },
  // BEIS' figure assumes the UK grid; the Danish-adjusted factor can be chosen instead.
  { id: 'k7-el', label: 'Elbil', factorId: 'f-c-el-beis', alternatives: ['f-c-el-dk'] },
  { id: 'k7-hybrid', label: 'Hybridbil', factorId: 'f-c-hybrid' },
  { id: 'k7-bus', label: 'Bus', factorId: 'f-c-bus' },
  { id: 'k7-tog', label: 'Tog', factorId: 'f-c-tog' },
  { id: 'k7-cykel', label: 'Cykel', factorId: 'f-c-cykel' },
  { id: 'k7-gaaende', label: 'Gående', factorId: 'f-c-gaaende' },
  { id: 'k7-andet', label: 'Andet (brugerangivet faktor)', factorId: 'f-c-andet' },
] as const satisfies readonly { id: string; label: string; factorId: string; alternatives?: readonly string[] }[]

export type CommutingModeId = (typeof commutingModes)[number]['id']

export type ModeAnswers = {
  respondents: number | null
  /** Average one-way distance */
  distanceKm: number | null
  officeDaysPerWeek: number | null
  /** One of the mode's alternatives, replacing its default factor */
  factorId?: string | null
  /** kg CO2e/km */
  customFactor?: number | null
}

export type Survey = {
  id: string
  label: string
  date: string
  employees: number | null
  /** Number of replies; only used to show the response rate */
  responses: number | null
  workWeeksPerYear: number | null
  modes: Partial<Record<CommutingModeId, ModeAnswers>>
}

export type ModeResult = {
  mode: (typeof commutingModes)[number]
  answers: ModeAnswers | undefined
  /** Share of respondents using this mode */
  share: number
  kmPerYear: number
  kmInPeriod: number
  factor: Factor | null
  factorValue: number | null
  tCO2e: number
  pending: boolean
}

export type SurveyResult = {
  survey: Survey
  modes: ModeResult[]
  totalRespondents: number
  /** Replies ÷ employees, as a percentage; null when either is missing */
  responseRate: number | null
  /** The calendar year the survey stands for, or null for an invalid date */
  year: number | null
  /** Share of the survey's year that falls in the period, 0 to 1 */
  yearShare: number
  /** tCO2e for a whole year, before scaling to the period */
  annualT: number
  total: number
}

export type Category7 = {
  /** Surveys whose year overlaps the period */
  surveys: SurveyResult[]
  total: number
  /** Years with more than one survey. Each would count for the year, so commuting is counted twice. */
  duplicateYears: number[]
  /** Years (or parts of years) in the period that no survey covers, so nothing is counted for them */
  yearsWithoutSurvey: number[]
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function surveyResult(survey: Survey, factors: readonly Factor[], period: Period): SurveyResult {
  const totalRespondents = commutingModes.reduce((t, m) => t + finiteOrZero(survey.modes[m.id]?.respondents), 0)
  const employees = finiteOrZero(survey.employees)
  const weeks = finiteOrZero(survey.workWeeksPerYear)
  const day = dayValue(survey.date)
  const year = Number.isNaN(day) ? null : new Date(day).getUTCFullYear()
  const share = year === null ? 0 : yearShare(year, period)

  const modes = commutingModes.map((mode): ModeResult => {
    const answers = survey.modes[mode.id]
    const modeShare = totalRespondents > 0 ? finiteOrZero(answers?.respondents) / totalRespondents : 0
    const kmPerYear = finiteOrZero(answers?.distanceKm) * 2 * finiteOrZero(answers?.officeDaysPerWeek) * weeks * modeShare * employees
    const kmInPeriod = kmPerYear * share
    const factor = findFactor(factors, answers?.factorId ?? mode.factorId, survey.date)
    const factorValue = answers?.customFactor ?? factor?.value ?? null
    return {
      mode,
      answers,
      share: modeShare,
      kmPerYear,
      kmInPeriod,
      factor,
      factorValue,
      tCO2e: (kmInPeriod * finiteOrZero(factorValue)) / 1000,
      pending: factorValue === null && kmInPeriod > 0,
    }
  })

  const replies = finiteOrZero(survey.responses)
  return {
    survey,
    modes,
    totalRespondents,
    responseRate: survey.responses != null && employees > 0 ? (replies / employees) * 100 : null,
    year,
    yearShare: share,
    annualT: modes.reduce((t, m) => t + (m.kmPerYear * finiteOrZero(m.factorValue)) / 1000, 0),
    total: modes.reduce((t, m) => t + m.tCO2e, 0),
  }
}

export function category7(surveys: readonly Survey[], factors: readonly Factor[], period: Period): Category7 {
  const results = surveys.map((s) => surveyResult(s, factors, period)).filter((r) => r.yearShare > 0)
  const perYear = new Map<number, number>()
  for (const r of results) perYear.set(r.year!, (perYear.get(r.year!) ?? 0) + 1)
  return {
    surveys: results,
    total: results.reduce((t, r) => t + r.total, 0),
    duplicateYears: [...perYear].filter(([, n]) => n > 1).map(([y]) => y),
    yearsWithoutSurvey: periodYearsList(period).filter((y) => !perYear.has(y)),
  }
}
