// Looking up a Danish plate (ADR 0009). The app never calls MotorAPI itself: inside Power Apps
// the call goes through the MotorAPI custom connector (connectors/motorapi/), which adds the API
// key from Key Vault on the server. This file maps MotorAPI's answers to the app's Vehicle, and
// says what to do when there's no connector, so the page works with manual entry until then.

import type { TestNorm, Vehicle, VehicleFuel } from '../calc/vehicles'
import { formatNumber } from '../format'

/** The fields the app uses from GET /vehicles/{plate} (https://v1.motorapi.dk/doc/) */
export type MotorApiVehicle = {
  registration_number?: string | null
  type?: string | null
  make?: string | null
  model?: string | null
  variant?: string | null
  /** "2019-08-26+02:00": a date with its UTC offset */
  first_registration?: string | null
  fuel_type?: string | null
  is_hybrid?: boolean | null
  hybrid_type?: 'mild' | 'plugin' | string | null
}

/** The fields the app uses from GET /vehicles/{plate}/environment */
export type MotorApiEnvironment = {
  fuel_type?: string | null
  /** km/l */
  fuel_usage?: number | null
  /** km/l, for some hybrids instead of fuel_usage */
  total_usage?: number | null
  /** g/km */
  co2_emission?: number | null
  measurement_norm?: string | null
}

/** What a lookup found: the car's technical data, ready to save as a Vehicle */
export type LookupVehicle = Omit<Vehicle, 'id'>

export type LookupResult =
  | { ok: true; vehicle: LookupVehicle; notes: string[] }
  | { ok: false; reason: 'not-found' | 'not-supported' | 'limit' | 'unavailable' | 'failed'; message: string }

export type PlateLookup = {
  /** False when there's no connector to call; the page then offers manual entry only */
  available: boolean
  /** Shown next to the lookup, e.g. that the data is example data */
  label: string
  lookup: (plate: string) => Promise<LookupResult>
}

const fuels: Record<string, VehicleFuel> = { diesel: 'diesel', benzin: 'benzin' }
const norms: Record<string, TestNorm> = { wltp: 'WLTP', nedc: 'NEDC' }

const positive = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)
const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '')

/**
 * Maps MotorAPI's vehicle and environment answers to a Vehicle. Only diesel and petrol cars,
 * plug-in hybrids included, can be registered: electric cars aren't Scope 1 fuel lines. A
 * plug-in hybrid comes without km/l, since the register's figure already counts electric
 * driving; the user enters its km/l on fuel and how much it drives on fuel. The environment call
 * may fail on its own; the car is still returned, without fuel economy.
 */
export function fromMotorApi(
  plate: string,
  vehicle: MotorApiVehicle,
  environment: MotorApiEnvironment | null,
  fetchedAt: string,
): LookupResult {
  const fuelName = clean(vehicle.fuel_type || environment?.fuel_type)
  const fuel = fuels[fuelName.toLowerCase()]
  const name = [clean(vehicle.make), clean(vehicle.model)].filter(Boolean).join(' ') || 'Bilen'
  if (!fuel) {
    return {
      ok: false,
      reason: 'not-supported',
      message: `${name} kører på ${fuelName ? fuelName.toLowerCase() : 'et ukendt brændstof'}. Kun diesel- og benzinbiler kan registreres her.`,
    }
  }
  const pluginHybrid = vehicle.is_hybrid === true && vehicle.hybrid_type === 'plugin'

  const notes: string[] = []
  // MotorAPI gives fuel_usage for ordinary cars and total_usage for some hybrids.
  const registered = positive(environment?.fuel_usage) ?? positive(environment?.total_usage)
  const kmPerLitre = pluginHybrid ? null : registered
  if (pluginHybrid) {
    notes.push(
      `${name} er en plugin-hybrid. Angiv et skøn over, hvor stor en del af kørslen der er på brændstof, og bilens forbrug, når den kører på brændstof. ` +
      (registered === null ? 'Registret har ikke noget forbrug for bilen.' : `Registrets ${formatNumber(registered, 1)} km/l regner med, at en del af kørslen er på el, så det bruges ikke.`),
    )
  } else if (!environment) notes.push('Miljødata kunne ikke hentes. Angiv brændstofforbruget selv.')
  else if (kmPerLitre === null) notes.push('Registret har ikke noget brændstofforbrug for bilen. Angiv det selv.')
  const testNorm = norms[clean(environment?.measurement_norm).toLowerCase()] ?? null
  if (testNorm === 'NEDC') notes.push('Tallene er målt efter NEDC, ikke WLTP. NEDC-forbrug er typisk lavere end det reelle.')
  if (vehicle.type && vehicle.type !== 'Personbil') notes.push(`Køretøjet er registreret som ${vehicle.type.toLowerCase()}.`)

  const firstRegistration = /^\d{4}-\d{2}-\d{2}/.exec(clean(vehicle.first_registration))?.[0] ?? null

  return {
    ok: true,
    notes,
    vehicle: {
      plate,
      make: clean(vehicle.make),
      model: clean(vehicle.model),
      variant: clean(vehicle.variant) || undefined,
      fuel,
      firstRegistration,
      kmPerLitre,
      ...(pluginHybrid ? { pluginHybrid: true, fuelSharePercent: null } : {}),
      co2GPerKm: positive(environment?.co2_emission),
      testNorm,
      rangeKm: null,
      source: 'lookup',
      fetchedAt,
    },
  }
}

/** HTTP status from a connector call → what to tell the user */
export function lookupFailure(status: number | undefined): LookupResult & { ok: false } {
  switch (status) {
    case 404: return { ok: false, reason: 'not-found', message: 'Nummerpladen findes ikke i Motorregistret. Tjek den, eller indtast bilen selv.' }
    case 403: return { ok: false, reason: 'limit', message: 'Dagens grænse for opslag er nået. Prøv igen i morgen, eller indtast bilen selv.' }
    default: return { ok: false, reason: 'failed', message: 'Opslaget mislykkedes. Prøv igen om lidt, eller indtast bilen selv.' }
  }
}
