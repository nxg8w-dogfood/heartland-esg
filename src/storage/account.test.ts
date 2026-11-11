import { describe, expect, it } from 'vitest'
import { ACCOUNT_VERSION, emptyAccount, parseAccount, type AccountData } from './account'

const sample = (): AccountData => {
  const a = emptyAccount()
  const loc = a.locations[0]
  return {
    ...a,
    vehicles: [{ id: 'car', plate: 'AB12345', make: 'Skoda', model: 'Octavia', fuel: 'diesel' as const, kmPerLitre: 22.7, testNorm: 'WLTP' as const, source: 'lookup' as const, fetchedAt: '2026-11-10T09:00:00.000Z' }],
    scope1Lines: [
      { id: 's1', group: 's1-diesel' as const, date: '2025-03-01', quantity: 100 },
      { id: 's1km', group: 's1-diesel' as const, date: '2025-04-01', quantity: null, vehicleId: 'car', distanceKm: 1200 },
    ],
    scope2Lines: [{ id: 'e1', locationId: loc.id, kind: 'electricity' as const, date: '2025-03-01', kWh: 1000 }],
    cat6Lines: [{ id: 'h1', group: 'k6-hotel', factorId: 'f-hotel-de', date: '2025-03-01', quantity: 2 }],
    factorSources: { 'f-s2-el-residual-2025': { kind: 'publication', publicationId: 'energinet-generel-eldeklaration-2025' } },
  }
}

describe('parseAccount', () => {
  it('round-trips an account through JSON unchanged', () => {
    const a = sample()
    const r = parseAccount(JSON.parse(JSON.stringify(a)))
    expect(r).toEqual({ ok: true, account: a, dropped: 0, notes: [] })
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
      factorSources: {
        'f-s2-el-residual-2025': { kind: 'publication', publicationId: 'energinet-generel-eldeklaration-2025' },
        'f-s1-diesel': { kind: 'publication', publicationId: 'energinet-generel-eldeklaration-2025' },
        'f-s2-fjernvarme-lokal': { kind: 'manual', value: 'x', source: '' },
        'f-nope': { kind: 'builtin' },
      },
    })
    expect(r.ok && r.account.scope1Lines.map((l) => l.id)).toEqual(['s1', 's1km'])
    expect(r.ok && r.account.scope2Lines.map((l) => l.id)).toEqual(['e1'])
    expect(r.ok && r.account.factorSources).toEqual({ 'f-s2-el-residual-2025': { kind: 'publication', publicationId: 'energinet-generel-eldeklaration-2025' } })
    expect(r.ok && r.dropped).toBe(7)
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

describe('migrating version 1', () => {
  it('turns entered values into manual source choices and explains the residual-mix change', () => {
    const v1 = { ...emptyAccount(), version: 1, factorSources: undefined, enteredFactors: { 'f-s2-el-residual': 0.35, 'f-s2-fjernvarme-lokal': 0.08, 'f-s1-diesel': 9 } }
    const r = parseAccount(JSON.parse(JSON.stringify(v1)))
    expect(r.ok && r.account.version).toBe(ACCOUNT_VERSION)
    expect(r.ok && r.account.factorSources).toEqual({
      'f-s2-el-residual': { kind: 'manual', value: 0.35, source: 'Indtastet (fra en tidligere version)', date: '' },
      'f-s2-fjernvarme-lokal': { kind: 'manual', value: 0.08, source: 'Indtastet (fra en tidligere version)', date: '' },
    })
    expect(r.ok && r.dropped).toBe(1)
    expect(r.ok && r.notes[0]).toContain('til og med 2024')
  })

  it('keeps cars, and drops ones it can’t use', () => {
    const a = sample()
    const r = parseAccount({
      ...a,
      vehicles: [...a.vehicles, { id: 'ev', plate: 'JK56789', make: 'Tesla', fuel: 'el', kmPerLitre: null, source: 'lookup' }, { id: 'neg', plate: 'X1', make: 'Y', fuel: 'benzin', kmPerLitre: -3, source: 'manual' }],
    })
    expect(r.ok && r.account.vehicles.map((v) => v.id)).toEqual(['car'])
    expect(r.ok && r.dropped).toBe(2)
  })

  it('drops a line in km whose car is gone, and unlinks a line in litres', () => {
    const a = sample()
    const r = parseAccount({ ...a, vehicles: [], scope1Lines: [...a.scope1Lines, { id: 's1l', group: 's1-diesel', date: '2025-05-01', quantity: 40, vehicleId: 'car' }] })
    expect(r.ok && r.account.scope1Lines.map((l) => [l.id, l.vehicleId ?? null])).toEqual([['s1', null], ['s1l', null]])
    expect(r.ok && r.dropped).toBe(1)
  })

  it('loads accounts saved before cars existed', () => {
    const old: Partial<AccountData> = { ...sample() }
    delete old.vehicles
    old.scope1Lines = old.scope1Lines!.filter((l) => l.distanceKm == null)
    const r = parseAccount(JSON.parse(JSON.stringify(old)))
    expect(r.ok && r.account.vehicles).toEqual([])
    expect(r.ok && r.dropped).toBe(0)
  })
})
