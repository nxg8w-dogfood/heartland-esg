import { describe, expect, it } from 'vitest'
import { defaultPriceIndexSeries, noDeflation } from '../../calc/spend'
import { tables } from '../../dataverse/schema'
import { emptyAccount, parseAccount, type AccountData } from '../account'
import { GROUP_VERSION, type Company, type GroupData } from '../group'
import { diff, emptyRows, fromRows, GROUP_KEY, naturalKey, toRows, type Rows } from './rows'

// A company using every part of the app, in the order fromRows returns things.
function richAccount(): AccountData {
  const base = emptyAccount()
  const loc = { id: 'loc-1', name: 'Hovedkontor', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks' as const, heatingFactorId: 'f-s2-fjernvarme-beis' as const }
  return {
    ...base,
    period: { start: '2025-01-01', end: '2025-12-31' },
    category3Params: { gridLoss: 0.07, wttRatio: 0.2419 },
    locations: [loc],
    scope1Lines: [
      { id: 's1-a', group: 's1-diesel', date: '2025-02-01', quantity: 100 },
      { id: 's1-b', group: 's1-naturgas', date: '2025-03-01', dateTo: '2025-03-31', quantity: 50, customFactor: 2.1, description: 'Kedel' },
    ],
    scope2Lines: [{ id: 's2-a', locationId: 'loc-1', kind: 'electricity', date: '2025-01-01', dateTo: '2025-12-31', kWh: 120_000, description: 'Årsforbrug' }],
    cat1Lines: [{ id: 'k1-a', group: 'k1-software', date: '2025-01-15', amount: 38_000, currency: 'EUR', factorId: 'f-exio-computer', description: 'Licenser' }],
    cat4Lines: [{ id: 'k4-a', group: 'k4-lastbil', date: '2025-04-01', quantity: 18_000 }],
    cat4SpendLines: [{ id: 'k4s-a', group: 'k4-kurer', date: '2025-05-01', amount: 12_500, currency: 'DKK' }],
    cat5Lines: [{ id: 'k5-a', group: 'k5-papir-gen', date: '2025-06-15', quantity: 3.2 }],
    cat6Lines: [{ id: 'k6-a', group: 'k6-hotel', factorId: 'f-hotel-de', date: '2025-03-12', quantity: 4 }],
    surveys: [{ id: 'sv-a', label: 'Pendling 2025', date: '2025-03-01', employees: 40, responses: 31, workWeeksPerYear: 46, modes: { 'k7-el': { respondents: 9, distanceKm: 28, officeDaysPerWeek: 3.5, factorId: 'f-c-el-dk' } } }],
    investments: [{ id: 'inv-a', date: '2025-06-30', company: 'Selskab A/S', ownershipPct: 25, accountingMethod: 'Ass.', climateMethod: 'PCAF', dataSource: 'Årsrapport', basis: 'CO2e', totalKgCO2e: 400_000, revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null, factorKgPerEUR: null, factorSource: '', country: 'Danmark' }],
    factorSources: {
      'f-s2-el-residual-2025': { kind: 'publication', publicationId: 'energinet-generel-eldeklaration-2025' },
      'f-s2-fjernvarme-lokal': { kind: 'manual', value: 0.08, source: 'HOFOR 2025', date: '2026-03-01' },
      'f-s2-el-dk-2026': { kind: 'api', providerId: 'energinet-eds', value: 0.06, fetchedAt: '2026-10-01T10:00:00Z', request: 'Declaration 2026' },
    },
    relevance: { ...base.relevance, 4: { relevant: true, reason: 'Fragt af varer' } },
    deflation: {
      ...noDeflation,
      active: true,
      seriesId: 'idx-dst-ppi',
      series: defaultPriceIndexSeries.map((s) => (s.id === 'idx-dst-ppi' ? { ...s, points: [{ year: 2020, value: 100 }, { year: 2025, value: 118.4 }] } : s)),
      factorSettings: { 'f-exio-computer': { baseYear: 2020, seriesId: null } },
    },
    ledger: {
      imports: [{ id: 'imp-a', fileName: 'kontoplan-2025.xlsx', importedAt: '2026-02-01T09:00:00.000Z', count: 2 }],
      postings: [
        { id: 'p-a', importId: 'imp-a', date: '2025-03-31', account: '6100', accountName: 'Revision', supplier: 'Deloitte', text: 'Faktura', amount: 746_040, currency: 'DKK' },
        { id: 'p-b', importId: 'imp-a', date: '2025-04-30', account: '1000', accountName: 'Bank', supplier: '', text: 'Overførsel', amount: 10_000, currency: 'DKK' },
      ],
      rules: [
        { id: 'r-a', name: 'Revision', type: 'tag', active: true, conditions: [{ id: 'c1', field: 'account', operator: 'is', value: '6100' }], factorId: 'f-exio-obs-dk', category: 1, reason: 'Rådgivning' },
        { id: 'r-b', name: 'Bank', type: 'exclude', active: false, conditions: [{ id: 'c2', field: 'account', operator: 'startsWith', value: '10' }], factorId: null, category: 1, reason: 'Ikke klimarelevant' },
      ],
      manual: { 'p-b': { postingId: 'p-b', type: 'exclude', factorId: null, category: null, reason: 'Intern' } },
    },
  }
}

const company = (id: string, name: string, account: AccountData, ownership = [{ fromYear: 2000, pct: 100 }]): Company => ({ id, name, ownership, account })
const group = (...companies: Company[]): GroupData => ({ version: GROUP_VERSION, name: 'Heartland', companies, activeCompanyId: companies[0].id, summaryPeriod: { start: '2025-01-01', end: '2025-12-31' } })
const view = (g: GroupData) => ({ activeCompanyId: g.activeCompanyId, summaryPeriod: g.summaryPeriod })

describe('rows ⇄ group', () => {
  it('round-trips a company that uses every part of the app', () => {
    const g = group(company('c-1', 'Heartland A/S', richAccount()))
    expect(fromRows(toRows(g), view(g))).toEqual(g)
  })

  it('round-trips several companies, ownership shares, an empty account and the group name', () => {
    const g = group(
      company('c-1', 'Heartland A/S', richAccount()),
      company('c-2', 'Heartland Danmark ApS', emptyAccount(), [{ fromYear: 2024, pct: 60 }, { fromYear: 2026, pct: 80 }]),
    )
    const back = fromRows(toRows(g), view(g))
    expect(back).toEqual(g)
    expect(back.name).toBe('Heartland')
  })

  it('gives accounts the app accepts, nothing dropped', () => {
    const back = fromRows(toRows(group(company('c-1', 'Heartland A/S', richAccount()))))
    const parsed = parseAccount(JSON.parse(JSON.stringify(back.companies[0].account)))
    expect(parsed).toMatchObject({ ok: true, dropped: 0 })
  })

  it('puts every row in a table from the schema, keyed so the app can find it again', () => {
    const rows = toRows(group(company('c-1', 'Heartland A/S', richAccount())))
    for (const table of Object.keys(rows)) expect(tables.map((t) => t.name), table).toContain(table)
    expect(rows.hlesg_koncern.has(GROUP_KEY)).toBe(true)
    expect(rows.hlesg_ejerandel.has(naturalKey('c-1', 2000))).toBe(true)
    expect(rows.hlesg_faktorkilde.has(naturalKey('c-1', 'f-s2-fjernvarme-lokal'))).toBe(true)
    expect(rows.hlesg_linje.get('s2-a')).toMatchObject({ hlesg_lokationid: 'loc-1', hlesg_maengde: 120_000, hlesg_energiart: 748100001, hlesg_liste: 748100002 })
    expect(rows.hlesg_postering.get('p-b')).toMatchObject({ hlesg_importid: 'imp-a', hlesg_manuelhandling: 748100002, hlesg_manuelbegrundelse: 'Intern' })
    expect(rows.hlesg_regel.get('r-b')).toMatchObject({ hlesg_raekkefoelge: 1, hlesg_aktiv: false })
  })

  it('keeps the built-in table out of Dataverse: only chosen factor sources get a row', () => {
    const a = { ...emptyAccount(), factorSources: { 'f-s1-diesel': { kind: 'builtin' as const } } }
    expect(toRows(group(company('c-1', 'X', a))).hlesg_faktorkilde.size).toBe(0)
  })

  it('orders rules by their order column and companies by name, whatever order rows arrive in', () => {
    const g = group(company('c-2', 'Zeta ApS', emptyAccount()), company('c-1', 'Alfa A/S', richAccount()))
    const rows = toRows(g)
    const reversed: Rows = Object.fromEntries(Object.entries(rows).map(([t, m]) => [t, new Map([...m].reverse())]))
    const back = fromRows(reversed)
    expect(back.companies.map((x) => x.name)).toEqual(['Alfa A/S', 'Zeta ApS'])
    expect(back.companies[0].account.ledger.rules.map((r) => r.id)).toEqual(['r-a', 'r-b'])
  })

  it('reads an empty environment as a group with no companies', () => {
    expect(fromRows(emptyRows())).toMatchObject({ name: 'Koncernen', companies: [] })
  })
})

describe('diff', () => {
  const g = () => group(company('c-1', 'Heartland A/S', richAccount()))

  it('is empty when nothing changed', () => {
    expect(diff(toRows(g()), toRows(g()))).toEqual([])
  })

  it('creates everything into an empty environment, parents before children', () => {
    const ops = diff(emptyRows(), toRows(g()))
    expect(ops.every((o) => o.kind === 'create')).toBe(true)
    const at = (table: string) => ops.findIndex((o) => o.table === table)
    expect(at('hlesg_virksomhed')).toBeLessThan(at('hlesg_lokation'))
    expect(at('hlesg_lokation')).toBeLessThan(at('hlesg_linje'))
    expect(at('hlesg_import')).toBeLessThan(at('hlesg_postering'))
  })

  it('sends only the changed columns of a changed line', () => {
    const after = g()
    after.companies[0].account.scope1Lines[0] = { ...after.companies[0].account.scope1Lines[0], quantity: 150 }
    expect(diff(toRows(g()), toRows(after))).toEqual([{ kind: 'update', table: 'hlesg_linje', key: 's1-a', changes: { hlesg_maengde: 150 } }])
  })

  it('clears a column that was emptied, and only that one', () => {
    const after = g()
    after.companies[0].account.scope1Lines[1] = { ...after.companies[0].account.scope1Lines[1], customFactor: null }
    expect(diff(toRows(g()), toRows(after))).toEqual([{ kind: 'update', table: 'hlesg_linje', key: 's1-b', changes: { hlesg_egenfaktor: null } }])
  })

  it('deletes a removed line, and children before the location they point to', () => {
    const after = g()
    after.companies[0].account.scope2Lines = []
    after.companies[0].account.locations = []
    const ops = diff(toRows(g()), toRows(after))
    expect(ops.map((o) => `${o.kind} ${o.table} ${o.key}`)).toEqual(['delete hlesg_linje s2-a', 'delete hlesg_lokation loc-1'])
  })

  it('deletes only the company when a company goes, since its records go with it', () => {
    const two = group(company('c-1', 'Heartland A/S', richAccount()), company('c-2', 'Datter ApS', richAccount2()))
    const ops = diff(toRows(two), toRows(g()))
    expect(ops).toEqual([{ kind: 'delete', table: 'hlesg_virksomhed', key: 'c-2' }])
  })

  it('deletes only the import when an import goes, since its postings go with it', () => {
    const after = g()
    after.companies[0].account.ledger = { ...after.companies[0].account.ledger, imports: [], postings: [], manual: {} }
    expect(diff(toRows(g()), toRows(after))).toEqual([{ kind: 'delete', table: 'hlesg_import', key: 'imp-a' }])
  })

  it('records a manual tag on a posting as an update of that posting', () => {
    const after = g()
    after.companies[0].account.ledger.manual['p-a'] = { postingId: 'p-a', type: 'tag', factorId: 'f-exio-obs-dk', category: 1, reason: 'Manuelt tagget' }
    expect(diff(toRows(g()), toRows(after))).toEqual([{
      kind: 'update', table: 'hlesg_postering', key: 'p-a',
      changes: { hlesg_manuelhandling: 748100001, hlesg_manuelfaktor: 'f-exio-obs-dk', hlesg_manuelkategori: 1, hlesg_manuelbegrundelse: 'Manuelt tagget' },
    }])
  })

  it('moves rules by updating only their order', () => {
    const after = g()
    after.companies[0].account.ledger.rules.reverse()
    const ops = diff(toRows(g()), toRows(after))
    expect(ops).toHaveLength(2)
    expect(ops).toEqual(expect.arrayContaining([
      { kind: 'update', table: 'hlesg_regel', key: 'r-a', changes: { hlesg_raekkefoelge: 1 } },
      { kind: 'update', table: 'hlesg_regel', key: 'r-b', changes: { hlesg_raekkefoelge: 0 } },
    ]))
  })
})

/** A second company with its own ids, so two companies don't share keys. */
function richAccount2(): AccountData {
  const a = richAccount()
  const re = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, id: `${x.id}-2` }))
  return {
    ...a,
    locations: re(a.locations),
    scope1Lines: re(a.scope1Lines),
    scope2Lines: re(a.scope2Lines).map((l) => ({ ...l, locationId: 'loc-1-2' })),
    cat1Lines: re(a.cat1Lines), cat4Lines: re(a.cat4Lines), cat4SpendLines: re(a.cat4SpendLines), cat5Lines: re(a.cat5Lines), cat6Lines: re(a.cat6Lines),
    surveys: re(a.surveys), investments: re(a.investments),
    ledger: { imports: re(a.ledger.imports), postings: re(a.ledger.postings).map((p) => ({ ...p, importId: 'imp-a-2' })), rules: re(a.ledger.rules), manual: {} },
  }
}
