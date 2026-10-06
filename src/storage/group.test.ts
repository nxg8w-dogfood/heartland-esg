import { describe, expect, it } from 'vitest'
import { emptyAccount, type AccountData } from './account'
import { emptyGroup, GROUP_VERSION, newCompany, ownershipFor, parseGroup, type GroupData } from './group'
import { browserStore } from './store'

const account = (): AccountData => ({
  ...emptyAccount(),
  scope1Lines: [{ id: 's1', group: 's1-diesel', date: '2025-03-01', quantity: 100 }],
})
const group = (): GroupData => {
  const a = newCompany('Heartland A/S', account())
  const b = { ...newCompany('Datter ApS'), ownership: [{ fromYear: 2025, pct: 60 }] }
  return { version: GROUP_VERSION, name: 'Heartland', companies: [a, b], activeCompanyId: b.id, summaryPeriod: { start: '2025-01-01', end: '2025-12-31' } }
}
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

  it('turns a single account from an earlier version into the first company', () => {
    const a = account()
    const r = parseGroup(roundTrip(a))
    expect(r.ok && r.group.companies).toHaveLength(1)
    expect(r.ok && r.group.companies[0]).toMatchObject({ name: 'Virksomhed 1', ownership: [{ fromYear: 2000, pct: 100 }], account: a })
    expect(r.ok && r.group.activeCompanyId).toBe(r.ok && r.group.companies[0].id)
    expect(r.ok && r.notes.at(-1)).toContain('første virksomhed')
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
    const a = account()
    storage.setItem('heartland-esg:account', JSON.stringify(a))
    const r = await browserStore(storage).load()
    expect(r?.ok && r.group.companies[0].account).toEqual(a)
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
