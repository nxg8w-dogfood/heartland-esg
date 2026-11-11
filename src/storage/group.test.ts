import { describe, expect, it } from 'vitest'
import { emptyAccount, type AccountData } from './account'
import { emptyGroup, GROUP_VERSION, newCompany, ownershipFor, parseGroup, selectedPeriod, withActiveCompany, type GroupData } from './group'
import { browserStore } from './store'

const account = (): AccountData => ({
  ...emptyAccount(),
  scope1Lines: [{ id: 's1', group: 's1-diesel', date: '2025-03-01', quantity: 100 }],
})
const group = (): GroupData => {
  const a = newCompany('Heartland A/S', account())
  const b = { ...newCompany('Datter ApS'), ownership: [{ fromYear: 2025, pct: 60 }] }
  return { version: GROUP_VERSION, name: 'Heartland', companies: [a, b], activeCompanyId: b.id, activePeriodId: b.account.periods[0].id }
}
/** A single account as version 2 saved it, with one date range instead of periods */
const accountV2 = (period = { start: '2025-01-01', end: '2025-12-31' }) => {
  const old: Partial<AccountData> & Record<string, unknown> = { ...account(), version: 2 as never, period }
  delete old.periods
  return roundTrip(old)
}
const periods = (...ps: [id: string, name: string, start: string, end: string][]) => ps.map(([id, name, start, end]) => ({ id, name, start, end }))
const roundTrip = (v: unknown) => JSON.parse(JSON.stringify(v))

describe('ownershipFor', () => {
  const c = { ...newCompany('X'), ownership: [{ fromYear: 2026, pct: 80 }, { fromYear: 2024, pct: 50 }] }
  it('uses the latest entry from that year or before, in any order', () => {
    expect(ownershipFor(c, 2024)).toBe(50)
    expect(ownershipFor(c, 2025)).toBe(50)
    expect(ownershipFor(c, 2026)).toBe(80)
    expect(ownershipFor(c, 2030)).toBe(80)
  })
  it('gives null before the first entry, never a guess', () => {
    expect(ownershipFor(c, 2023)).toBeNull()
    expect(ownershipFor({ ...c, ownership: [] }, 2025)).toBeNull()
  })
})

describe('parseGroup', () => {
  it('reads back what was saved', () => {
    const g = group()
    expect(parseGroup(roundTrip(g))).toEqual({ ok: true, group: g, dropped: 0, notes: [] })
  })

  it('turns a single account from an earlier version into the first company, with its range as a period', () => {
    const a = accountV2()
    const r = parseGroup(a)
    expect(r.ok && r.group.companies).toHaveLength(1)
    expect(r.ok && r.group.companies[0]).toMatchObject({ name: 'Virksomhed 1', ownership: [{ fromYear: 2000, pct: 100 }], account: { scope1Lines: a.scope1Lines } })
    expect(r.ok && r.group.companies[0].account.periods).toEqual([{ id: expect.any(String), name: '2025', start: '2025-01-01', end: '2025-12-31' }])
    expect(r.ok && r.group.activeCompanyId).toBe(r.ok && r.group.companies[0].id)
    expect(r.ok && r.group.activePeriodId).toBe(r.ok && r.group.companies[0].account.periods[0].id)
    expect(r.ok && r.notes.at(-1)).toContain('første virksomhed')
  })

  it('migrates a group saved before periods: each company’s range becomes its period, the summary range is dropped', () => {
    const g = roundTrip(group())
    for (const c of g.companies) { delete c.account.periods; c.account.version = 2 }
    g.companies[0].account.period = { start: '2024-07-01', end: '2025-06-30' }
    g.companies[1].account.period = { start: '2025-01-01', end: '2025-12-31' }
    delete g.activePeriodId
    g.summaryPeriod = { start: '2020-01-01', end: '2020-12-31' }
    const r = parseGroup(g)
    expect(r.ok && r.group.companies.map((c) => c.account.periods.map((p) => [p.name, p.start, p.end]))).toEqual([
      [['2024/25', '2024-07-01', '2025-06-30']],
      [['2025', '2025-01-01', '2025-12-31']],
    ])
    expect(r.ok && r.group).not.toHaveProperty('summaryPeriod')
    expect(r.ok && selectedPeriod(r.group).name).toBe('2025')
  })

  it('opens the active company at its latest period when the selected one isn’t its own', () => {
    const g = roundTrip(group())
    g.companies[1].account.periods = periods(['a', '2024', '2024-01-01', '2024-12-31'], ['b', '2025', '2025-01-01', '2025-12-31'])
    const r = parseGroup({ ...g, activePeriodId: 'not-here' })
    expect(r.ok && r.group.activePeriodId).toBe('b')
    const kept = parseGroup({ ...g, activePeriodId: 'a' })
    expect(kept.ok && kept.group.activePeriodId).toBe('a')
  })

  it('drops companies and ownership entries it cannot use, and counts them', () => {
    const g = roundTrip(group())
    g.companies.push({ id: '', name: 'Uden id', account: emptyAccount() }, { id: 'z', name: 'Ugyldig', account: { version: 99 } })
    g.companies[1].ownership.push({ fromYear: 2026, pct: 140 }, { fromYear: 'snart', pct: 10 })
    const r = parseGroup(g)
    expect(r.ok && r.group.companies.map((c) => c.name)).toEqual(['Heartland A/S', 'Datter ApS'])
    expect(r.ok && r.group.companies[1].ownership).toEqual([{ fromYear: 2025, pct: 60 }])
    expect(r.ok && r.dropped).toBe(4)
  })

  it('falls back to the first company when the active one is gone', () => {
    const g = { ...roundTrip(group()), activeCompanyId: 'gone' }
    const r = parseGroup(g)
    expect(r.ok && r.group.activeCompanyId).toBe(g.companies[0].id)
  })

  it('refuses unknown versions and groups without usable companies', () => {
    expect(parseGroup({ version: 4 })).toMatchObject({ ok: false, error: expect.stringContaining('Ukendt version') })
    expect(parseGroup({ version: GROUP_VERSION, companies: [] })).toMatchObject({ ok: false })
    expect(parseGroup(null)).toMatchObject({ ok: false })
  })
})

describe('selecting a company and period', () => {
  const twoCompanies = (): GroupData => {
    const g = group()
    g.companies[0].account.periods = periods(['a24', '2024', '2024-01-01', '2024-12-31'], ['a25', '2025', '2025-01-01', '2025-12-31'])
    g.companies[1].account.periods = periods(['b23', '2023/24', '2023-07-01', '2024-06-30'], ['b24', '2024/25', '2024-07-01', '2025-06-30'])
    return g
  }

  it('reports on the selected period, or the latest when it’s not the company’s', () => {
    const g = twoCompanies()
    expect(selectedPeriod({ ...g, activePeriodId: 'b23' }).id).toBe('b23')
    expect(selectedPeriod({ ...g, activePeriodId: 'a24' }).id).toBe('b24')
  })

  it('opens another company at its latest period', () => {
    const g = { ...twoCompanies(), activePeriodId: 'b23' }
    expect(withActiveCompany(g, g.companies[0].id)).toMatchObject({ activeCompanyId: g.companies[0].id, activePeriodId: 'a25' })
  })

  it('keeps a period with the same dates, or the same name, in the company it opens', () => {
    const g = twoCompanies()
    g.companies[1].account.periods.push({ id: 'b-cal', name: 'Kalender 2024', start: '2024-01-01', end: '2024-12-31' }, { id: 'b-x', name: '2025', start: '2025-07-01', end: '2026-06-30' })
    expect(withActiveCompany({ ...g, activeCompanyId: g.companies[0].id, activePeriodId: 'a24' }, g.companies[1].id).activePeriodId).toBe('b-cal')
    expect(withActiveCompany({ ...g, activeCompanyId: g.companies[0].id, activePeriodId: 'a25' }, g.companies[1].id).activePeriodId).toBe('b-x')
  })

  it('ignores a company that isn’t in the group', () => {
    const g = twoCompanies()
    expect(withActiveCompany(g, 'gone')).toBe(g)
  })
})

describe('browserStore', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
  }

  it('saves, loads and clears the group', async () => {
    const store = browserStore(memory())
    expect(await store.load()).toBeNull()
    const g = group()
    await store.save(g)
    expect(await store.load()).toEqual({ ok: true, group: g, dropped: 0, notes: [] })
    await store.clear!()
    expect(await store.load()).toBeNull()
  })

  it('loads a single account saved by an earlier version as a group', async () => {
    const storage = memory()
    const a = accountV2()
    storage.setItem('heartland-esg:account', JSON.stringify(a))
    const r = await browserStore(storage).load()
    expect(r?.ok && r.group.companies[0].account.scope1Lines).toEqual(a.scope1Lines)
    expect(r?.ok && r.group.companies[0].account.periods.map((p) => p.name)).toEqual(['2025'])
  })

  it('reports unreadable or blocked storage instead of throwing', async () => {
    const storage = memory()
    storage.setItem('heartland-esg:account', '{not json')
    expect(await browserStore(storage).load()).toMatchObject({ ok: false })
    const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => {} }
    expect(await browserStore(blocked).load()).toMatchObject({ ok: false })
    await expect(browserStore(blocked).save(emptyGroup())).rejects.toThrow()
    expect(await browserStore(null).load()).toMatchObject({ ok: false })
  })
})
