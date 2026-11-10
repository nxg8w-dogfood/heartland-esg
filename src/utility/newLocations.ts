// Creating Scope 2 locations from fetched meters. Several meters at one address (an
// electricity and a heating meter, or a building's sub-meters) become one location.

import { gridFamilyFor, type Location } from '../calc/scope2'
import { municipality } from '../data/municipalities'

export type MeterAddress = { key: string; address: string; municipalityCode: string | null }

/** Compares addresses as both APIs write them, e.g. "Store Torv 1, 8000 Aarhus C". */
export const addressKey = (address: string) => address.toLocaleLowerCase('da-DK').replace(/[\s,.]+/g, ' ').trim()

/**
 * Fills in a meter's municipality from another meter at the same address. Varmeoverblik gives
 * no municipality, but the building's electricity meter usually does.
 */
export function shareMunicipalities<T extends MeterAddress>(meters: readonly T[]): T[] {
  const known = new Map<string, string>()
  for (const m of meters) if (m.municipalityCode && municipality(m.municipalityCode)) known.set(addressKey(m.address), m.municipalityCode)
  return meters.map((m) => (m.municipalityCode && municipality(m.municipalityCode) ? m : { ...m, municipalityCode: known.get(addressKey(m.address)) ?? null }))
}

/** An existing location named after the meter's address, so a second fetch lands in the same place. */
export function matchingLocation(locations: readonly Location[], address: string): Location | undefined {
  const key = addressKey(address)
  return locations.find((l) => addressKey(l.name) === key)
}

/**
 * One new location per address among the meters marked for one. Returns the locations to add
 * and, per meter key, the location it goes to.
 */
export function newLocationsFor(
  meters: readonly MeterAddress[],
  base: () => Location,
): { locations: Location[]; byMeter: Record<string, string> } {
  const byAddress = new Map<string, Location>()
  const byMeter: Record<string, string> = {}
  for (const m of meters) {
    const key = addressKey(m.address)
    let location = byAddress.get(key)
    if (!location) {
      location = { ...base(), name: m.address, municipalityCode: null }
      byAddress.set(key, location)
    }
    if (!location.municipalityCode && m.municipalityCode && municipality(m.municipalityCode)) {
      location.municipalityCode = m.municipalityCode
    }
    byMeter[m.key] = location.id
  }
  const locations = [...byAddress.values()].map((l) => ({ ...l, gridFamily: gridFamilyFor(l.municipalityCode) }))
  return { locations, byMeter }
}
