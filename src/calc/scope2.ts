// Scope 2: purchased electricity and district heating, per location, with dual reporting
// (GHG Protocol Scope 2 Guidance). Ported from the original app.
//
// Electricity is reported twice:
//  - location-based: the grid mix valid on the line's date (e.g. Energistyrelsen 2024 or 2025)
//  - market-based: the location's contractual instrument (PPA, guarantee of origin or residual mix)
// District heating uses one factor and counts the same in both totals.

import type { Factor } from '../data/factors'
import { periodShare, type Period } from './dates'
import { findFactor } from './findFactor'

export const marketInstruments = [
  { id: 'ppa', label: 'PPA', factorId: 'f-s2-el-ppa' },
  { id: 'oprindelsesgaranti', label: 'Oprindelsesgaranti', factorId: 'f-s2-el-go' },
  { id: 'residualmiks', label: 'Residualmiks', factorId: 'f-s2-el-residual' },
] as const

export type MarketInstrumentId = (typeof marketInstruments)[number]['id']

export const heatingFactors = [
  { id: 'f-s2-fjernvarme-beis', label: 'BEIS-fallback' },
  { id: 'f-s2-fjernvarme-lokal', label: 'Lokal leverandørfaktor' },
] as const

export type HeatingFactorId = (typeof heatingFactors)[number]['id']

const BEIS_HEATING = 'f-s2-fjernvarme-beis'

export type Location = {
  id: string
  name: string
  /** Factor family for the location-based grid mix */
  gridFamily: string
  marketInstrument: MarketInstrumentId
  heatingFactorId: HeatingFactorId
}

export type Scope2Kind = 'electricity' | 'heating'

export type Scope2Line = {
  id: string
  locationId: string
  kind: Scope2Kind
  date: string
  dateTo?: string | null
  kWh: number | null
  /** kg CO2e/kWh; for electricity it replaces the location-based factor only */
  customFactor?: number | null
  description?: string
}

export type Scope2LineResult = {
  line: Scope2Line
  share: number
  /** kWh inside the period */
  kWh: number
  locationFactor: Factor | null
  locationValue: number | null
  marketFactor: Factor | null
  marketValue: number | null
  locationT: number
  marketT: number
  /** The market-based figure can't be calculated yet: its factor has no value */
  pendingMarket: boolean
  /** Deliberate difference from the original: a quantity or factor that isn't a number */
  invalid: boolean
  warning: string | null
}

export type LocationSummary = {
  location: Location
  electricity: Scope2LineResult[]
  heating: Scope2LineResult[]
  electricityKWh: number
  heatingKWh: number
  electricityLocationT: number
  electricityMarketT: number
  heatingT: number
  locationTotal: number
  marketTotal: number
  pendingMarket: boolean
  /** A heating line's factor has no value. The original shows this per line only. */
  pendingHeating: boolean
}

export type Scope2Summary = {
  locations: LocationSummary[]
  electricityKWh: number
  heatingKWh: number
  electricityLocationT: number
  electricityMarketT: number
  heatingT: number
  locationTotal: number
  marketTotal: number
  pendingMarket: boolean
  pendingHeating: boolean
  invalidCount: number
  /** kg CO2e/kWh across all electricity, location-based; 0 without electricity */
  averageGridFactor: number
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0
const isInvalid = (n: number | null | undefined): boolean =>
  typeof n === 'number' && !Number.isFinite(n)

export function marketFactorId(location: Location): string {
  return marketInstruments.find((m) => m.id === location.marketInstrument)!.factorId
}

export function scope2Line(
  line: Scope2Line,
  location: Location,
  factors: readonly Factor[],
  period: Period,
): Scope2LineResult {
  const share = periodShare(line, period)
  const kWh = finiteOrZero(line.kWh) * share

  let locationFactor: Factor | null
  let marketFactor: Factor | null
  let locationValue: number | null
  let marketValue: number | null
  if (line.kind === 'electricity') {
    // The original looks the grid mix up by family; there's no factor with the family's id.
    locationFactor = findFamilyMember(factors, location.gridFamily, line.date)
    locationValue = line.customFactor ?? locationFactor?.value ?? null
    marketFactor = findFactor(factors, marketFactorId(location), line.date)
    marketValue = marketFactor?.value ?? null
  } else {
    locationFactor =
      findFactor(factors, location.heatingFactorId, line.date) ?? findFactor(factors, BEIS_HEATING, line.date)
    locationValue = line.customFactor ?? locationFactor?.value ?? null
    marketFactor = locationFactor
    marketValue = locationValue
  }

  const invalid = isInvalid(line.kWh) || isInvalid(line.customFactor)
  const warning = isInvalid(line.kWh)
    ? 'Mængden er ikke et gyldigt tal.'
    : isInvalid(line.customFactor)
      ? 'Faktoren er ikke et gyldigt tal.'
      : null

  return {
    line,
    share,
    kWh,
    locationFactor,
    locationValue,
    marketFactor,
    marketValue,
    locationT: (kWh * finiteOrZero(locationValue)) / 1000,
    marketT: (kWh * finiteOrZero(marketValue)) / 1000,
    pendingMarket: marketValue === null && kWh > 0,
    invalid,
    warning,
  }
}

function findFamilyMember(factors: readonly Factor[], family: string, date: string): Factor | null {
  const first = factors.find((f) => f.family === family)
  return first ? findFactor(factors, first.id, date) : null
}

/** Lines outside the period, or for a location that no longer exists, are left out. */
export function scope2Summary(
  locations: readonly Location[],
  lines: readonly Scope2Line[],
  factors: readonly Factor[],
  period: Period,
): Scope2Summary {
  const inPeriod = lines.filter((l) => periodShare(l, period) > 0)
  const perLocation = locations.map((location): LocationSummary => {
    const own = inPeriod.filter((l) => l.locationId === location.id)
    const electricity = own.filter((l) => l.kind === 'electricity').map((l) => scope2Line(l, location, factors, period))
    const heating = own.filter((l) => l.kind === 'heating').map((l) => scope2Line(l, location, factors, period))
    const sum = (rs: Scope2LineResult[], key: 'kWh' | 'locationT' | 'marketT') => rs.reduce((t, r) => t + r[key], 0)
    const electricityLocationT = sum(electricity, 'locationT')
    const electricityMarketT = sum(electricity, 'marketT')
    const heatingT = sum(heating, 'locationT')
    return {
      location,
      electricity,
      heating,
      electricityKWh: sum(electricity, 'kWh'),
      heatingKWh: sum(heating, 'kWh'),
      electricityLocationT,
      electricityMarketT,
      heatingT,
      locationTotal: electricityLocationT + heatingT,
      marketTotal: electricityMarketT + heatingT,
      // Faithful to the original: only electricity lines mark a location's market figure as pending.
      pendingMarket: electricity.some((r) => r.pendingMarket),
      pendingHeating: heating.some((r) => r.pendingMarket),
    }
  })

  const total = (key: keyof Pick<LocationSummary, 'electricityKWh' | 'heatingKWh' | 'electricityLocationT' | 'electricityMarketT' | 'heatingT'>) =>
    perLocation.reduce((t, l) => t + l[key], 0)
  const electricityKWh = total('electricityKWh')
  const electricityLocationT = total('electricityLocationT')
  const electricityMarketT = total('electricityMarketT')
  const heatingT = total('heatingT')
  const results = perLocation.flatMap((l) => [...l.electricity, ...l.heating])

  return {
    locations: perLocation,
    electricityKWh,
    heatingKWh: total('heatingKWh'),
    electricityLocationT,
    electricityMarketT,
    heatingT,
    locationTotal: electricityLocationT + heatingT,
    marketTotal: electricityMarketT + heatingT,
    pendingMarket: perLocation.some((l) => l.pendingMarket),
    pendingHeating: perLocation.some((l) => l.pendingHeating),
    invalidCount: results.filter((r) => r.invalid).length,
    averageGridFactor: electricityKWh > 0 ? (electricityLocationT * 1000) / electricityKWh : 0,
  }
}
