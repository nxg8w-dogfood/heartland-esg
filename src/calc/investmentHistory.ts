// A holding next to the same company's holding a year before (docs/adr/0040): the factor it used
// carries over to the new figures, and its emissions are shown next to this year's.

import { importedFactorId } from '../data/businessAreaFactors'
import type { Factor } from '../data/factors'
import { newId } from '../newId'
import { twelveMonthsTo } from './dates'
import { importedAccountingMethod, importedBasis, type PlanRow } from './groupExport'
import type { RateSource } from './exchangeRates'
import { investmentResult, type Investment, type InvestmentResult } from './investments'
import { noDeflation, type Deflation } from './spend'

/** The same company: by OrganizationID when both have one, otherwise by name. */
export function sameCompany(a: Pick<Investment, 'company' | 'organizationId'>, b: Pick<Investment, 'company' | 'organizationId'>): boolean {
  if (a.organizationId && b.organizationId) return a.organizationId === b.organizationId
  return a.company.trim().toLowerCase() === b.company.trim().toLowerCase() && a.company.trim() !== ''
}

/** The same company's latest holding dated before this one, or null */
export function previousHolding(inv: Investment, all: readonly Investment[]): Investment | null {
  let best: Investment | null = null
  for (const i of all) {
    if (i.id === inv.id || i.date >= inv.date || !sameCompany(i, inv)) continue
    if (!best || i.date > best.date) best = i
  }
  return best
}

/** The factor a holding used, to carry over to the same company's next holding; null when it had none */
export function carriedFactor(previous: Investment): Pick<Investment, 'factorId' | 'factorKgPerEUR' | 'factorSource'> | null {
  if (previous.factorId) return { factorId: previous.factorId, factorKgPerEUR: null, factorSource: previous.factorSource }
  if (previous.factorKgPerEUR !== null) return { factorKgPerEUR: previous.factorKgPerEUR, factorSource: previous.factorSource }
  return null
}

/** The previous holding and what it came to for its own 12 months */
export type PreviousYear = { holding: Investment; result: InvestmentResult }

export function previousYear(inv: Investment, all: readonly Investment[], rates: RateSource, factors: readonly Factor[], deflation: Deflation = noDeflation): PreviousYear | null {
  const holding = previousHolding(inv, all)
  const covers = holding && twelveMonthsTo(holding.date)
  if (!holding || !covers) return null
  return { holding, result: investmentResult(holding, rates, covers, factors, deflation) }
}

export type InvestmentSort = 'list' | 'largest' | 'smallest' | 'name'

/** Holdings whose name or OrganizationID contains every word of the query, in the chosen order */
export function findInvestments(results: readonly InvestmentResult[], query: string, sort: InvestmentSort): InvestmentResult[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = results.filter(({ investment: i }) => {
    const text = `${i.company} ${i.organizationId ?? ''}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
  if (sort === 'list') return found
  if (sort === 'name') return [...found].sort((a, b) => a.investment.company.localeCompare(b.investment.company, 'da'))
  const sign = sort === 'largest' ? -1 : 1
  return [...found].sort((a, b) => sign * (a.kgCO2e - b.kgCO2e))
}

/** The holdings that emit most in the period, largest first */
export function largestEmitters(rows: readonly InvestmentResult[], n: number): InvestmentResult[] {
  return rows.filter((r) => r.kgCO2e > 0).sort((a, b) => b.kgCO2e - a.kgCO2e).slice(0, n)
}

/**
 * The holdings after importing the planned rows for a period (docs/adr/0025, 0040). A holding
 * marked complete keeps its figures and only takes the cube's name; every year's holding of a
 * company takes the name too. A holding without a factor gets the one the same company's holding
 * used the year before, or else its business area's.
 */
export function applyImport(current: readonly Investment[], importable: readonly PlanRow[], date: string, source: string): Investment[] {
  const updates = new Map(importable.filter((r) => r.existingId).map((r) => [r.existingId!, r]))
  const byId = new Map(current.map((i) => [i.id, i]))
  /** The factor the same company's holding used last year, which the new figures keep */
  const carried = (r: PlanRow): Partial<Investment> | null => {
    const previous = r.previousId ? byId.get(r.previousId) : undefined
    return previous ? carriedFactor(previous) : null
  }
  // Every year's holding of a company gets the name the cube gives it now.
  const names = new Map(importable.filter((r) => r.organizationId).map((r) => [r.organizationId!, r.name]))
  const kept = current.map((inv) => {
    const r = updates.get(inv.id)
    const name = (inv.organizationId && names.get(inv.organizationId)) || r?.name || inv.company
    if (!r) return name === inv.company ? inv : { ...inv, company: name }
    // A holding marked complete is final: the import only renames it.
    if (inv.complete) return { ...inv, company: name, ...(r.organizationId ? { organizationId: r.organizationId } : {}) }
    // A factor the ESG owner chose, or a value of the holding's own, is left alone.
    const factor = !inv.factorId && inv.factorKgPerEUR === null ? (carried(r) ?? importedFactor(r)) : {}
    return {
      ...inv, company: name, ownershipPct: r.ownershipPct, revenueDKK: r.revenueDKK ?? inv.revenueDKK, investmentDKK: r.investmentDKK ?? inv.investmentDKK, dataSource: source,
      ...(r.organizationId ? { organizationId: r.organizationId } : {}), ...(r.businessArea ? { businessArea: r.businessArea } : {}),
      ...factor,
    }
  })
  const created: Investment[] = importable.filter((r) => !r.existingId).map((r) => ({
    id: newId(), date, company: r.name, ownershipPct: r.ownershipPct,
    accountingMethod: importedAccountingMethod(r), climateMethod: 'Investment-specific method', dataSource: source,
    basis: importedBasis(r), totalKgCO2e: null, revenueDKK: r.revenueDKK, investmentDKK: r.investmentDKK, revenueLocal: null, localCurrency: 'DKK',
    rateLocalToDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
    ...(r.organizationId ? { organizationId: r.organizationId } : {}), ...(r.businessArea ? { businessArea: r.businessArea } : {}),
    ...(carried(r) ?? importedFactor(r)),
  }))
  return [...kept, ...created]
}

/** The sector factor for the company's business area */
function importedFactor(r: PlanRow): Partial<Investment> {
  const factorId = importedFactorId(r)
  return factorId ? { factorId } : {}
}
