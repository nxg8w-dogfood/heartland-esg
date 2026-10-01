import { describe, expect, it } from 'vitest'
import { ACCOUNT_VERSION, emptyAccount, parseAccount, type AccountData } from './account'
import { browserStore } from './store'

const sample = (): AccountData => {
  const a = emptyAccount()
  const loc = a.locations[0]
  return {
    ...a,
    scope1Lines: [{ id: 's1', group: 's1-diesel' as const, date: '2025-03-01', quantity: 100 }],
    scope2Lines: [{ id: 'e1', locationId: loc.id, kind: 'electricity' as const, date: '2025-03-01', kWh: 1000 }],
    cat6Lines: [{ id: 'h1', group: 'k6-hotel', factorId: 'f-hotel-de', date: '2025-03-01', quantity: 2 }],
    enteredFactors: { 'f-s2-el-residual': 0.35 },
  }
}

describe('parseAccount', () => {
  it('round-trips an account through JSON unchanged', () => {
    const a = sample()
    const r = parseAccount(JSON.parse(JSON.stringify(a)))
    expect(r).toEqual({ ok: true, account: a, dropped: 0 })
  })

  it('rejects anything that is not an account, and other versions', () => {
    expect(parseAccount(null)).toMatchObject({ ok: false })
    expect(parseAccount([])).toMatchObject({ ok: false })
    expect(parseAccount({ ...sample(), version: ACCOUNT_VERSION + 1 })).toMatchObject({ ok: false, error: expect.stringContaining('Ukendt version') })
  })

  it('fills in missing sections with defaults', () => {
    const r = parseAccount({ version: ACCOUNT_VERSION })
    expect(r.ok && r.account.period).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(r.ok && r.account.category3Params).toEqual({ gridLoss: 0.07, wttRatio: 0.2419 })
    expect(r.ok && r.account.scope1Lines).toEqual([])
  })

  it('drops records the app could not use, and counts them', () => {
    const a = sample()
    const r = parseAccount({
      ...a,
      scope1Lines: [...a.scope1Lines, { id: 'x', group: 'nope', date: '2025-01-01', quantity: 1 }, { group: 's1-diesel' }, 'junk'],
      scope2Lines: [...a.scope2Lines, { id: 'y', locationId: 'gone', kind: 'heating', date: '2025-01-01', kWh: 1 }],
      enteredFactors: { 'f-s2-el-residual': 0.35, 'f-s1-diesel': 9, 'f-s2-fjernvarme-lokal': 'x' },
    })
    expect(r.ok && r.account.scope1Lines.map((l) => l.id)).toEqual(['s1'])
    expect(r.ok && r.account.scope2Lines.map((l) => l.id)).toEqual(['e1'])
    expect(r.ok && r.account.enteredFactors).toEqual({ 'f-s2-el-residual': 0.35 })
    expect(r.ok && r.dropped).toBe(6)
  })

  it('drops manual ledger actions for postings that no longer exist', () => {
    const a = emptyAccount()
    const r = parseAccount({ ...a, ledger: { ...a.ledger, postings: [{ id: 'p1' }], manual: { p1: { postingId: 'p1', type: 'exclude' }, p9: { postingId: 'p9', type: 'exclude' } } } })
    expect(r.ok && Object.keys(r.account.ledger.manual)).toEqual(['p1'])
    expect(r.ok && r.dropped).toBe(1)
  })

  it('ignores an invalid period', () => {
    const r = parseAccount({ ...sample(), period: { start: 'soon', end: '2025-12-31' } })
    expect(r.ok && r.account.period).toEqual({ start: '2025-01-01', end: '2025-12-31' })
  })
})

describe('browserStore', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
  }

  it('saves, loads and clears', async () => {
    const storage = memory()
    const store = browserStore(storage)
    expect(await store.load()).toBeNull()
    const a = sample()
    await store.save(a)
    expect(await store.load()).toEqual({ ok: true, account: a, dropped: 0 })
    await store.clear()
    expect(await store.load()).toBeNull()
  })

  it('reports unreadable saved data instead of throwing', async () => {
    const storage = memory()
    storage.setItem('heartland-esg:account', '{not json')
    expect(await browserStore(storage).load()).toMatchObject({ ok: false })
  })

  it('reports blocked storage instead of throwing', async () => {
    const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => {} }
    expect(await browserStore(blocked).load()).toMatchObject({ ok: false })
    await expect(browserStore(blocked).save(sample())).rejects.toThrow()
    expect(await browserStore(null).load()).toMatchObject({ ok: false })
  })
})
