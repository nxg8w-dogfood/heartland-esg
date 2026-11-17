// A company's meters, as the nightly sync found them (ADR 0021). The sync imports a meter's
// months only once it has a location; picking one is the app's job.

import type { MeterSource } from './fetchMeters'

export type Meter = {
  id: string
  service: MeterSource
  /** Eloverblik's metering point id, or Varmeoverblik's installation point id */
  meterId: string
  address: string
  /** Statistics Denmark code, when the source gives one (ADR 0012) */
  municipalityCode: string | null
  /** Where its months are imported; null until someone picks one */
  locationId: string | null
  /** When the sync last fetched it (ISO), null before the first run */
  lastFetched: string | null
  /** The last run's problem with this meter, e.g. a rejected token; null when it went well */
  error: string | null
}

export const serviceLabel: Record<MeterSource, string> = { eloverblik: 'El (Eloverblik)', varmeoverblik: 'Fjernvarme (Varmeoverblik)' }

/** The meter's key in a fetch (fetchMeters), to match a fetched meter with its record */
export const meterKey = (m: Pick<Meter, 'service' | 'meterId'>) => `${m.service === 'eloverblik' ? 'el' : 'heat'}:${m.meterId}`
