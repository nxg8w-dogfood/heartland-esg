// District heating from Varmeoverblik (https://api.varmeoverblik.dk/swagger-ui/index.html).
// The `energi` register is a cumulative meter reading in MWh, hourly; each month's
// consumption is the difference between the readings at the local month boundaries.

import { requestJson, UtilityApiError, type Fetch } from './http'
import { monthlyFromReadings, type MonthlyConsumption, type Reading } from './meterReadings'
import type { Month } from './months'

export const VARMEOVERBLIK_BASE = 'https://api.varmeoverblik.dk'
const SERVICE = 'Varmeoverblik'
const HOUR_MS = 3_600_000

type Register = { id: string; type: string; unit: string; name?: string }
export type InstallationPoint = {
  id: string | null
  type: string
  meters: { id: string; name?: string; registers: Register[] }[]
  installationPlace: {
    address: { darId?: string | null; name?: string | null } | null
  } | null
  utilityCompanyName?: string | null
}
type ReadingsPage = { content: { timestamp: string; value: number }[]; page: { number: number; totalPages: number } }

export type HeatingMeter = {
  installationPointId: string
  darId: string | null
  address: string
  utility: string
  months: (MonthlyConsumption & { kWh: number | null })[]
}

export type HeatingResult = {
  meters: HeatingMeter[]
  /** Entries without an installation point, e.g. a utility that hasn't connected its data yet */
  withoutData: string[]
}

const unitToKWh: Record<string, number> = { mwh: 1000, kwh: 1 }

export async function createAccessToken(doFetch: Fetch, refreshToken: string): Promise<string> {
  const body = await requestJson<{ token?: string }>(doFetch, SERVICE, `${VARMEOVERBLIK_BASE}/access-token/create`, refreshToken)
  if (!body.token) throw new UtilityApiError(`${SERVICE} returnerede ikke et adgangstoken.`, null)
  return body.token
}

/** All readings in [from, to], across pages, as given by the API (duplicates included). */
export async function readingsBetween(doFetch: Fetch, accessToken: string, installationPointId: string, fromMs: number, toMs: number): Promise<Reading[]> {
  const readings: Reading[] = []
  for (let page = 0, totalPages = 1; page < totalPages; page++) {
    const query = new URLSearchParams({
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      page: String(page),
      size: '100',
    })
    const url = `${VARMEOVERBLIK_BASE}/api/metering-data/installation-point/${encodeURIComponent(installationPointId)}/register-type/energi?${query}`
    const body = await requestJson<ReadingsPage>(doFetch, SERVICE, url, accessToken)
    for (const r of body.content ?? []) readings.push({ ms: Date.parse(r.timestamp), value: Number(r.value) })
    totalPages = Math.min(body.page?.totalPages ?? 1, 50)
  }
  return readings
}

/**
 * Readings around each month boundary only: a year is 13 small requests instead of
 * 17,000+ hourly rows. A boundary without a reading nearby is retried with a wider window,
 * and the month is then interpolated and marked as estimated.
 */
async function boundaryReadings(doFetch: Fetch, accessToken: string, id: string, boundaries: number[]): Promise<Reading[]> {
  const readings: Reading[] = []
  for (const b of boundaries) {
    let near = await readingsBetween(doFetch, accessToken, id, b - 2 * HOUR_MS, b + 2 * HOUR_MS)
    const hasBoth = (rs: Reading[]) => rs.some((r) => r.ms <= b) && rs.some((r) => r.ms >= b)
    if (!hasBoth(near)) near = await readingsBetween(doFetch, accessToken, id, b - 48 * HOUR_MS, b + 48 * HOUR_MS)
    readings.push(...near)
  }
  return readings
}

export async function fetchHeating(doFetch: Fetch, refreshToken: string, months: readonly Month[]): Promise<HeatingResult> {
  const accessToken = await createAccessToken(doFetch, refreshToken)
  const points = await requestJson<InstallationPoint[]>(doFetch, SERVICE, `${VARMEOVERBLIK_BASE}/api/installation-points/`, accessToken)
  const boundaries = [...new Set(months.flatMap((m) => [m.startMs, m.endMs]))].sort((a, b) => a - b)

  const meters: HeatingMeter[] = []
  const withoutData: string[] = []
  for (const point of points) {
    const energy = point.meters?.flatMap((m) => m.registers ?? []).find((r) => r.type === 'energi')
    const utility = point.utilityCompanyName ?? 'Ukendt forsyning'
    if (!point.id || !energy) {
      withoutData.push(utility)
      continue
    }
    const factor = unitToKWh[energy.unit?.toLowerCase()]
    if (!factor) throw new UtilityApiError(`${SERVICE}: ukendt enhed "${energy.unit}" for energi.`, null)
    const readings = months.length ? await boundaryReadings(doFetch, accessToken, point.id, boundaries) : []
    meters.push({
      installationPointId: point.id,
      darId: point.installationPlace?.address?.darId ?? null,
      address: point.installationPlace?.address?.name ?? point.id,
      utility,
      months: monthlyFromReadings(readings, months).map((m) => ({
        ...m,
        kWh: m.quantity === null ? null : Math.round(m.quantity * factor * 10) / 10,
      })),
    })
  }
  return { meters, withoutData }
}
