import { describe, expect, it } from 'vitest'
import { fetchElectricity, monthlyKWh } from './eloverblik'
import type { Fetch } from './http'
import { dedupeReadings, monthlyFromReadings, readingAt } from './meterReadings'
import { completedMonths, copenhagenMidnight, month } from './months'
import { planImport } from './toLines'
import { fetchHeating } from './varmeoverblik'

const iso = (ms: number) => new Date(ms).toISOString()
const HOUR = 3_600_000

describe('months in Danish local time', () => {
  it('starts summer months at 22:00Z and winter months at 23:00Z', () => {
    expect(iso(copenhagenMidnight('2026-10-01'))).toBe('2026-09-30T22:00:00.000Z')
    expect(iso(copenhagenMidnight('2026-11-01'))).toBe('2026-10-31T23:00:00.000Z')
    expect(iso(copenhagenMidnight('2026-01-01'))).toBe('2025-12-31T23:00:00.000Z')
  })

  it('gives October its 745-hour length across the change to winter time', () => {
    const october = month(2026, 9)
    expect(october).toMatchObject({ key: '2026-10', first: '2026-10-01', last: '2026-10-31' })
    expect((october.endMs - october.startMs) / HOUR).toBe(745)
  })

  it('handles February in a leap year', () => {
    expect(month(2028, 1).last).toBe('2028-02-29')
  })

  it('lists only months that have ended', () => {
    const now = Date.parse('2026-11-10T10:00:00Z')
    const keys = completedMonths({ start: '2026-01-01', end: '2026-12-31' }, now).map((m) => m.key)
    expect(keys).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('spans a period across a year end', () => {
    const keys = completedMonths({ start: '2025-11-15', end: '2026-02-01' }, Date.parse('2027-01-01')).map((m) => m.key)
    expect(keys).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('meter readings', () => {
  it('drops repeated timestamps and float noise', () => {
    const t = Date.parse('2026-10-01T00:00:00Z')
    expect(dedupeReadings([{ ms: t + HOUR, value: 344.5011 }, { ms: t, value: 344.48990000000003 }, { ms: t, value: 344.48990000000003 }])).toEqual([
      { ms: t, value: 344.4899 },
      { ms: t + HOUR, value: 344.5011 },
    ])
  })

  it('uses an exact reading, or interpolates and marks it estimated', () => {
    const t = 0
    const rs = [{ ms: t, value: 10 }, { ms: t + 4 * HOUR, value: 14 }]
    expect(readingAt(rs, t)).toEqual({ value: 10, estimated: false })
    expect(readingAt(rs, t + HOUR)).toEqual({ value: 11, estimated: true })
    expect(readingAt(rs, t + 5 * HOUR)).toBeNull()
  })

  it('computes a month as the difference between its boundary readings', () => {
    const oct = month(2026, 9)
    const [result] = monthlyFromReadings(
      [{ ms: oct.startMs, value: 344.4899 }, { ms: oct.endMs, value: 352.1234 }],
      [oct],
    )
    expect(result).toMatchObject({ quantity: 7.6335, estimated: false, negative: false, missing: false })
  })

  it('flags a meter that went backwards, and a boundary without readings', () => {
    const oct = month(2026, 9)
    const nov = month(2026, 10)
    const [o, n] = monthlyFromReadings([{ ms: oct.startMs, value: 500 }, { ms: oct.endMs, value: 2 }], [oct, nov])
    expect(o).toMatchObject({ quantity: -498, negative: true })
    expect(n).toMatchObject({ quantity: null, missing: true })
  })
})

/** A fake fetch that answers by URL and records what was called. */
function fakeFetch(answer: (url: string, init?: RequestInit) => { status?: number; body?: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = []
  const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const { status = 200, body } = answer(url, init)
    return new Response(JSON.stringify(body ?? {}), { status })
  }) as Fetch
  return { doFetch, calls }
}

describe('Varmeoverblik', () => {
  const oct = month(2026, 9)
  const point = (id: string | null, unit = 'mwh') => ({
    id,
    type: 'forbrug',
    meters: id ? [{ id: 'm', registers: [{ id: 'r', type: 'energi', unit }, { id: 'r2', type: 'volumen', unit: 'm3' }] }] : [],
    installationPlace: id ? { address: { darId: 'dar-1', name: 'Eksempelvej 1, 8000 Aarhus C' } } : { address: null },
    utilityCompanyName: id ? 'Kredsløb' : 'SILKEBORG VARME A/S',
  })

  it('turns hourly cumulative MWh into monthly kWh and skips points without data', async () => {
    const { doFetch, calls } = fakeFetch((url) => {
      if (url.endsWith('/access-token/create')) return { body: { timeExpires: '2026-11-11T10:00:00Z', token: 'access' } }
      if (url.endsWith('/api/installation-points/')) return { body: [point('ip-1'), point(null)] }
      const from = Date.parse(new URL(url).searchParams.get('from')!)
      const at = from + 2 * HOUR
      const value = at === oct.startMs ? 344.4899 : 352.1234
      // Every reading twice, as the real API does.
      return { body: { content: [{ timestamp: iso(at), value }, { timestamp: iso(at), value }], page: { number: 0, size: 100, totalPages: 1, totalElements: 2 } } }
    })
    const result = await fetchHeating(doFetch, 'refresh', [oct])
    expect(result.withoutData).toEqual(['SILKEBORG VARME A/S'])
    expect(result.meters).toHaveLength(1)
    expect(result.meters[0]).toMatchObject({ installationPointId: 'ip-1', darId: 'dar-1', utility: 'Kredsløb' })
    expect(result.meters[0].months[0]).toMatchObject({ kWh: 7633.5, estimated: false })
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer refresh' })
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer access' })
  })

  it('reads every page', async () => {
    let pages = 0
    const { doFetch } = fakeFetch((url) => {
      if (url.endsWith('/access-token/create')) return { body: { token: 'a' } }
      if (url.endsWith('/api/installation-points/')) return { body: [point('ip-1')] }
      const page = Number(new URL(url).searchParams.get('page'))
      pages++
      const from = Date.parse(new URL(url).searchParams.get('from')!) + 2 * HOUR
      return { body: { content: [{ timestamp: iso(from), value: from === oct.startMs ? 1 : 2 }], page: { number: page, totalPages: 2 } } }
    })
    await fetchHeating(doFetch, 'r', [oct])
    expect(pages).toBe(4) // two boundaries × two pages
  })

  it('refuses an energy unit it does not know', async () => {
    const { doFetch } = fakeFetch((url) => {
      if (url.endsWith('/access-token/create')) return { body: { token: 'a' } }
      return { body: [point('ip-1', 'gj')] }
    })
    await expect(fetchHeating(doFetch, 'r', [oct])).rejects.toThrow('ukendt enhed "gj"')
  })

  it('explains an expired token and rate limiting', async () => {
    await expect(fetchHeating(fakeFetch(() => ({ status: 401 })).doFetch, 'r', [oct])).rejects.toThrow('afviste tokenet')
    await expect(fetchHeating(fakeFetch(() => ({ status: 429 })).doFetch, 'r', [oct])).rejects.toThrow('Vent et minut')
  })

  it('explains a blocked connection', async () => {
    const blocked = (async () => {
      throw new TypeError('Failed to fetch')
    }) as Fetch
    await expect(fetchHeating(blocked, 'r', [oct])).rejects.toThrow('connect-src')
  })
})

describe('Eloverblik', () => {
  const sep = month(2026, 8)
  const oct = month(2026, 9)
  const doc = (id: string, months: [string, string][], unit = 'KWH') => ({
    success: true,
    id,
    MyEnergyData_MarketDocument: {
      TimeSeries: [
        {
          'measurement_Unit.name': unit,
          Period: months.map(([start, q]) => ({ timeInterval: { start, end: start }, Point: [{ position: '1', 'out_Quantity.quantity': q, 'out_Quantity.quality': 'A04' }] })),
        },
      ],
    },
  })

  it('maps each period to its local month', () => {
    const totals = monthlyKWh(doc('571', [['2026-08-31T22:00:00Z', '1200.5'], ['2026-09-30T22:00:00Z', '1300']]))
    expect([...totals]).toEqual([['2026-09', 1200.5], ['2026-10', 1300]])
  })

  it('converts MWh and refuses unknown units', () => {
    expect(monthlyKWh(doc('571', [['2026-09-30T22:00:00Z', '1.5']], 'MWH')).get('2026-10')).toBe(1500)
    expect(() => monthlyKWh(doc('571', [['2026-09-30T22:00:00Z', '1']], 'GJ'))).toThrow('ukendt enhed')
  })

  it('fetches consumption points only, in batches, and reports per-point errors', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `5713131000000000${String(i).padStart(2, '0')}`)
    const { doFetch, calls } = fakeFetch((url, init) => {
      if (url.endsWith('/token')) return { body: { result: 'access' } }
      if (url.includes('/meteringpoints/meteringpoints')) {
        return { body: { result: [...ids.map((id) => ({ meteringPointId: id, typeOfMP: 'E17', streetName: 'Eksempelvej', buildingNumber: '1', postcode: '8000', cityName: 'Aarhus C' })), { meteringPointId: 'prod', typeOfMP: 'E18' }] } }
      }
      const requested: string[] = JSON.parse(String(init?.body)).meteringPoints.meteringPoint
      return {
        body: {
          result: requested.map((id) =>
            id === ids[11] ? { success: false, id, errorCode: 30015, errorText: 'NoDataAvailable' } : doc(id, [['2026-08-31T22:00:00Z', '100'], ['2026-09-30T22:00:00Z', '110']]),
          ),
        },
      }
    })
    const meters = await fetchElectricity(doFetch, 'refresh', [sep, oct])
    expect(meters).toHaveLength(12)
    expect(meters[0]).toMatchObject({ address: 'Eksempelvej 1, 8000 Aarhus C', error: null })
    expect(meters[0].months.map((m) => m.kWh)).toEqual([100, 110])
    expect(meters[11]).toMatchObject({ error: 'NoDataAvailable (30015)' })
    const series = calls.filter((c) => c.url.includes('gettimeseries'))
    expect(series).toHaveLength(2) // 10 + 2
    expect(series[0].url).toMatch(/gettimeseries\/2026-09-01\/2026-11-01\/Month$/)
  })
})

describe('planning the import', () => {
  const oct = month(2026, 9)
  const nov = month(2026, 10)
  const dec = month(2026, 11)

  it('makes one line per month, and skips duplicates, gaps and negative months', () => {
    const existing = [{ id: 'x', locationId: 'loc', kind: 'heating' as const, date: '2026-10-01', dateTo: '2026-10-31', kWh: 1, description: 'Varmeoverblik · Eksempelvej 1' }]
    const plan = planImport(existing, 'loc', 'heating', 'Varmeoverblik · Eksempelvej 1', [
      { month: oct, kWh: 7633.5, missing: false },
      { month: nov, kWh: 8000, estimated: true, missing: false },
      { month: dec, kWh: null, missing: true },
    ])
    expect(plan.duplicates).toBe(1)
    expect(plan.lines).toEqual([
      { locationId: 'loc', kind: 'heating', date: '2026-11-01', dateTo: '2026-11-30', kWh: 8000, description: 'Varmeoverblik · Eksempelvej 1 (anslået: interpoleret måling)' },
    ])
    expect(plan.skipped).toEqual([{ month: 'december 2026', reason: 'mangler måling' }])
  })

  it('does not count a line of another kind or location as a duplicate', () => {
    const existing = [{ id: 'x', locationId: 'loc', kind: 'electricity' as const, date: '2026-10-01', dateTo: '2026-10-31', kWh: 1 }]
    const plan = planImport(existing, 'loc', 'heating', 's', [{ month: oct, kWh: 1, missing: false }])
    expect(plan.lines).toHaveLength(1)
    expect(plan.overlaps).toEqual([])
  })

  it('imports a second meter at the same location, and an estimated month is still recognised next time', () => {
    const first = planImport([], 'loc', 'electricity', 'Eloverblik · A', [{ month: oct, kWh: 5, estimated: true, missing: false }])
    const again = planImport(first.lines, 'loc', 'electricity', 'Eloverblik · A', [{ month: oct, kWh: 5, missing: false }])
    expect(again).toMatchObject({ duplicates: 1, lines: [] })
    const other = planImport(first.lines, 'loc', 'electricity', 'Eloverblik · B', [{ month: oct, kWh: 7, missing: false }])
    expect(other.lines).toHaveLength(1)
    // Several meters at one location is normal, not double counting.
    expect(other.overlaps).toEqual([])
  })

  it('warns when a hand-typed yearly bill covers the month', () => {
    const existing = [{ id: 'x', locationId: 'loc', kind: 'heating' as const, date: '2026-01-01', dateTo: '2026-12-31', kWh: 96000, description: 'Årsopgørelse' }]
    expect(planImport(existing, 'loc', 'heating', 's', [{ month: oct, kWh: 1, missing: false }]).overlaps).toEqual(['oktober 2026'])
  })
})
