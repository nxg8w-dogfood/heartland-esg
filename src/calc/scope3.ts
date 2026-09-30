// Scope 3: the 15 GHG Protocol categories, and category 3 (fuel- and energy-related
// activities), which is derived from Scope 1 and 2 data. Ported from the original app.

import type { Factor } from '../data/factors'
import { activitySummary, type ActivityGroup, type ActivityLine, type ActivitySummary } from './activity'
import type { Period } from './dates'
import { factorSegments } from './factorSegments'
import { findFactor } from './findFactor'
import { scope1Groups, type Scope1GroupId, type Scope1Line } from './scope1'
import type { Scope2Summary } from './scope2'

export type Scope3Category = {
  nr: number
  name: string
  english: string
  /** The original app's default: relevant for a holding company like Heartland */
  relevantByDefault: boolean
  /** The original's reason for that default */
  reason: string
}

export const scope3Categories: readonly Scope3Category[] = [
  { nr: 1, name: 'Indkøbte varer og services', english: 'Purchased Goods and Services', relevantByDefault: true, reason: 'Væsentlig kategori — beregnes primært spend-baseret via EXIOBASE-sektorer.' },
  { nr: 2, name: 'Kapitalgoder', english: 'Capital Goods', relevantByDefault: false, reason: 'Kapitalanskaffelser opgøres nu selvstændigt med fuld beregner.' },
  { nr: 3, name: 'Brændstof- og energirelaterede aktiviteter', english: 'Fuel- and Energy-Related Activities', relevantByDefault: true, reason: 'Relevant — beregnes automatisk af brændstof- og elforbrug fra Scope 1 og 2.' },
  { nr: 4, name: 'Upstream transport og distribution', english: 'Upstream Transportation and Distribution', relevantByDefault: false, reason: 'Holdingselskab uden væsentlige fysiske varestrømme — kan aktiveres ved behov.' },
  { nr: 5, name: 'Affald genereret i driften', english: 'Waste Generated in Operations', relevantByDefault: true, reason: 'Relevant — aktivitetsbaseret opgørelse pr. fraktion og behandlingsform.' },
  { nr: 6, name: 'Forretningsrejser', english: 'Business Travel', relevantByDefault: true, reason: 'Relevant — væsentlig aktivitet for et holdingselskab.' },
  { nr: 7, name: 'Medarbejderpendling', english: 'Employee Commuting', relevantByDefault: true, reason: 'Relevant — opgøres survey-baseret med ekstrapolering til hele medarbejderstaben.' },
  { nr: 8, name: 'Upstream leasede aktiver', english: 'Upstream Leased Assets', relevantByDefault: false, reason: 'Kontorlokaler er dækket via Scope 1/2.' },
  { nr: 9, name: 'Downstream transport og distribution', english: 'Downstream Transportation and Distribution', relevantByDefault: false, reason: 'Sælger ikke fysiske produkter.' },
  { nr: 10, name: 'Forarbejdning af solgte produkter', english: 'Processing of Sold Products', relevantByDefault: false, reason: 'Sælger ikke mellemprodukter.' },
  { nr: 11, name: 'Brug af solgte produkter', english: 'Use of Sold Products', relevantByDefault: false, reason: 'Holdingselskab uden egne solgte produkter.' },
  { nr: 12, name: 'Endt levetid for solgte produkter', english: 'End-of-Life Treatment of Sold Products', relevantByDefault: false, reason: 'Sælger ikke fysiske produkter.' },
  { nr: 13, name: 'Downstream leasede aktiver', english: 'Downstream Leased Assets', relevantByDefault: false, reason: 'Udlejer ikke aktiver.' },
  { nr: 14, name: 'Franchises', english: 'Franchises', relevantByDefault: false, reason: 'Ingen franchise-aktiviteter.' },
  { nr: 15, name: 'Investeringer', english: 'Investments', relevantByDefault: true, reason: 'Vigtigste kategori for et holdingselskab. Kun investeringer med ejerandel ≤ 50 % indgår i totalen.' },
]

/** Well-to-tank factor for each Scope 1 fuel, as in the original. Refrigerants have none. */
export const wttFactorFor: Partial<Record<Scope1GroupId, string>> = {
  's1-diesel': 'f-k3-wtt-diesel',
  's1-benzin': 'f-k3-wtt-benzin',
  's1-naturgas': 'f-k3-wtt-naturgas',
  's1-gasolie': 'f-k3-wtt-gasolie',
}

export type Category3Params = {
  /** Share of electricity lost in the grid, 0 to below 1 (Energinet: 0.07) */
  gridLoss: number
  /** Upstream (well-to-tank) emissions of electricity per unit of direct emissions (BEIS: 0.2419) */
  wttRatio: number
}

/** The defaults, taken from the factor table like the original's. */
export function defaultCategory3Params(factors: readonly Factor[]): Category3Params {
  return {
    gridLoss: factors.find((f) => f.id === 'f-k3-nettab')?.value ?? 0.07,
    wttRatio: factors.find((f) => f.id === 'f-k3-wtt-ratio')?.value ?? 0.2419,
  }
}

export type FuelWtt = {
  group: Scope1GroupId
  label: string
  unit: string
  quantity: number
  factor: Factor | null
  tCO2e: number
  pending: boolean
}

export type Category3 = {
  fuels: FuelWtt[]
  fuelT: number
  /** kg CO2e/kWh, location-based average from Scope 2 */
  gridFactor: number
  /** Upstream emissions of the electricity itself, kg CO2e/kWh */
  electricityWtt: number
  /** Upstream emissions of the electricity lost in the grid, kg CO2e/kWh */
  electricityLossWtt: number
  electricityKWh: number
  electricityT: number
  heatingKWh: number
  heatingLossFactor: Factor | null
  heatingT: number
  heatingPending: boolean
  total: number
}

const finiteOrZero = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

export function category3(
  scope1Lines: readonly Scope1Line[],
  scope2: Scope2Summary,
  factors: readonly Factor[],
  period: Period,
  params: Category3Params,
): Category3 {
  // Fuels: each Scope 1 fuel line's quantity × its well-to-tank factor. Lines are split where
  // the factor changes year, like everywhere else (the original used one factor per fuel).
  const fuels: FuelWtt[] = []
  for (const group of scope1Groups) {
    const wttId = wttFactorFor[group.id]
    if (!wttId) continue
    let quantity = 0
    let tCO2e = 0
    let latest: { date: string; factor: Factor | null } | null = null
    for (const line of scope1Lines) {
      if (line.group !== group.id) continue
      const segments = factorSegments(factors, wttId, line, period)
      if (segments.length === 0) continue
      for (const s of segments) {
        const q = finiteOrZero(line.quantity) * s.share
        quantity += q
        tCO2e += (q * finiteOrZero(s.factor?.value)) / 1000
      }
      if (!latest || line.date > latest.date) latest = { date: line.date, factor: segments[segments.length - 1].factor }
    }
    if (!latest) continue
    fuels.push({
      group: group.id,
      label: latest.factor?.name ?? group.label,
      unit: group.unit,
      quantity,
      factor: latest.factor,
      tCO2e,
      pending: latest.factor?.value == null && quantity > 0,
    })
  }
  const fuelT = fuels.reduce((t, f) => t + f.tCO2e, 0)

  // Electricity: upstream emissions of the electricity used, plus of the part lost in the grid.
  const gridFactor = scope2.averageGridFactor
  const electricityWtt = gridFactor * params.wttRatio
  const electricityLossWtt =
    params.gridLoss < 1 ? (gridFactor / (1 - params.gridLoss) - gridFactor) * params.wttRatio : 0
  const electricityT = (scope2.electricityKWh * (electricityWtt + electricityLossWtt)) / 1000

  // District heating: distribution losses.
  const heatingLossFactor = findFactor(factors, 'f-k3-fjernvarme-td', period.end)
  const heatingT = (scope2.heatingKWh * finiteOrZero(heatingLossFactor?.value)) / 1000

  return {
    fuels,
    fuelT,
    gridFactor,
    electricityWtt,
    electricityLossWtt,
    electricityKWh: scope2.electricityKWh,
    electricityT,
    heatingKWh: scope2.heatingKWh,
    heatingLossFactor,
    heatingT,
    heatingPending: heatingLossFactor?.value == null && scope2.heatingKWh > 0,
    total: fuelT + electricityT + heatingT,
  }
}

// Categories 5 and 6 are entered as activity lines, one row type per factor, as in the original.

export const category6Groups: readonly ActivityGroup[] = [
  { id: 'k6-fly-kort', label: 'Fly – kort distance', unit: 'passagerkm', factorId: 'f-t-fly-kort' },
  { id: 'k6-fly-lang', label: 'Fly – lang distance', unit: 'passagerkm', factorId: 'f-t-fly-lang' },
  { id: 'k6-fly-indenrigs', label: 'Fly – indenrigs', unit: 'passagerkm', factorId: 'f-t-fly-indenrigs' },
  { id: 'k6-bus', label: 'Bus', unit: 'passagerkm', factorId: 'f-t-bus' },
  { id: 'k6-tog', label: 'Tog', unit: 'passagerkm', factorId: 'f-t-tog' },
  { id: 'k6-taxi', label: 'Taxi', unit: 'passagerkm', factorId: 'f-t-taxi' },
  { id: 'k6-faerge', label: 'Færge', unit: 'passagerkm', factorId: 'f-t-faerge' },
  { id: 'k6-bil-diesel', label: 'Firmabil – diesel', unit: 'km', factorId: 'f-t-bil-diesel' },
  { id: 'k6-bil-benzin', label: 'Firmabil – benzin', unit: 'km', factorId: 'f-t-bil-benzin' },
  // Starts on Denmark, which BEIS doesn't cover (blank by design): pick the hotel's country or a proxy.
  { id: 'k6-hotel', label: 'Hotelovernatning', unit: 'værelsesnat', factorId: 'f-hotel-dk', factorChoices: 'Kat 6 – hotel' },
]

export const category5Groups: readonly ActivityGroup[] = [
  { id: 'k5-papir-dep', label: 'Pap/papir – deponi', unit: 'tonne', factorId: 'f-w-papir-dep' },
  { id: 'k5-papir-gen', label: 'Pap/papir – genanvendelse', unit: 'tonne', factorId: 'f-w-papir-gen' },
  { id: 'k5-trae-dep', label: 'Paller/træaffald – deponi', unit: 'tonne', factorId: 'f-w-trae-dep' },
  { id: 'k5-trae-gen', label: 'Paller/træaffald – genanvendelse', unit: 'tonne', factorId: 'f-w-trae-gen' },
  { id: 'k5-plast-forbr', label: 'Plast – forbrænding m/energi', unit: 'tonne', factorId: 'f-w-plast-forbr' },
  { id: 'k5-plast-gen', label: 'Plast – genanvendelse', unit: 'tonne', factorId: 'f-w-plast-gen' },
  { id: 'k5-hush-forbr', label: 'Blandet husholdningsaffald – forbrænding', unit: 'tonne', factorId: 'f-w-hush-forbr' },
  { id: 'k5-blandet-forbr', label: 'Blandet plast/metal – forbrænding', unit: 'tonne', factorId: 'f-w-blandet-forbr' },
  { id: 'k5-blandet-gen', label: 'Blandet plast/metal – genanvendelse', unit: 'tonne', factorId: 'f-w-blandet-gen' },
  { id: 'k5-andet-dep', label: 'Andet (elektronik/metal/glas) – deponi', unit: 'tonne', factorId: 'f-w-andet-dep' },
  { id: 'k5-andet-gen', label: 'Andet (elektronik/metal/glas) – genanvendelse', unit: 'tonne', factorId: 'f-w-andet-gen' },
]

export type Category6 = ActivitySummary & { travelT: number; hotelT: number }

export function category6(lines: readonly ActivityLine[], factors: readonly Factor[], period: Period): Category6 {
  const s = activitySummary(lines, category6Groups, factors, period)
  const hotelT = s.lines.filter((r) => r.group.id === 'k6-hotel').reduce((t, r) => t + r.tCO2e, 0)
  return { ...s, travelT: s.total - hotelT, hotelT }
}

export function category5(lines: readonly ActivityLine[], factors: readonly Factor[], period: Period): ActivitySummary {
  return activitySummary(lines, category5Groups, factors, period)
}
