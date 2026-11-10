// Electricity from Energinet's Eloverblik Customer API
// (https://api.eloverblik.dk/customerapi/swagger/v1/swagger.json). Monthly totals come
// straight from the API (aggregation Month).

import { requestJson, UtilityApiError, type Fetch } from './http'
import { copenhagenLocal, type Month } from './months'

export const ELOVERBLIK_BASE = 'https://api.eloverblik.dk/customerapi/api'
const SERVICE = 'Eloverblik'
/** Energinet asks callers to bundle about 10 metering points per request. */
const BATCH = 10
/** Requests may span at most 730 days; a year at a time stays well inside that. */
const MONTHS_PER_REQUEST = 12

type MeteringPoint = {
  meteringPointId: string
  typeOfMP?: string
  streetName?: string | null
  buildingNumber?: string | null
  postcode?: string | null
  cityName?: string | null
}

type Point = { position?: string; 'out_Quantity.quantity'?: string; 'out_Quantity.quality'?: string; out_Quantity?: { quantity?: string; quality?: string } }
type Period = { timeInterval?: { start?: string; end?: string }; Point?: Point[] }
type TimeSeries = { 'measurement_Unit.name'?: string; measurement_Unit?: { name?: string }; Period?: Period[] }
type DocumentResult = {
  success?: boolean
  errorCode?: number | string
  errorText?: string
  id?: string
  MyEnergyData_MarketDocument?: { TimeSeries?: TimeSeries[] }
}

export type ElectricityMeter = {
  meteringPointId: string
  address: string
  months: { month: Month; kWh: number | null; missing: boolean }[]
  error: string | null
}

const unitToKWh: Record<string, number> = { KWH: 1, MWH: 1000 }

export async function createAccessToken(doFetch: Fetch, refreshToken: string): Promise<string> {
  const body = await requestJson<{ result?: string }>(doFetch, SERVICE, `${ELOVERBLIK_BASE}/token`, refreshToken)
  if (!body.result) throw new UtilityApiError(`${SERVICE} returnerede ikke et adgangstoken.`, null)
  return body.result
}

const addressOf = (mp: MeteringPoint) =>
  [[mp.streetName, mp.buildingNumber].filter(Boolean).join(' '), [mp.postcode, mp.cityName].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ') || mp.meteringPointId

/** kWh per local month (`YYYY-MM`) from one metering point's market document. */
export function monthlyKWh(result: DocumentResult): Map<string, number> {
  const totals = new Map<string, number>()
  for (const series of result.MyEnergyData_MarketDocument?.TimeSeries ?? []) {
    const unit = (series['measurement_Unit.name'] ?? series.measurement_Unit?.name ?? '').toUpperCase()
    const factor = unitToKWh[unit]
    if (!factor) throw new UtilityApiError(`${SERVICE}: ukendt enhed "${unit || 'ingen'}".`, null)
    for (const period of series.Period ?? []) {
      const start = Date.parse(period.timeInterval?.start ?? '')
      if (!Number.isFinite(start)) continue
      const key = copenhagenLocal(start).slice(0, 7)
      const kWh = (period.Point ?? []).reduce((sum, p) => sum + Number(p['out_Quantity.quantity'] ?? p.out_Quantity?.quantity ?? 0) * factor, 0)
      totals.set(key, (totals.get(key) ?? 0) + kWh)
    }
  }
  return totals
}

const chunks = <T,>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

/** The day after a month's last day, as the exclusive end the API expects. */
const dayAfter = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

export async function fetchElectricity(doFetch: Fetch, refreshToken: string, months: readonly Month[]): Promise<ElectricityMeter[]> {
  const accessToken = await createAccessToken(doFetch, refreshToken)
  const list = await requestJson<{ result?: MeteringPoint[] }>(doFetch, SERVICE, `${ELOVERBLIK_BASE}/meteringpoints/meteringpoints?includeAll=true`, accessToken)
  // E17 is consumption; production (E18) and other types aren't Scope 2.
  const points = (list.result ?? []).filter((mp) => !mp.typeOfMP || mp.typeOfMP === 'E17')

  const totals = new Map<string, Map<string, number>>()
  const errors = new Map<string, string>()
  for (const span of chunks(months, MONTHS_PER_REQUEST)) {
    const from = span[0].first
    const to = dayAfter(span[span.length - 1].last)
    for (const batch of chunks(points, BATCH)) {
      const body = await requestJson<{ result?: DocumentResult[] }>(
        doFetch,
        SERVICE,
        `${ELOVERBLIK_BASE}/meterdata/gettimeseries/${from}/${to}/Month`,
        accessToken,
        { method: 'POST', body: { meteringPoints: { meteringPoint: batch.map((mp) => mp.meteringPointId) } } },
      )
      for (const r of body.result ?? []) {
        if (!r.id) continue
        if (r.success === false) {
          errors.set(r.id, r.errorText ? `${r.errorText} (${r.errorCode})` : `Fejl ${r.errorCode}`)
          continue
        }
        const own = totals.get(r.id) ?? new Map<string, number>()
        for (const [key, kWh] of monthlyKWh(r)) own.set(key, (own.get(key) ?? 0) + kWh)
        totals.set(r.id, own)
      }
    }
  }

  return points.map((mp) => {
    const own = totals.get(mp.meteringPointId)
    return {
      meteringPointId: mp.meteringPointId,
      address: addressOf(mp),
      error: errors.get(mp.meteringPointId) ?? null,
      months: months.map((month) => {
        const kWh = own?.get(month.key)
        return { month, kWh: kWh === undefined ? null : Math.round(kWh * 10) / 10, missing: kWh === undefined }
      }),
    }
  })
}
