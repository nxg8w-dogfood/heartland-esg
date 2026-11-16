// Fetches every meter a company's tokens can read, as one list: used by the app's manual fetch
// (ADR 0011) and by the nightly sync (ADR 0021), so both import exactly the same lines.

import type { Scope2Kind } from '../calc/scope2'
import { fetchElectricity } from './eloverblik'
import type { Fetch } from './http'
import type { Month } from './months'
import { shareMunicipalities } from './newLocations'
import type { MonthlyFigure } from './toLines'
import { fetchHeating } from './varmeoverblik'

export type MeterSource = 'eloverblik' | 'varmeoverblik'

export type FetchedMeter = {
  /** Unique across both sources, e.g. "el:571313…" */
  key: string
  service: MeterSource
  /** The meter's id at its source: Eloverblik's metering point, Varmeoverblik's installation point */
  meterId: string
  kind: Scope2Kind
  /** Starts every imported line's description; how a month already imported is recognised */
  source: string
  label: string
  address: string
  municipalityCode: string | null
  months: MonthlyFigure[]
  error: string | null
}

export type Tokens = { eloverblik?: string | null; varmeoverblik?: string | null }

export type FetchResult = {
  meters: FetchedMeter[]
  /** Varmeoverblik entries whose utility hasn't linked a meter yet */
  withoutData: string[]
  /** One message per service that failed as a whole, e.g. a rejected token */
  problems: string[]
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function fetchMeters(doFetch: Fetch, tokens: Tokens, months: readonly Month[]): Promise<FetchResult> {
  const found: FetchedMeter[] = []
  const problems: string[] = []
  let withoutData: string[] = []
  const el = tokens.eloverblik?.trim()
  const heat = tokens.varmeoverblik?.trim()
  if (el) {
    try {
      for (const m of await fetchElectricity(doFetch, el, months)) {
        found.push({
          key: `el:${m.meteringPointId}`,
          service: 'eloverblik',
          meterId: m.meteringPointId,
          kind: 'electricity',
          source: `Eloverblik · ${m.meteringPointId} · ${m.address}`,
          label: `${m.address} (målepunkt ${m.meteringPointId})`,
          address: m.address,
          municipalityCode: m.municipalityCode,
          months: m.months,
          error: m.error,
        })
      }
    } catch (err) {
      problems.push(message(err))
    }
  }
  if (heat) {
    try {
      const heating = await fetchHeating(doFetch, heat, months)
      for (const m of heating.meters) {
        found.push({
          key: `heat:${m.installationPointId}`,
          service: 'varmeoverblik',
          meterId: m.installationPointId,
          kind: 'heating',
          source: `Varmeoverblik · ${m.utility} · ${m.address}`,
          label: `${m.address} (${m.utility})`,
          address: m.address,
          municipalityCode: null,
          months: m.months,
          error: null,
        })
      }
      withoutData = heating.withoutData
    } catch (err) {
      problems.push(message(err))
    }
  }
  // Heating meters borrow the municipality of an electricity meter at the same address.
  return { meters: shareMunicipalities(found), withoutData, problems }
}
