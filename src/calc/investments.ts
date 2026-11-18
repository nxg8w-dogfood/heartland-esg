// Scope 3 category 15, investments: the investee's emissions × the ownership share, for
// holdings of 50 % or less. Larger holdings are consolidated into Scope 1 and 2 instead.
// Ported from the original app.
//
// Emissions come from one of three bases:
// - CO2e: the investee's reported total (kg CO2e) × the ownership share.
// - Revenue: the investee's revenue in EUR × a factor per EUR × the ownership share (the original's
//   estimate).
// - Investment: the amount invested in EUR × the sector's factor per EUR. This is the data
//   manual's method for a company without a climate account (docs/adr/0022). The amount is
//   already the group's own stake, so the ownership share isn't applied again.
// The factor is a spend factor from the factor table (so a value entered there reaches every
// holding using it), or the holding's own.
//
// Investee figures are annual. Each holding covers the 12 months up to and including its date,
// and counts for the share of those months inside the reporting period (docs/adr/0023). Dated
// 31 July, it covers Heartland's fiscal year from August, as the data manual reports it; dated
// 31 December, the calendar year. This deliberately differs from the original, which counted the
// whole annual figure for any holding dated in the period, however short the period.

import { toDKK, type CurrencyRate } from '../data/currencies'
import type { Factor } from '../data/factors'
import { periodShare, twelveMonthsTo, type Period } from './dates'
import { findFactor } from './findFactor'

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
  /** The amount invested in the company, in DKK (basis Investment) */
  investmentDKK: number | null
  /** The spend factor used (basis Revenue or Investment). Unset or null: the holding's own factorKgPerEUR. */
  factorId?: string | null
  /** kg CO2e per EUR (basis Revenue or Investment), when no factorId is chosen */
  factorKgPerEUR: number | null
  factorSource: string
  country: string
  /** The company's key in the group's consolidation system (OrganizationID), when imported from it */
  organizationId?: string
  /** The company's business area in the consolidation system, e.g. Apparel */
  businessArea?: string
}

export type InvestmentResult = {
  investment: Investment
  /** Ownership as a fraction, 0 to 1 */
  share: number
  /** Only holdings of 50 % or less count in category 15 */
  included: boolean
  revenueEUR: number | null
  /** The amount invested, in EUR (basis Investment) */
  investmentEUR: number | null
  /** The factor table's factor, when the holding uses one */
  factor: Factor | null
  /** kg CO2e per EUR used: the chosen factor's value, or the holding's own; null when missing */
  factorKgPerEUR: number | null
  /** The holding's share of the investee's emissions for a whole year */
  annualKgCO2e: number
  /** The 12 months the holding covers, ending on its date; null for an invalid date */
  covers: Period | null
  /** Share of those months inside the period, 0 to 1 */
  shareInPeriod: number
  /** For the period: annual × share in period */
  kgCO2e: number
  /** The data needed for this basis is missing, or the amount invested is negative */
  pending: boolean
}

export type Category15 = {
  rows: InvestmentResult[]
  /** tCO2e from included holdings */
  total: number
  /** Holdings over 50 %, left out because they're consolidated */
  consolidatedCount: number
  pendingCount: number
  /** Companies with holdings whose months overlap, which would count those months twice */
  duplicates: { company: string; covers: string }[]
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

/** The factors a holding can use: spend factors per EUR, which is what revenue and amounts are converted to. */
export const investmentFactors = (factors: readonly Factor[]): Factor[] =>
  factors.filter((f) => f.method === 'spend' && f.unit === 'kg CO2e/EUR')

export function investmentResult(investment: Investment, rates: readonly CurrencyRate[], period: Period, factors: readonly Factor[]): InvestmentResult {
  const { ownershipPct } = investment
  const factor = investment.factorId ? findFactor(factors, investment.factorId, investment.date) : null
  // A chosen factor that is gone, or isn't per EUR, counts as missing rather than as the own value.
  const factorKgPerEUR = investment.factorId
    ? (factor && factor.unit === 'kg CO2e/EUR' ? factor.value : null)
    : investment.factorKgPerEUR
  const share = ownershipPct === null ? 0 : finiteOrZero(ownershipPct) / 100
  const included = ownershipPct !== null && ownershipPct <= 50

  let revenueEUR: number | null = null
  let investmentEUR: number | null = null
  let annualKgCO2e: number
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
    annualKgCO2e = revenueEUR * finiteOrZero(factorKgPerEUR) * share
    pending = factorKgPerEUR === null && revenueDKK !== 0
  } else {
    // A negative amount (a written-down holding, say) would give negative emissions: it waits.
    const amount = investment.investmentDKK
    investmentEUR = amount === null ? null : amount / toDKK(rates, 'EUR')
    annualKgCO2e = investmentEUR !== null && investmentEUR > 0 ? investmentEUR * finiteOrZero(factorKgPerEUR) : 0
    pending = amount === null || amount < 0 || (factorKgPerEUR === null && amount !== 0)
  }
  const covers = twelveMonthsTo(investment.date)
  const inPeriod = covers === null ? 0 : periodShare({ date: covers.start, dateTo: covers.end }, period)
  return { investment, share, included, revenueEUR, investmentEUR, factor, factorKgPerEUR, annualKgCO2e, covers, shareInPeriod: inPeriod, kgCO2e: annualKgCO2e * inPeriod, pending }
}

/** "2025" for a calendar year, "2025/26" for a year that runs across New Year. */
export function coverLabel(covers: Period | null): string {
  if (!covers) return 'uden dato'
  const from = covers.start.slice(0, 4)
  const to = covers.end.slice(0, 4)
  return from === to ? from : `${from}/${to.slice(2)}`
}

export function category15(investments: readonly Investment[], rates: readonly CurrencyRate[], period: Period, factors: readonly Factor[]): Category15 {
  const rows = investments.map((i) => investmentResult(i, rates, period, factors)).filter((r) => r.shareInPeriod > 0)
  // Two holdings of one company whose 12 months overlap count those months twice. ISO dates
  // compare as text.
  const duplicates: Category15['duplicates'] = []
  const byCompany = new Map<string, InvestmentResult[]>()
  for (const r of rows) {
    const company = r.investment.company.trim().toLowerCase()
    if (company) byCompany.set(company, [...(byCompany.get(company) ?? []), r])
  }
  for (const holdings of byCompany.values()) {
    const sorted = holdings.map((r) => r.covers!).sort((a, b) => a.start.localeCompare(b.start))
    const overlap = sorted.find((c, i) => i > 0 && c.start <= sorted[i - 1].end)
    if (overlap) duplicates.push({ company: holdings[0].investment.company.trim(), covers: coverLabel(overlap) })
  }
  return {
    rows,
    total: rows.filter((r) => r.included).reduce((t, r) => t + r.kgCO2e, 0) / 1000,
    consolidatedCount: rows.filter((r) => !r.included && r.investment.ownershipPct !== null).length,
    pendingCount: rows.filter((r) => r.included && r.pending).length,
    duplicates,
  }
}
