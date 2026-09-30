// Spend-based lines: amount → DKK → the factor's currency (EUR for EXIOBASE), optionally
// deflated to the factor's price year, × kg CO2e per unit of currency. Ported from the
// original app's per-line calculation and its price-index adjustment.

import type { Factor } from '../data/factors'
import { toDKK, type CurrencyRate } from '../data/currencies'
import { periodShare, type Period } from './dates'
import { factorDenominator } from './lineEmissions'
import { findFactor } from './findFactor'

export type PriceIndexSeries = {
  id: string
  name: string
  source: string
  type: string
  /** Index value per year */
  points: { year: number; value: number }[]
  note: string
}

/** The original's series. They start empty: index values are entered from the source, never guessed. */
export const defaultPriceIndexSeries: readonly PriceIndexSeries[] = [
  { id: 'idx-dst-ppi', name: 'Producentprisindeks (Danmarks Statistik)', source: 'Danmarks Statistik, PRIS111/PPI', type: 'PPI', points: [], note: 'Anbefalet til spendbaserede faktorer: indekset måler virksomheders indkøbspriser. Indtast indeksværdier pr. år fra kilden — værdier gættes aldrig.' },
  { id: 'idx-eurostat-ppi', name: 'Producentprisindeks (Eurostat)', source: 'Eurostat, sts_inppd_a', type: 'PPI', points: [], note: 'Alternativ kilde for EU-baserede spendfaktorer. Indtast indeksværdier pr. år fra kilden.' },
  { id: 'idx-bnp-deflator', name: 'BNP-deflator (Danmarks Statistik)', source: 'Danmarks Statistik, NAN1', type: 'BNP-deflator', points: [], note: 'Bredt prisniveaumål. Egnet når spendfaktoren dækker en bred kurv af indkøb.' },
]

export type Deflation = {
  active: boolean
  /** Series used unless a factor names its own */
  seriesId: string | null
  series: readonly PriceIndexSeries[]
  /** Per spend factor: the year its prices are from, and optionally its own series */
  factorSettings: Record<string, { baseYear?: number | null; seriesId?: string | null }>
}

export const noDeflation: Deflation = { active: false, seriesId: null, series: defaultPriceIndexSeries, factorSettings: {} }

export type DeflationStatus =
  | 'not-active'
  | 'not-spend'
  | 'no-series'
  | 'no-base-year'
  | 'no-index-point'
  | 'applied'

export type DeflationResult = {
  status: DeflationStatus
  /** Index for the line's year ÷ index for the base year; 1 unless applied */
  ratio: number
  baseYear: number | null
  year: number | null
  indexNow: number | null
  indexBase: number | null
  series: PriceIndexSeries | null
}

const plain = (status: DeflationStatus, extra: Partial<DeflationResult> = {}): DeflationResult => ({
  status, ratio: 1, baseYear: null, year: null, indexNow: null, indexBase: null, series: null, ...extra,
})

export function deflationFor(deflation: Deflation, factor: Factor | null, date: string): DeflationResult {
  if (!deflation.active) return plain('not-active')
  if (!factor || factor.method !== 'spend') return plain('not-spend')
  const settings = deflation.factorSettings[factor.id] ?? {}
  const series = deflation.series.find((s) => s.id === (settings.seriesId ?? deflation.seriesId)) ?? null
  if (!series) return plain('no-series')
  const baseYear = settings.baseYear ?? null
  if (!baseYear) return plain('no-base-year', { series })
  const year = Number(date.slice(0, 4))
  const indexNow = series.points.find((p) => p.year === year)?.value ?? null
  const indexBase = series.points.find((p) => p.year === baseYear)?.value ?? null
  if (indexNow === null || indexBase === null || indexBase === 0) {
    return plain('no-index-point', { baseYear, year, indexNow, indexBase, series })
  }
  return { status: 'applied', ratio: indexNow / indexBase, baseYear, year, indexNow, indexBase, series }
}

export type SpendGroup = {
  id: string
  label: string
  /** EXIOBASE sector */
  sector: string
  /** Empty for groups excluded from the climate account */
  factorId: string
  /** Why the group is left out of the climate account, e.g. water and banking */
  excluded?: string
}

export type SpendLine = {
  id: string
  group: string
  date: string
  dateTo?: string | null
  amount: number | null
  currency: string
  /** Overrides the group's factor */
  factorId?: string | null
  /** kg CO2e per unit of the factor's currency */
  customFactor?: number | null
  description?: string
}

export type SpendResult = {
  line: SpendLine
  group: SpendGroup
  share: number
  factor: Factor | null
  factorValue: number | null
  /** Amount inside the period, in the factor's currency (EUR for EXIOBASE) */
  amountInFactorCurrency: number | null
  factorCurrency: string
  deflation: DeflationResult
  /** Amount at the factor's price level; equals the above unless deflation is applied */
  deflatedAmount: number | null
  tCO2e: number
  pending: boolean
  excluded: boolean
  warning: string | null
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function spendLine(
  line: SpendLine,
  group: SpendGroup,
  factors: readonly Factor[],
  rates: readonly CurrencyRate[],
  deflation: Deflation,
  period: Period,
): SpendResult {
  const share = periodShare(line, period)
  if (group.excluded) {
    return {
      line, group, share, factor: null, factorValue: null, amountInFactorCurrency: null, factorCurrency: '',
      deflation: plain('not-spend'), deflatedAmount: null, tCO2e: 0, pending: false, excluded: true, warning: null,
    }
  }
  const factor = findFactor(factors, line.factorId ?? group.factorId, line.date)
  const factorValue = line.customFactor ?? factor?.value ?? null
  const inPeriod = line.amount === null ? null : line.amount * share
  const dkk = inPeriod === null ? null : inPeriod * toDKK(rates, line.currency)
  const factorCurrency = (factor ? factorDenominator(factor.unit) : '') || 'DKK'
  const amountInFactorCurrency = dkk === null ? null : dkk / toDKK(rates, factorCurrency)
  const d = deflationFor(deflation, factor, line.date)
  const deflatedAmount = amountInFactorCurrency === null ? null : amountInFactorCurrency / (d.ratio || 1)

  const warning =
    d.status === 'no-base-year'
      ? 'Spendfaktoren mangler basisår — indeksregulering kan ikke anvendes.'
      : d.status === 'no-index-point'
        ? 'Indeksserien mangler værdi for linjens år eller for faktorens basisår.'
        : null

  return {
    line, group, share, factor, factorValue, amountInFactorCurrency, factorCurrency, deflation: d, deflatedAmount,
    tCO2e: (finiteOrZero(deflatedAmount) * finiteOrZero(factorValue)) / 1000,
    pending: factorValue === null && finiteOrZero(line.amount) !== 0,
    excluded: false,
    warning,
  }
}
