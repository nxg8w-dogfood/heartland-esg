import { describe, expect, it } from 'vitest'
import type { Fetch } from '../utility/http'
import { lastCompletedMonths, secretName, syncAll, type DataverseApi, type Json, type SyncDeps } from './utilitySync'

const NOW = Date.parse('2026-11-16T01:00:00Z')
const COMPANY = '11111111-1111-1111-1111-111111111111'
const TEAM = '22222222-2222-2222-2222-222222222222'
const months = lastCompletedMonths(13, NOW)
const EL = 748100001
const SCOPE2 = 748100002

/** 100 kWh in each requested month, as Eloverblik answers gettimeseries/{from}/{to}/Month */
const doc = (id: string, from: string, to: string) => ({
  success: true,
  id,
  MyEnergyData_MarketDocument: {
    TimeSeries: [{
      'measurement_Unit.name': 'KWH',
      Period: months.filter((m) => m.first >= from && m.first < to).map((m) => ({ timeInterval: { start: new Date(m.startMs).toISOString() }, Point: [{ 'out_Quantity.quantity': '100' }] })),
    }],
  },
})

function eloverblik(status = 200): Fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (status !== 200) return new Response('{}', { status })
    if (url.endsWith('/token')) return Response.json({ result: 'access' })
    if (url.includes('/meteringpoints/meteringpoints')) {
      return Response.json({ result: ['571000000000000001', '571000000000000002'].map((id) => ({ meteringPointId: id, typeOfMP: 'E17', streetName: 'Eksempelvej', buildingNumber: '1', postcode: '8000', cityName: 'Aarhus C', municipalityCode: '0751' })) })
    }
    const ids: string[] = JSON.parse(String(init?.body)).meteringPoints.meteringPoint
    const [, from, to] = url.match(/gettimeseries\/([\d-]+)\/([\d-]+)\/Month$/)!
    return Response.json({ result: ids.map((id) => doc(id, from, to)) })
  }) as Fetch
}

/** Dataverse with one company, one known meter at a location, and one month of it already imported */
function fakeDataverse() {
  const created: { set: string; record: Json }[] = []
  const updated: { set: string; id: string; changes: Json }[] = []
  const api: DataverseApi = {
    async list(path) {
      if (path.startsWith('hlesg_virksomheds')) {
        return [{ hlesg_virksomhedid: COMPANY, hlesg_navn: 'Eksempel A/S', _ownerid_value: TEAM, '_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'team' }]
      }
      if (path.startsWith('hlesg_maalers')) {
        return [{ hlesg_maalerid: 'mtr-1', hlesg_kilde: 748100001, hlesg_maalernummer: '571000000000000001', hlesg_adresse: 'Eksempelvej 1, 8000 Aarhus C', hlesg_kommunekode: '751', _hlesg_lokationid_value: 'loc-1' }]
      }
      if (path.startsWith('hlesg_linjes')) {
        expect(path).toContain(`hlesg_liste eq ${SCOPE2}`)
        return [{ hlesg_dato: '2026-09-01', hlesg_tildato: '2026-09-30', hlesg_beskrivelse: 'Eloverblik · 571000000000000001 · Eksempelvej 1, 8000 Aarhus C', hlesg_energiart: EL, _hlesg_lokationid_value: 'loc-1' }]
      }
      throw new Error(`Unexpected ${path}`)
    },
    async create(set, record) { created.push({ set, record }) },
    async update(set, id, changes) { updated.push({ set, id, changes }) },
  }
  return { api, created, updated }
}

function deps(dataverse: DataverseApi, fetch: Fetch, secrets: Record<string, string>): SyncDeps {
  let n = 0
  return { dataverse, fetch, secret: async (name) => secrets[name] ?? null, now: () => NOW, newId: () => `new-${++n}`, log: () => {} }
}

describe('the nightly utility sync', () => {
  it('fetches the last 13 months that have ended, in local time', () => {
    expect(months.map((m) => m.key)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    // Just after local midnight on 1 November, October has ended.
    expect(lastCompletedMonths(1, Date.parse('2026-10-31T23:30:00Z')).map((m) => m.key)).toEqual(['2026-10'])
  })

  it('imports new months for a meter with a location, owned by the company, and records a new meter without importing it', async () => {
    const dv = fakeDataverse()
    const { results, failures } = await syncAll(deps(dv.api, eloverblik(), { [secretName('eloverblik', COMPANY)]: 'refresh' }))
    expect(failures).toEqual([])
    expect(results).toEqual([{ company: 'Eksempel A/S', meters: 2, newMeters: 1, lines: 12, waiting: 1, problems: [] }])

    const lines = dv.created.filter((c) => c.set === 'hlesg_linjes').map((c) => c.record)
    expect(lines).toHaveLength(12) // September was already there
    expect(lines.map((l) => l.hlesg_dato)).not.toContain('2026-09-01')
    expect(lines[0]).toMatchObject({
      hlesg_liste: SCOPE2, hlesg_dato: '2025-10-01', hlesg_tildato: '2025-10-31', hlesg_maengde: 100, hlesg_energiart: EL,
      hlesg_beskrivelse: 'Eloverblik · 571000000000000001 · Eksempelvej 1, 8000 Aarhus C',
      'hlesg_Lokationid@odata.bind': '/hlesg_lokations(loc-1)',
      'hlesg_Virksomhedid@odata.bind': `/hlesg_virksomheds(${COMPANY})`,
      'ownerid@odata.bind': `/teams(${TEAM})`,
    })

    const meters = dv.created.filter((c) => c.set === 'hlesg_maalers').map((c) => c.record)
    expect(meters).toEqual([expect.objectContaining({ hlesg_maalernummer: '571000000000000002', hlesg_kommunekode: '751', hlesg_kilde: 748100001, 'ownerid@odata.bind': `/teams(${TEAM})` })])
    expect(dv.updated).toEqual([{ set: 'hlesg_maalers', id: 'mtr-1', changes: { hlesg_sidsthentet: '2026-11-16T01:00:00.000Z', hlesg_fejl: null } }])
  })

  it('imports nothing twice when run again', async () => {
    const dv = fakeDataverse()
    const d = deps(dv.api, eloverblik(), { [secretName('eloverblik', COMPANY)]: 'refresh' })
    await syncAll(d)
    const first = dv.created.filter((c) => c.set === 'hlesg_linjes').map((c) => c.record)
    // The second run sees the first run's lines, as Dataverse would return them.
    const list = dv.api.list
    dv.api.list = async (path) => {
      const rows = await list(path)
      if (!path.startsWith('hlesg_linjes')) return rows
      return [...rows, ...first.map((l) => ({ ...l, _hlesg_lokationid_value: 'loc-1' }))]
    }
    dv.created.length = 0
    const { results } = await syncAll(d)
    expect(results[0].lines).toBe(0)
  })

  it('reports a rejected token on the meters it knows, and imports nothing', async () => {
    const dv = fakeDataverse()
    const { results } = await syncAll(deps(dv.api, eloverblik(401), { [secretName('eloverblik', COMPANY)]: 'expired' }))
    expect(results[0].problems[0]).toMatch(/Eloverblik/)
    expect(dv.created).toEqual([])
    expect(dv.updated).toEqual([{ set: 'hlesg_maalers', id: 'mtr-1', changes: { hlesg_fejl: results[0].problems[0] } }])
  })

  it('skips a company without tokens', async () => {
    const dv = fakeDataverse()
    const { results } = await syncAll(deps(dv.api, eloverblik(), {}))
    expect(results).toEqual([])
    expect(dv.created).toEqual([])
  })
})
