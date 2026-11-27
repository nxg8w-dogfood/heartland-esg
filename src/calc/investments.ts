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
//
// Amounts in DKK are converted to EUR at the ECB's reference rate on the holding's date
// (docs/adr/0028), and the result says which rate it used. With index regulation on, the EUR
// amount is then brought to the factor's price year, as for spend lines (docs/adr/0030).

import type { Factor } from '../data/factors'
import { overlapDays, twelveMonthsTo, type Period } from './dates'
import { dkkRate, type DkkRate, type RateSource } from './exchangeRates'
import { findFactor } from './findFactor'
import { deflationFor, noDeflation, regulateFactor, type Deflation, type DeflationResult } from './spend'

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
  /** DKK per unit of the local currency. Blank: the ECB rate on the holding's date (docs/adr/0042). */
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
  /** First day the group owned the company, when it was bought during the 12 months */
  ownedFrom?: string
  /** Last day the group owned the company, when it was sold during the 12 months */
  ownedTo?: string
  /** Left out of category 15 on purpose, with the reason (docs/adr/0038) */
  excluded?: boolean
  excludedReason?: string
  /** The calculation is final: someone has checked the holding's figures */
  complete?: boolean
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
  /** DKK per EUR on the holding's date, and the day of the ECB rate used */
  eurRate: DkkRate
  /** DKK per unit of the local currency used for revenue in local currency: the rate entered, else the ECB
   * rate on the holding's date. null when the revenue is in DKK or no local revenue is used. */
  localRate: DkkRate | null
  /** The factor table's factor, when the holding uses one */
  factor: Factor | null
  /** kg CO2e per EUR used: the chosen factor's value, or the holding's own; null when missing */
  factorKgPerEUR: number | null
  /** Index regulation of the EUR amount to the factor's price year; only a table factor has one */
  deflation: DeflationResult
  /** kg CO2e per EUR index-regulated to the holding's year; equals factorKgPerEUR unless regulation is applied */
  regulatedKgPerEUR: number | null
  /** The holding's share of the investee's emissions for a whole year */
  annualKgCO2e: number
  /** The 12 months the holding covers, ending on its date; null for an invalid date */
  covers: Period | null
  /** The part of those months the group owned the company; null when it owned none of them */
  owned: Period | null
  /** Share of the 12 months that the group owned and that fall in the period, 0 to 1 */
  shareInPeriod: number
  /** For the period: annual × share in period */
  kgCO2e: number
  /** The data needed for this basis is missing, or the amount invested is negative */
  pending: boolean
  /** What is missing, in a few words, e.g. "Omsætning mangler"; null when nothing is */
  missing: string | null
  /** Left out on purpose (Medtages ikke); counts nothing */
  excluded: boolean
}

export type Category15 = {
  rows: InvestmentResult[]
  /** tCO2e from included holdings */
  total: number
  /** Holdings over 50 %, left out because they're consolidated */
  consolidatedCount: number
  pendingCount: number
  /** Holdings left out on purpose (Medtages ikke) */
  excludedCount: number
  /** Holdings that count, or are left out on purpose, and are marked complete; and how many there are */
  completeCount: number
  decidedCount: number
  /** Companies with holdings whose months overlap, which would count those months twice */
  duplicates: { company: string; covers: string }[]
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

/** The factors a holding can use: spend factors per EUR, which is what revenue and amounts are converted to. */
/** A factor a holding can use: per EUR, which revenue and amounts are converted to. */
export const fitsInvestment = (f: Pick<Factor, 'unit'>) => f.unit === 'kg CO2e/EUR'

export const investmentFactors = (factors: readonly Factor[]): Factor[] =>
  factors.filter((f) => f.method === 'spend' && f.unit === 'kg CO2e/EUR')

export function investmentResult(investment: Investment, rates: RateSource, period: Period, factors: readonly Factor[], deflation: Deflation = noDeflation): InvestmentResult {
  const { ownershipPct } = investment
  const factor = investment.factorId ? findFactor(factors, investment.factorId, investment.date) : null
  // A chosen factor that is gone, or isn't per EUR, counts as missing rather than as the own value.
  const factorKgPerEUR = investment.factorId
    ? (factor && factor.unit === 'kg CO2e/EUR' ? factor.value : null)
    : investment.factorKgPerEUR
  const share = ownershipPct === null ? 0 : finiteOrZero(ownershipPct) / 100
  const included = ownershipPct !== null && ownershipPct <= 50

  const eurRate = dkkRate(rates, 'EUR', investment.date)
  const perEUR = eurRate.value
  const d = investment.basis === 'CO2e' ? deflationFor(noDeflation, null, investment.date) : deflationFor(deflation, factor, investment.date)
  const regulatedKgPerEUR = regulateFactor(factorKgPerEUR, d)
  let revenueEUR: number | null = null
  let investmentEUR: number | null = null
  let annualKgCO2e: number
  let pending: boolean
  let noRevenue = false
  let localRate: DkkRate | null = null
  let noLocalRate = false
  if (investment.basis === 'CO2e') {
    annualKgCO2e = finiteOrZero(investment.totalKgCO2e) * share
    pending = investment.totalKgCO2e === null
  } else if (investment.basis === 'Revenue') {
    if (investment.revenueDKK === null && investment.revenueLocal !== null) {
      localRate = investment.rateLocalToDKK !== null
        ? { value: investment.rateLocalToDKK, rateDate: null, note: null }
        : dkkRate(rates, investment.localCurrency, investment.date)
    }
    const revenueDKK =
      investment.revenueDKK !== null
        ? finiteOrZero(investment.revenueDKK)
        : finiteOrZero(investment.revenueLocal) * finiteOrZero(localRate?.value)
    noLocalRate = localRate !== null && localRate.value === null
    revenueEUR = perEUR === null ? null : revenueDKK / perEUR
    annualKgCO2e = finiteOrZero(revenueEUR) * finiteOrZero(regulatedKgPerEUR) * share
    // No revenue gives no estimate at all, so it waits rather than counting as zero (docs/adr/0038).
    noRevenue = revenueDKK === 0 && !noLocalRate
    pending = noRevenue || noLocalRate || factorKgPerEUR === null || perEUR === null
  } else {
    // A negative amount (a written-down holding, say) would give negative emissions: it waits.
    const amount = investment.investmentDKK
    investmentEUR = amount === null || perEUR === null ? null : amount / perEUR
    annualKgCO2e = investmentEUR !== null && investmentEUR > 0 ? investmentEUR * finiteOrZero(regulatedKgPerEUR) : 0
    pending = amount === null || amount < 0 || (amount !== 0 && (factorKgPerEUR === null || perEUR === null))
  }
  const covers = twelveMonthsTo(investment.date)
  // A company bought or sold during the 12 months counts for the days it was owned (docs/adr/0027).
  const owned = covers && ownedPart(covers, investment)
  const inPeriod = covers && owned ? overlapDays(owned, period) / overlapDays(covers, covers) : 0
  const missing = !pending ? null
    : investment.basis === 'CO2e' ? 'Selskabets udledning mangler'
    : noLocalRate ? `Kurs for ${investment.localCurrency} mangler`
    : noRevenue ? 'Omsætning mangler'
    : investment.basis === 'Investment' && investment.investmentDKK === null ? 'Investeringsbeløb mangler'
    : investment.basis === 'Investment' && investment.investmentDKK! < 0 ? 'Investeringsbeløbet er negativt'
    : factorKgPerEUR === null ? (factor && factor.value === null ? 'Faktorens værdi mangler' : 'Faktor mangler')
    : perEUR === null ? 'Kurs til EUR mangler'
    : 'Mangler data'
  const excluded = investment.excluded === true
  return {
    investment, share, included, revenueEUR, investmentEUR, eurRate, localRate, factor, factorKgPerEUR, deflation: d, regulatedKgPerEUR,
    annualKgCO2e: excluded ? 0 : annualKgCO2e, covers, owned, shareInPeriod: inPeriod, kgCO2e: excluded ? 0 : annualKgCO2e * inPeriod, pending, missing, excluded,
  }
}

/** The 12 months, cut to the dates the company was owned. ISO dates compare as text. */
function ownedPart(covers: Period, { ownedFrom, ownedTo }: Investment): Period | null {
  const start = ownedFrom && ownedFrom > covers.start ? ownedFrom : covers.start
  const end = ownedTo && ownedTo < covers.end ? ownedTo : covers.end
  return start <= end ? { start, end } : null
}

/** "2025" for a calendar year, "2025/26" for a year that runs across New Year. */
export function coverLabel(covers: Period | null): string {
  if (!covers) return 'uden dato'
  const from = covers.start.slice(0, 4)
  const to = covers.end.slice(0, 4)
  return from === to ? from : `${from}/${to.slice(2)}`
}

export function category15(investments: readonly Investment[], rates: RateSource, period: Period, factors: readonly Factor[], deflation: Deflation = noDeflation): Category15 {
  const rows = investments.map((i) => investmentResult(i, rates, period, factors, deflation)).filter((r) => r.shareInPeriod > 0)
  // Two holdings of one company whose owned months overlap count those months twice. ISO dates
  // compare as text.
  const duplicates: Category15['duplicates'] = []
  const byCompany = new Map<string, InvestmentResult[]>()
  for (const r of rows) {
    const company = r.investment.company.trim().toLowerCase()
    if (company) byCompany.set(company, [...(byCompany.get(company) ?? []), r])
  }
  for (const holdings of byCompany.values()) {
    const sorted = [...holdings].sort((a, b) => a.owned!.start.localeCompare(b.owned!.start))
    const overlap = sorted.find((r, i) => i > 0 && r.owned!.start <= sorted[i - 1].owned!.end)
    if (overlap) duplicates.push({ company: holdings[0].investment.company.trim(), covers: coverLabel(overlap.covers) })
  }
  return {
    rows,
    total: rows.filter((r) => r.included && !r.excluded).reduce((t, r) => t + r.kgCO2e, 0) / 1000,
    consolidatedCount: rows.filter((r) => !r.included && r.investment.ownershipPct !== null).length,
    pendingCount: rows.filter((r) => r.included && !r.excluded && r.pending).length,
    excludedCount: rows.filter((r) => r.excluded).length,
    completeCount: rows.filter((r) => (r.included || r.excluded) && r.investment.complete).length,
    decidedCount: rows.filter((r) => r.included || r.excluded).length,
    duplicates,
  }
}
