// The company's diesel and petrol cars, and how a Scope 1 line refers to one (ADR 0009).
// A line with fuel receipts is entered in litres, as before. A line without them can be entered
// in km for a registered car instead, and is converted with the car's WLTP fuel economy:
// litres = km ÷ km/l. Such a line is an estimate, and says so. A plug-in hybrid also has the
// user's estimate of how much of its driving is on fuel: litres = km × that share ÷ its km/l on
// fuel. The rest is on electricity, which isn't Scope 1.

import type { Scope1GroupId, Scope1Line } from './scope1'

export type VehicleFuel = 'diesel' | 'benzin'

/** The test cycle the fuel economy and CO2 figures come from */
export type TestNorm = 'WLTP' | 'NEDC'

export type Vehicle = {
  id: string
  /** Normalised: upper case, no spaces or dashes, e.g. "AB12345" */
  plate: string
  make: string
  model: string
  variant?: string
  fuel: VehicleFuel
  /** ISO date */
  firstRegistration?: string | null
  /**
   * Fuel economy, km per litre. For a plug-in hybrid, when it runs on fuel: the register's WLTP
   * figure for one already assumes part of the driving is electric, so it isn't used.
   */
  kmPerLitre: number | null
  /** A plug-in hybrid: part of its driving is on electricity */
  pluginHybrid?: boolean
  /** Plug-in hybrids: the user's estimate of the share of km driven on fuel, in percent (0–100) */
  fuelSharePercent?: number | null
  /** CO2, g per km. Shown, not used: Scope 1 uses the fuel's emission factor. */
  co2GPerKm?: number | null
  testNorm?: TestNorm | null
  /** Range in km, entered by hand; the lookup doesn't provide it for diesel and petrol cars */
  rangeKm?: number | null
  /** Where the technical data came from */
  source: 'lookup' | 'manual'
  /** When the lookup was made, ISO date-time */
  fetchedAt?: string | null
}

const groupForFuel: Record<VehicleFuel, Scope1GroupId> = { diesel: 's1-diesel', benzin: 's1-benzin' }

export function scope1GroupFor(fuel: VehicleFuel): Scope1GroupId {
  return groupForFuel[fuel]
}

export const fuelLabel: Record<VehicleFuel, string> = { diesel: 'Diesel', benzin: 'Benzin' }

/**
 * Upper case, without spaces, dashes and dots. Returns null if what's left can't be a Danish
 * plate: 2–7 letters and digits. Ordinary plates are two letters and five digits (AB 12 345);
 * personal plates are up to seven characters.
 */
export function normalisePlate(input: string): string | null {
  const plate = input.toLocaleUpperCase('da-DK').replace(/[\s.-]/g, '')
  return /^[A-ZÆØÅ0-9]{2,7}$/.test(plate) ? plate : null
}

/** "AB12345" → "AB 12 345"; other plates are shown as they are. */
export function formatPlate(plate: string): string {
  const m = /^([A-ZÆØÅ]{2})(\d{2})(\d{3})$/.exec(plate)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate
}

export function vehicleName(v: Vehicle): string {
  return `${formatPlate(v.plate)} – ${[v.make, v.model].filter(Boolean).join(' ')}`.trim()
}

/** Litres for a distance. Null if either is missing or the fuel economy isn't positive. */
export function litresFromKm(km: number | null | undefined, kmPerLitre: number | null | undefined): number | null {
  if (typeof km !== 'number' || !Number.isFinite(km)) return null
  if (typeof kmPerLitre !== 'number' || !Number.isFinite(kmPerLitre) || kmPerLitre <= 0) return null
  return km / kmPerLitre
}

/**
 * The share of a car's km that burns fuel, 0–1: all of it for an ordinary car, the user's
 * estimate for a plug-in hybrid. Null for a plug-in hybrid without a usable estimate.
 */
export function fuelShare(v: Vehicle): number | null {
  if (!v.pluginHybrid) return 1
  const p = v.fuelSharePercent
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100 ? p / 100 : null
}

export type ResolvedScope1Line = Scope1Line & {
  /** Set when the quantity was worked out from km rather than entered in litres */
  estimate?: { km: number | null; kmPerLitre: number | null; fuelShare: number | null; vehicle: Vehicle | null; problem: string | null }
}

/**
 * Fills in the litres of every line entered in km. A line whose car is missing, has no fuel
 * economy, or runs on the other fuel gets no quantity, so it waits for data instead of
 * counting as zero or under the wrong fuel. Lines entered in litres are returned unchanged.
 */
export function resolveScope1Lines(lines: readonly Scope1Line[], vehicles: readonly Vehicle[]): ResolvedScope1Line[] {
  return lines.map((line) => {
    if (line.distanceKm == null) return line
    const km = Number.isFinite(line.distanceKm) ? line.distanceKm : null
    const vehicle = vehicles.find((v) => v.id === line.vehicleId) ?? null
    let problem: string | null = null
    if (!vehicle) problem = 'Bilen findes ikke længere i bilparken.'
    else if (scope1GroupFor(vehicle.fuel) !== line.group) problem = `Bilen kører på ${fuelLabel[vehicle.fuel].toLowerCase()}, ikke på linjens brændstof.`
    else if (litresFromKm(1, vehicle.kmPerLitre) === null) problem = 'Bilen har ikke noget brændstofforbrug (km/l).'
    else if (fuelShare(vehicle) === null) problem = 'Bilen er en plugin-hybrid uden et skøn over, hvor stor en del af kørslen der er på brændstof.'
    const share = vehicle ? fuelShare(vehicle) : null
    const quantity = problem ? null : litresFromKm(km === null ? null : km * share!, vehicle!.kmPerLitre)
    return { ...line, quantity, estimate: { km, kmPerLitre: vehicle?.kmPerLitre ?? null, fuelShare: share, vehicle, problem } }
  })
}
