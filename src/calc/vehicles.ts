// The company's diesel and petrol cars, and how a Scope 1 line refers to one (ADR 0009).
// A line with fuel receipts is entered in litres, as before. A line without them can be entered
// in km for a registered car instead, and is converted with the car's WLTP fuel economy:
// litres = km ÷ km/l. Such a line is an estimate, and says so. A plug-in hybrid also has the
// user's estimate of how much of its driving is on fuel: litres = km × that share ÷ its km/l on
// fuel. The rest is on electricity, which isn't Scope 1; with the car's Wh/km it's shown as kWh.

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
  /** Fuel economy, km per litre. For a plug-in hybrid, when it runs on fuel. */
  kmPerLitre: number | null
  /** Plug-in hybrids: electricity use when driving on electricity, Wh per km */
  whPerKm?: number | null
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
  estimate?: {
    km: number | null
    kmPerLitre: number | null
    fuelShare: number | null
    /** A plug-in hybrid's km on electricity × its Wh/km, in kWh. Shown only: not Scope 1. */
    electricKwh: number | null
    vehicle: Vehicle | null
    problem: string | null
  }
}

/**
 * The Scope 1 group a car's lines count under: its fuel's. Null for a fuel Scope 1 has no group
 * for, which the stored data can't hold today (only diesel and petrol cars are registered).
 */
function groupOf(vehicle: Vehicle): Scope1GroupId | null {
  return Object.hasOwn(groupForFuel, vehicle.fuel) ? groupForFuel[vehicle.fuel] : null
}

/**
 * Puts every line for a registered car under the car's fuel, and fills in the litres of every
 * line entered in km. The fuel comes from the car, so a line follows when the car's fuel is
 * corrected in Bilpark; a line whose car is gone keeps the fuel it was entered with. A line in
 * km whose car is missing or has no fuel economy gets no quantity, so it waits for data instead
 * of counting as zero. Lines without a car are returned unchanged.
 */
export function resolveScope1Lines(lines: readonly Scope1Line[], vehicles: readonly Vehicle[]): ResolvedScope1Line[] {
  return lines.map((stored) => {
    const vehicle = stored.vehicleId ? vehicles.find((v) => v.id === stored.vehicleId) ?? null : null
    const group = vehicle ? groupOf(vehicle) : null
    const line = group && group !== stored.group ? { ...stored, group } : stored
    if (line.distanceKm == null) return line
    const km = Number.isFinite(line.distanceKm) ? line.distanceKm : null
    let problem: string | null = null
    if (!vehicle) problem = 'Bilen findes ikke længere i bilparken.'
    else if (!group) problem = 'Bilens brændstof er ukendt.'
    else if (litresFromKm(1, vehicle.kmPerLitre) === null) problem = 'Bilen har ikke noget brændstofforbrug (km/l).'
    else if (fuelShare(vehicle) === null) problem = 'Bilen er en plugin-hybrid uden et skøn over, hvor stor en del af kørslen der er på brændstof.'
    const share = vehicle ? fuelShare(vehicle) : null
    const quantity = problem ? null : litresFromKm(km === null ? null : km * share!, vehicle!.kmPerLitre)
    const wh = vehicle?.whPerKm
    const electricKwh = km !== null && share !== null && share < 1 && typeof wh === 'number' && Number.isFinite(wh) && wh > 0 ? (km * (1 - share) * wh) / 1000 : null
    return { ...line, quantity, estimate: { km, kmPerLitre: vehicle?.kmPerLitre ?? null, fuelShare: share, electricKwh, vehicle, problem } }
  })
}
