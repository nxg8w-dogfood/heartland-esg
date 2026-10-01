// One company's climate account summed up for a period: the figures the Scope pages show, in
// one place, plus what's still missing. The group summary is built from this.

import { currencyRates } from '../data/currencies'
import type { Factor } from '../data/factors'
import type { LedgerState } from '../ledger/state'
import type { Relevance } from '../scope3/relevance'
import type { AccountData } from '../storage/account'
import { category7 } from './commuting'
import type { Period } from './dates'
import { category15, type Category15 } from './investments'
import { classify, ledgerSpendLines, type LedgerSpendLine } from './ledger'
import { scope1Summary } from './scope1'
import { scope2Summary } from './scope2'
import { category1, category3, category5, category6, scope3Categories } from './scope3'

/** Ledger postings tagged to category 1, as spend lines */
export function ledgerLinesFor(ledger: LedgerState): LedgerSpendLine[] {
  const manual = new Map(Object.entries(ledger.manual))
  return ledgerSpendLines(ledger.postings.map((p) => classify(p, ledger.rules, manual)), 1)
}

/** The categories the app calculates, by number. The others are listed but not calculated. */
export const calculatedCategories = [1, 3, 5, 6, 7, 15] as const

/** Scope 3 counts a category only when it's marked relevant. */
export function includedScope3Total(byCategory: Record<number, number>, relevance: Relevance): number {
  return Object.entries(byCategory).reduce((t, [nr, v]) => (relevance[Number(nr)]?.relevant ? t + v : t), 0)
}

export type AccountTotals = {
  /** tCO2e */
  scope1: number
  scope2Location: number
  scope2Market: number
  /** Relevant categories only */
  scope3: number
  /** tCO2e per calculated category, whether relevant or not */
  scope3ByCategory: Record<number, number>
  cat15: Category15
  /** What makes these figures incomplete, in words */
  issues: string[]
}

export function accountTotals(account: AccountData, factors: readonly Factor[], period: Period): AccountTotals {
  const s1 = scope1Summary(account.scope1Lines, factors, period)
  const s2 = scope2Summary(account.locations, account.scope2Lines, factors, period)
  const cat1 = category1(account.cat1Lines, factors, currencyRates, account.deflation, period, ledgerLinesFor(account.ledger))
  const cat3 = category3(account.scope1Lines, s2, factors, period, account.category3Params)
  const cat5 = category5(account.cat5Lines, factors, period)
  const cat6 = category6(account.cat6Lines, factors, period)
  const cat7 = category7(account.surveys, factors, period)
  const cat15 = category15(account.investments, currencyRates, period)
  const scope3ByCategory: Record<number, number> = { 1: cat1.total, 3: cat3.total, 5: cat5.total, 6: cat6.total, 7: cat7.total, 15: cat15.total }
  const relevant = (nr: number) => account.relevance[nr]?.relevant ?? false

  const issues: string[] = []
  const lines = (n: number, what: string) => issues.push(`${n} ${n === 1 ? 'linje' : 'linjer'} i ${what} afventer en faktor`)
  if (s1.pendingCount) lines(s1.pendingCount, 'Scope 1')
  if (s2.pendingMarket) issues.push('Scope 2 market-based afventer en residualmiks')
  if (s2.pendingHeating) issues.push('Fjernvarme afventer en lokal leverandørfaktor')
  if (s2.invalidCount) issues.push(`${s2.invalidCount} Scope 2-linjer har en værdi, der ikke er et tal`)
  if (relevant(1) && cat1.pendingCount) lines(cat1.pendingCount, 'kategori 1')
  if (relevant(3) && cat3.heatingPending) issues.push('Kategori 3 afventer distributionstabet for fjernvarme')
  if (relevant(5) && cat5.pendingCount) lines(cat5.pendingCount, 'kategori 5')
  if (relevant(6) && cat6.pendingCount) lines(cat6.pendingCount, 'kategori 6')
  if (relevant(7) && cat7.yearsWithoutSurvey.length) issues.push(`Kategori 7 mangler en pendlerundersøgelse for ${cat7.yearsWithoutSurvey.join(', ')}`)
  if (relevant(7) && cat7.duplicateYears.length) issues.push(`Kategori 7 har flere undersøgelser for ${cat7.duplicateYears.join(', ')}`)
  if (relevant(15) && cat15.pendingCount) issues.push(`${cat15.pendingCount} investeringer i kategori 15 mangler data`)
  if (relevant(15) && cat15.duplicates.length) issues.push(`Kategori 15 har den samme investering flere gange for samme år`)
  const notCalculated = scope3Categories.filter((c) => relevant(c.nr) && !(calculatedCategories as readonly number[]).includes(c.nr))
  if (notCalculated.length) issues.push(`Scope 3-kategori ${notCalculated.map((c) => c.nr).join(', ')} er markeret relevant, men beregnes ikke i appen endnu`)
  const noReason = scope3Categories.filter((c) => !account.relevance[c.nr]?.reason.trim())
  if (noReason.length) issues.push(`Scope 3-kategori ${noReason.map((c) => c.nr).join(', ')} mangler en begrundelse for relevansen`)

  return {
    scope1: s1.total,
    scope2Location: s2.locationTotal,
    scope2Market: s2.marketTotal,
    scope3: includedScope3Total(scope3ByCategory, account.relevance),
    scope3ByCategory,
    cat15,
    issues,
  }
}
