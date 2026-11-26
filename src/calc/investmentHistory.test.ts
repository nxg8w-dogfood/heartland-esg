import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { appRates } from './exchangeRates'
import type { PlanRow } from './groupExport'
import { applyImport, carriedFactor, findInvestments, largestEmitters, previousHolding, previousYear } from './investmentHistory'
import { investmentResult, type Investment } from './investments'

const holding = (patch: Partial<Investment>): Investment => ({
  id: 'inv-1', date: '2026-07-31', company: 'Delejet', ownershipPct: 40, accountingMethod: 'Other investments',
  climateMethod: 'Investment-specific method', dataSource: 'Koncernsystem, juli 2026', basis: 'CO2e', totalKgCO2e: 1_000_000,
  revenueDKK: null, revenueLocal: null, localCurrency: 'DKK', rateLocalToDKK: null, investmentDKK: null, factorKgPerEUR: null, factorSource: '', country: '',
  ...patch,
})
const planRow = (patch: Partial<PlanRow>): PlanRow => ({
  name: 'Delejet SE', organizationId: '401', ownershipType: 'Associated', businessArea: 'Apparel', ownershipPct: 25,
  revenueDKK: 1_000, investmentDKK: 2_000, existingId: null, complete: false, renamedFrom: null, previousId: null, status: 'new', ...patch,
})
const period = { start: '2025-08-01', end: '2026-07-31' }

describe('previousHolding', () => {
  const y24 = holding({ id: 'y24', date: '2024-07-31', organizationId: '401' })
  const y25 = holding({ id: 'y25', date: '2025-07-31', organizationId: '401', company: 'Andet navn' })
  const y26 = holding({ id: 'y26', organizationId: '401' })
  it("is the same company's latest holding before, by OrganizationID", () => {
    expect(previousHolding(y26, [y24, y26, y25])?.id).toBe('y25')
    expect(previousHolding(y24, [y24, y26, y25])).toBeNull()
  })
  it('matches on the name when a holding has no OrganizationID', () => {
    expect(previousHolding(holding({ id: 'a' }), [holding({ id: 'b', date: '2025-07-31', company: ' delejet ' })])?.id).toBe('b')
    expect(previousHolding(holding({ id: 'a', organizationId: '1' }), [holding({ id: 'b', date: '2025-07-31', organizationId: '2' })])).toBeNull()
  })
})

describe('previousYear', () => {
  it('is what the previous holding came to for its own 12 months', () => {
    const before = holding({ id: 'y25', date: '2025-07-31', totalKgCO2e: 500_000 })
    const last = previousYear(holding({}), [before, holding({})], appRates, factors)!
    expect(last.holding.id).toBe('y25')
    expect(last.result.kgCO2e).toBeCloseTo(200_000)
  })
  it('is null without one', () => {
    expect(previousYear(holding({}), [holding({})], appRates, factors)).toBeNull()
  })
})

describe('carriedFactor', () => {
  it("takes a table factor, or the holding's own value, and nothing when it had none", () => {
    expect(carriedFactor(holding({ factorId: 'f-exio-obs-dk', factorSource: 'x' }))).toEqual({ factorId: 'f-exio-obs-dk', factorKgPerEUR: null, factorSource: 'x' })
    expect(carriedFactor(holding({ factorKgPerEUR: 0.3, factorSource: 'Egen' }))).toEqual({ factorKgPerEUR: 0.3, factorSource: 'Egen' })
    expect(carriedFactor(holding({}))).toBeNull()
  })
})

describe('applyImport (ADR 0040)', () => {
  it('only renames a holding marked complete, and keeps its figures', () => {
    const done = holding({ id: 'd', organizationId: '401', complete: true, ownershipPct: 30 })
    const [after] = applyImport([done], [planRow({ existingId: 'd', complete: true, status: 'update' })], '2026-07-31', 'Koncernsystem, juli 2026')
    expect(after).toEqual({ ...done, company: 'Delejet SE' })
  })
  it('updates and renames a holding that is not complete', () => {
    const open = holding({ id: 'o', organizationId: '401' })
    const [after] = applyImport([open], [planRow({ existingId: 'o', status: 'update' })], '2026-07-31', 's')
    expect(after).toMatchObject({ company: 'Delejet SE', ownershipPct: 25, dataSource: 's' })
  })
  it("renames the company's holdings from other years too, and nothing else about them", () => {
    const old = holding({ id: 'old', date: '2025-07-31', organizationId: '401', ownershipPct: 10 })
    const out = applyImport([old], [planRow({})], '2026-07-31', 's')
    expect(out[0]).toEqual({ ...old, company: 'Delejet SE' })
  })
  it("gives a new holding the factor the company's holding used last year, over its sector's", () => {
    const old = holding({ id: 'old', date: '2025-07-31', organizationId: '401', basis: 'Investment', factorId: 'f-exio-obs-dk' })
    const out = applyImport([old], [planRow({ previousId: 'old' })], '2026-07-31', 's')
    expect(out[1]).toMatchObject({ company: 'Delejet SE', date: '2026-07-31', factorId: 'f-exio-obs-dk', organizationId: '401' })
    const fresh = applyImport([], [planRow({})], '2026-07-31', 's')
    expect(fresh[0].factorId).not.toBe('f-exio-obs-dk')
  })
  it('leaves a factor the holding already has alone', () => {
    const open = holding({ id: 'o', organizationId: '401', factorKgPerEUR: 0.5 })
    const old = holding({ id: 'old', date: '2025-07-31', organizationId: '401', factorId: 'f-exio-obs-dk' })
    const out = applyImport([old, open], [planRow({ existingId: 'o', previousId: 'old', status: 'update' })], '2026-07-31', 's')
    expect(out[1]).toMatchObject({ factorKgPerEUR: 0.5 })
    expect(out[1].factorId).toBeUndefined()
  })
})

describe('findInvestments and largestEmitters', () => {
  const results = [
    holding({ id: 'a', company: 'Alfa A/S', totalKgCO2e: 100_000, organizationId: '11' }),
    holding({ id: 'b', company: 'Beta SE', totalKgCO2e: 900_000 }),
    holding({ id: 'c', company: 'Gamma Ltd', totalKgCO2e: 400_000 }),
    holding({ id: 'z', company: 'Zero', totalKgCO2e: 0 }),
  ].map((i) => investmentResult(i, appRates, period, factors))
  const ids = (rs: { investment: Investment }[]) => rs.map((r) => r.investment.id)
  it('searches the name and OrganizationID, every word', () => {
    expect(ids(findInvestments(results, 'beta', 'list'))).toEqual(['b'])
    expect(ids(findInvestments(results, '11', 'list'))).toEqual(['a'])
    expect(ids(findInvestments(results, 'alfa se', 'list'))).toEqual([])
  })
  it('sorts by emissions either way, or by name', () => {
    expect(ids(findInvestments(results, '', 'largest'))).toEqual(['b', 'c', 'a', 'z'])
    expect(ids(findInvestments(results, '', 'smallest'))).toEqual(['z', 'a', 'c', 'b'])
    expect(ids(findInvestments(results, '', 'name'))).toEqual(['a', 'b', 'c', 'z'])
  })
  it('ranks the largest emitters, leaving out those with nothing', () => {
    expect(ids(largestEmitters(results, 2))).toEqual(['b', 'c'])
    expect(ids(largestEmitters(results, 10))).toEqual(['b', 'c', 'a'])
  })
})
