// One company's three scopes side by side for the overview page: the totals the Koncern page
// counts the company with (accountTotals), and what each scope is made of.

import type { Factor } from '../data/factors'
import type { AccountData } from '../storage/account'
import { accountTotals, calculatedCategories, type AccountTotals } from './accountTotals'
import type { Period } from './dates'
import { scope1Summary } from './scope1'
import { scope2Summary } from './scope2'
import { scope3Categories } from './scope3'

export type OverviewPart = {
  label: string
  /** The Scope 3 category, for a category's part */
  nr?: number
  /** tCO2e */
  value: number
  /** Shown, but not counted in the scope's total (a Scope 3 category marked not relevant) */
  excluded?: boolean
}

/** Scope 2's split per location, in both methods */
export type OverviewLocation = { id: string; name: string; location: number; market: number }

export type CompanyOverview = {
  totals: AccountTotals
  /** Scope 1 + 2 market-based + 3 */
  market: number
  /** Scope 1 + 2 location-based + 3 */
  location: number
  scope1: OverviewPart[]
  scope2: OverviewLocation[]
  scope3: OverviewPart[]
}

const category = (nr: number) => scope3Categories.find((c) => c.nr === nr)!

export function companyOverview(account: AccountData, factors: readonly Factor[], period: Period): CompanyOverview {
  const totals = accountTotals(account, factors, period)
  const s1 = scope1Summary(account.scope1Lines, factors, period, account.vehicles)
  const s2 = scope2Summary(account.locations, account.scope2Lines, factors, period)
  return {
    totals,
    market: totals.scope1 + totals.scope2Market + totals.scope3,
    location: totals.scope1 + totals.scope2Location + totals.scope3,
    scope1: [
      { label: 'Mobil forbrænding (firmabiler)', value: s1.mobile },
      { label: 'Stationær forbrænding (opvarmning)', value: s1.stationary },
      { label: 'Kølemidler', value: s1.fugitive },
    ],
    scope2: s2.locations.map((l) => ({ id: l.location.id, name: l.location.name, location: l.locationTotal, market: l.marketTotal })),
    scope3: calculatedCategories.map((nr) => ({
      nr,
      label: `${nr} — ${category(nr).name}`,
      value: totals.scope3ByCategory[nr] ?? 0,
      excluded: !(account.relevance[nr]?.relevant ?? false),
    })),
  }
}

/** A part's share of a total in percent, or null when the total is zero */
export const sharePct = (value: number, total: number): number | null => (total > 0 ? (value / total) * 100 : null)
