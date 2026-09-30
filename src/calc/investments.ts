// Scope 3 category 15, investments: the investee's emissions × the ownership share, for
// holdings of 50 % or less. Larger holdings are consolidated into Scope 1 and 2 instead.
// Ported from the original app.
//
// Emissions come either from the investee's reported total (kg CO2e), or from its revenue
// converted to EUR × an emission factor per EUR of revenue.

import { toDKK, type CurrencyRate } from '../data/currencies'
import { dayValue, type Period } from './dates'

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
  /**
   * Investee figures are annual. A holding dated in the period counts its whole annual figure,
   * as in the original, so a period under a year overstates it. Flagged, not changed.
   */
  periodUnderOneYear: boolean
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function investmentResult(investment: Investment, rates: readonly CurrencyRate[]): InvestmentResult {
  const { ownershipPct } = investment
  const share = ownershipPct === null ? 0 : finiteOrZero(ownershipPct) / 100
  const included = ownershipPct !== null && ownershipPct <= 50

  let revenueEUR: number | null = null
  let kgCO2e = 0
  let pending: boolean
  if (investment.basis === 'CO2e') {
    kgCO2e = finiteOrZero(investment.totalKgCO2e) * share
    pending = investment.totalKgCO2e === null
  } else if (investment.basis === 'Revenue') {
    const revenueDKK =
      investment.revenueDKK !== null
        ? finiteOrZero(investment.revenueDKK)
        : finiteOrZero(investment.revenueLocal) * finiteOrZero(investment.rateLocalToDKK)
    revenueEUR = revenueDKK / toDKK(rates, 'EUR')
    kgCO2e = revenueEUR * finiteOrZero(investment.factorKgPerEUR) * share
    pending = investment.factorKgPerEUR === null && revenueDKK !== 0
  } else {
    pending = true
  }
  return { investment, share, included, revenueEUR, kgCO2e, pending }
}

export function category15(investments: readonly Investment[], rates: readonly CurrencyRate[], period: Period): Category15 {
  const start = dayValue(period.start)
  const end = dayValue(period.end)
  const rows = investments
    .filter((i) => {
      const d = dayValue(i.date)
      return !Number.isNaN(d) && d >= start && d <= end
    })
    .map((i) => investmentResult(i, rates))
  const days = Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.round((end - start) / 86_400_000) + 1
  return {
    rows,
    total: rows.filter((r) => r.included).reduce((t, r) => t + r.kgCO2e, 0) / 1000,
    consolidatedCount: rows.filter((r) => !r.included && r.investment.ownershipPct !== null).length,
    pendingCount: rows.filter((r) => r.included && r.pending).length,
    periodUnderOneYear: rows.length > 0 && days > 0 && days < 365,
  }
}
