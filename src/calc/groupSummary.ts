// The group's climate account, consolidated by equity share (GHG Protocol, docs/adr/0006):
// each company counts with the group's ownership share in it for each calendar year.
//
// A period is split into calendar years, so a share that changes from one year to the next
// applies to its own year's emissions. The calculations prorate by days, so the parts add up
// to the whole period exactly.
//
// A company's category 15 holding in another group company is left out of the group total:
// that company's emissions are already in it through its own share.

import type { Factor } from '../data/factors'
import { ownershipFor, type Company, type GroupData } from '../storage/group'
import { accountTotals } from './accountTotals'
import { periodYearsList, type Period } from './dates'
import type { FactorSourceChoice } from './factorSources'

export type Totals = { scope1: number; scope2Location: number; scope2Market: number; scope3: number }

const zero = (): Totals => ({ scope1: 0, scope2Location: 0, scope2Market: 0, scope3: 0 })
const add = (a: Totals, b: Totals, k = 1): Totals => ({
  scope1: a.scope1 + b.scope1 * k,
  scope2Location: a.scope2Location + b.scope2Location * k,
  scope2Market: a.scope2Market + b.scope2Market * k,
  scope3: a.scope3 + b.scope3 * k,
})
export const locationTotal = (t: Totals) => t.scope1 + t.scope2Location + t.scope3
export const marketTotal = (t: Totals) => t.scope1 + t.scope2Market + t.scope3

export type CompanySummary = {
  company: Company
  /** The company's own figures, 100 % */
  full: Totals
  /** Its share for the group */
  share: Totals
  /** The ownership share per year in the period, in percent; null where none is entered */
  ownership: { year: number; pct: number | null }[]
  /** tCO2e of category 15 holdings in other group companies, left out of the group total */
  intraGroupCat15: number
  issues: string[]
}

export type GroupSummary = {
  companies: CompanySummary[]
  total: Totals
}

/** The calendar-year parts of a period */
export function yearSlices(period: Period): { year: number; period: Period }[] {
  return periodYearsList(period).map((year) => ({
    year,
    period: {
      start: period.start > `${year}-01-01` ? period.start : `${year}-01-01`,
      end: period.end < `${year}-12-31` ? period.end : `${year}-12-31`,
    },
  }))
}

const norm = (s: string) => s.trim().toLowerCase()

export function groupSummary(
  group: GroupData,
  factorsFor: (company: Company) => readonly Factor[],
  period: Period,
): GroupSummary {
  const names = new Set(group.companies.map((c) => norm(c.name)).filter(Boolean))
  const companies = group.companies.map((company): CompanySummary => {
    const factors = factorsFor(company)
    let full = zero()
    let share = zero()
    let intraGroupCat15 = 0
    const issues = new Set<string>()
    const ownership: CompanySummary['ownership'] = []
    const intraGroupNames = new Set<string>()

    for (const slice of yearSlices(period)) {
      const t = accountTotals(company.account, factors, slice.period)
      const pct = ownershipFor(company, slice.year)
      ownership.push({ year: slice.year, pct })
      t.issues.forEach((i) => issues.add(i))

      // Holdings in other group companies, counted in category 15 only if it's relevant.
      const relevant15 = company.account.relevance[15]?.relevant ?? false
      const intra = t.cat15.rows.filter((r) => r.included && names.has(norm(r.investment.company)) && norm(r.investment.company) !== norm(company.name))
      const intraT = relevant15 ? intra.reduce((s, r) => s + r.kgCO2e, 0) / 1000 : 0
      intra.forEach((r) => intraGroupNames.add(r.investment.company.trim()))

      const own: Totals = { scope1: t.scope1, scope2Location: t.scope2Location, scope2Market: t.scope2Market, scope3: t.scope3 }
      full = add(full, own)
      const k = (pct ?? 0) / 100
      share = add(share, { ...own, scope3: own.scope3 - intraT }, k)
      intraGroupCat15 += intraT * k
    }
    const missing = ownership.filter((o) => o.pct === null).map((o) => o.year)
    if (missing.length) issues.add(`Ejerandelen mangler for ${missing.join(', ')}, så virksomheden tæller med 0 %`)
    if (intraGroupNames.size) issues.add(`Kategori 15 indeholder koncernvirksomheder (${[...intraGroupNames].join(', ')}). De tæller via deres ejerandel og er trukket ud af kategori 15 i koncerntotalen`)
    return { company, full, share, ownership, intraGroupCat15, issues: [...issues] }
  })
  return { companies, total: companies.reduce((t, c) => add(t, c.share), zero()) }
}

/** Every calendar year that any company has data for, oldest first */
export function dataYears(group: GroupData): number[] {
  const years = new Set<number>()
  const addDate = (d: string | null | undefined) => {
    const y = d ? Number(d.slice(0, 4)) : NaN
    if (Number.isInteger(y) && y > 1900 && y < 2200) years.add(y)
  }
  for (const { account: a } of group.companies) {
    for (const l of [...a.scope1Lines, ...a.scope2Lines, ...a.cat1Lines, ...a.cat4Lines, ...a.cat4SpendLines, ...a.cat5Lines, ...a.cat6Lines]) {
      addDate(l.date)
      addDate(l.dateTo)
    }
    a.surveys.forEach((s) => addDate(s.date))
    a.investments.forEach((i) => addDate(i.date))
    a.ledger.postings.forEach((p) => addDate(p.date))
  }
  return [...years].sort((x, y) => x - y)
}

/** The group summary for each calendar year */
export function yearOverYear(
  group: GroupData,
  factorsFor: (company: Company) => readonly Factor[],
  years: readonly number[],
): { year: number; summary: GroupSummary }[] {
  return years.map((year) => ({ year, summary: groupSummary(group, factorsFor, { start: `${year}-01-01`, end: `${year}-12-31` }) }))
}

const choiceKey = (c: FactorSourceChoice | undefined): string =>
  !c || c.kind === 'builtin' ? 'builtin'
    : c.kind === 'publication' ? `publication:${c.publicationId}`
      : c.kind === 'manual' ? `manual:${c.value}`
        : `api:${c.providerId}:${c.value}`

/** Factors whose source differs between companies, so the group total mixes bases */
export function factorSourceDifferences(group: GroupData, base: readonly Factor[]): { factor: Factor; companies: { name: string; key: string }[] }[] {
  if (group.companies.length < 2) return []
  const ids = new Set(group.companies.flatMap((c) => Object.keys(c.account.factorSources)))
  return [...ids]
    .map((id) => ({
      factor: base.find((f) => f.id === id),
      companies: group.companies.map((c) => ({ name: c.name, key: choiceKey(c.account.factorSources[id]) })),
    }))
    .filter((d): d is { factor: Factor; companies: { name: string; key: string }[] } => !!d.factor && new Set(d.companies.map((c) => c.key)).size > 1)
}
