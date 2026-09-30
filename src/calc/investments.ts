// Scope 3 category 15, investments: the investee's emissions × the ownership share, for
// holdings of 50 % or less. Larger holdings are consolidated into Scope 1 and 2 instead.
// Ported from the original app.
//
// Emissions come either from the investee's reported total (kg CO2e), or from its revenue
// converted to EUR × an emission factor per EUR of revenue.
//
// Investee figures are annual. Each holding stands for the calendar year it's dated in and
// counts for the share of that year inside the reporting period, like commuting surveys.
// This deliberately differs from the original, which counted the whole annual figure for any
// holding dated in the period, however short the period.

import { toDKK, type CurrencyRate } from '../data/currencies'
import { dayValue, yearShare, type Period } from './dates'

export type InvestmentBasis = 'CO2e' | 'Revenue' | 'Investment'

export type Investment = {
  id: string
  date: string
  company: string
  /** Percentage, 0–100 */
  ownershipPct: number | null
  accountingMethod: 'Ass.' | 'Other investments'
  climateMethod: string
  dataSource: string
  basis: InvestmentBasis
  /** Investee's total emissions, kg CO2e (basis CO2e) */
  totalKgCO2e: number | null
  /** Investee's revenue in DKK (basis Revenue). If blank, amount × rate is used. */
  revenueDKK: number | null
  revenueLocal: number | null
  localCurrency: string
  /** DKK per unit of the local currency */
  rateLocalToDKK: number | null
  /** kg CO2e per EUR of revenue (basis Revenue) */
  factorKgPerEUR: number | null
  factorSource: string
  country: string
}

export type InvestmentResult = {
  investment: Investment
  /** Ownership as a fraction, 0 to 1 */
  share: number
  /** Only holdings of 50 % or less count in category 15 */
  included: boolean
  revenueEUR: number | null
  /** The holding's share of the investee's emissions for a whole year */
  annualKgCO2e: number
  /** The calendar year the holding stands for, or null for an invalid date */
  year: number | null
  /** Share of that year inside the period, 0 to 1 */
  yearShare: number
  /** For the period: annual × year share */
  kgCO2e: number
  /** The data needed for this basis is missing ('Investment' is never calculated) */
  pending: boolean
}

export type Category15 = {
  rows: InvestmentResult[]
  /** tCO2e from included holdings */
  total: number
  /** Holdings over 50 %, left out because they're consolidated */
  consolidatedCount: number
  pendingCount: number
  /** Company and year pairs entered more than once, which would count that year twice */
  duplicates: { company: string; year: number }[]
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function investmentResult(investment: Investment, rates: readonly CurrencyRate[], period: Period): InvestmentResult {
  const { ownershipPct } = investment
  const share = ownershipPct === null ? 0 : finiteOrZero(ownershipPct) / 100
  const included = ownershipPct !== null && ownershipPct <= 50

  let revenueEUR: number | null = null
  let annualKgCO2e = 0
  let pending: boolean
  if (investment.basis === 'CO2e') {
    annualKgCO2e = finiteOrZero(investment.totalKgCO2e) * share
    pending = investment.totalKgCO2e === null
  } else if (investment.basis === 'Revenue') {
    const revenueDKK =
      investment.revenueDKK !== null
        ? finiteOrZero(investment.revenueDKK)
        : finiteOrZero(investment.revenueLocal) * finiteOrZero(investment.rateLocalToDKK)
    revenueEUR = revenueDKK / toDKK(rates, 'EUR')
    annualKgCO2e = revenueEUR * finiteOrZero(investment.factorKgPerEUR) * share
    pending = investment.factorKgPerEUR === null && revenueDKK !== 0
  } else {
    pending = true
  }
  const day = dayValue(investment.date)
  const year = Number.isNaN(day) ? null : new Date(day).getUTCFullYear()
  const inPeriod = year === null ? 0 : yearShare(year, period)
  return { investment, share, included, revenueEUR, annualKgCO2e, year, yearShare: inPeriod, kgCO2e: annualKgCO2e * inPeriod, pending }
}

export function category15(investments: readonly Investment[], rates: readonly CurrencyRate[], period: Period): Category15 {
  const rows = investments.map((i) => investmentResult(i, rates, period)).filter((r) => r.yearShare > 0)
  const seen = new Map<string, number>()
  for (const r of rows) {
    const company = r.investment.company.trim().toLowerCase()
    if (!company) continue
    const key = `${company}|${r.year}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const duplicates = [...seen]
    .filter(([, n]) => n > 1)
    .map(([key]) => {
      const r = rows.find((x) => `${x.investment.company.trim().toLowerCase()}|${x.year}` === key)!
      return { company: r.investment.company.trim(), year: r.year! }
    })
  return {
    rows,
    total: rows.filter((r) => r.included).reduce((t, r) => t + r.kgCO2e, 0) / 1000,
    consolidatedCount: rows.filter((r) => !r.included && r.investment.ownershipPct !== null).length,
    pendingCount: rows.filter((r) => r.included && r.pending).length,
    duplicates,
  }
}
