import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import type { Scope1Line } from './scope1'
import { scope2Summary, type Location, type Scope2Line } from './scope2'
import { category3, category5, category5Groups, category6, category6Groups, defaultCategory3Params, scope3Categories } from './scope3'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const hq: Location = { id: 'hq', name: 'HQ', gridFamily: 'el-dk-location', marketInstrument: 'ppa', heatingFactorId: 'f-s2-fjernvarme-beis' }
const fuel = (o: Partial<Scope1Line>): Scope1Line => ({ id: '1', group: 's1-diesel', date: '2025-03-01', quantity: 1000, ...o })
const energy = (o: Partial<Scope2Line>): Scope2Line => ({ id: 'e', locationId: 'hq', kind: 'electricity', date: '2025-03-01', kWh: 100_000, ...o })
const params = defaultCategory3Params(factors)
const cat3 = (s1: Scope1Line[], s2: Scope2Line[], p = params, fs: readonly Factor[] = factors) =>
  category3(s1, scope2Summary([hq], s2, fs, year2025), fs, year2025, p)

describe('scope3Categories', () => {
  it('has the 15 GHG Protocol categories in order', () => {
    expect(scope3Categories.map((c) => c.nr)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it("keeps the original's relevance defaults", () => {
    expect(scope3Categories.filter((c) => c.relevantByDefault).map((c) => c.nr)).toEqual([1, 3, 5, 6, 7, 15])
  })
})

describe('category 3', () => {
  it('takes its parameters from the factor table', () => {
    expect(params).toEqual({ gridLoss: 0.07, wttRatio: 0.2419 })
  })

  // Expected values were checked against the original app's own calculation.
  it.each([
    ['s1-diesel', 1000, 0.61101],
    ['s1-benzin', 1000, 0.58094],
    ['s1-naturgas', 5000, 1.683],
    ['s1-gasolie', 250, 0.1566625],
  ] as const)('well-to-tank for %s: %d units give %d tCO2e', (group, quantity, expected) => {
    const r = cat3([fuel({ group, quantity })], [])
    expect(r.fuelT).toBeCloseTo(expected, 10)
    expect(r.fuels).toHaveLength(1)
  })

  it('leaves refrigerants out: they have no well-to-tank factor', () => {
    const r = cat3([fuel({ group: 's1-hfc134a', quantity: 10 })], [])
    expect(r.fuels).toEqual([])
    expect(r.fuelT).toBe(0)
  })

  it('adds up several lines per fuel and lists fuels in a fixed order', () => {
    const r = cat3([fuel({ id: 'a', group: 's1-gasolie', quantity: 100 }), fuel({ id: 'b', quantity: 400 }), fuel({ id: 'c', quantity: 600 })], [])
    expect(r.fuels.map((f) => [f.group, f.quantity])).toEqual([['s1-diesel', 1000], ['s1-gasolie', 100]])
  })

  it('counts only the part of a fuel line inside the period', () => {
    // 62 days, 31 in 2025.
    const r = cat3([fuel({ date: '2024-12-01', dateTo: '2025-01-31', quantity: 620 })], [])
    expect(r.fuels[0].quantity).toBeCloseTo(310, 10)
  })

  it('calculates electricity upstream and grid-loss emissions from the grid factor', () => {
    const r = cat3([], [energy({})])
    expect(r.gridFactor).toBeCloseTo(0.05892, 12)
    expect(r.electricityWtt).toBeCloseTo(0.05892 * 0.2419, 12)
    expect(r.electricityLossWtt).toBeCloseTo((0.05892 / 0.93 - 0.05892) * 0.2419, 12)
    expect(r.electricityT).toBeCloseTo(100 * (r.electricityWtt + r.electricityLossWtt), 10)
  })

  it('gives no grid-loss term for a loss of 100 % or more, as the original', () => {
    expect(cat3([], [energy({})], { gridLoss: 1, wttRatio: 0.2419 }).electricityLossWtt).toBe(0)
    expect(cat3([], [energy({})], { gridLoss: 1.5, wttRatio: 0.2419 }).electricityLossWtt).toBe(0)
  })

  it('gives no electricity emissions with a ratio of 0', () => {
    expect(cat3([], [energy({})], { gridLoss: 0.07, wttRatio: 0 }).electricityT).toBe(0)
  })

  it('calculates district-heating distribution losses', () => {
    const r = cat3([], [energy({ kind: 'heating', kWh: 50_000 })])
    expect(r.heatingT).toBeCloseTo(0.4725, 10)
    expect(r.heatingPending).toBe(false)
  })

  it('adds up the three parts', () => {
    const r = cat3([fuel({})], [energy({}), energy({ id: 'h', kind: 'heating', kWh: 50_000 })])
    expect(r.total).toBeCloseTo(r.fuelT + r.electricityT + r.heatingT, 12)
  })

  it('gives zero with no Scope 1 or 2 data', () => {
    expect(cat3([], [])).toMatchObject({ total: 0, fuels: [], electricityT: 0, heatingT: 0, gridFactor: 0 })
  })

  it('treats an invalid fuel quantity as 0 here; Scope 1 flags it', () => {
    expect(cat3([fuel({ quantity: Number.NaN })], []).fuelT).toBe(0)
  })
})

describe('category 6, business travel', () => {
  const trip = (group: string, quantity: number, o = {}) => ({ id: group, group, date: '2025-04-10', quantity, ...o })

  it('has the original rows, each with a factor that exists', () => {
    expect(category6Groups).toHaveLength(10)
    for (const g of category6Groups) expect(factors.some((f) => f.id === g.factorId), g.id).toBe(true)
  })

  // Expected values were checked against the original app's own calculation.
  it.each([
    ['k6-fly-kort', 1200, 0.153432],
    ['k6-fly-lang', 9000, 1.37538],
    ['k6-fly-indenrigs', 300, 0.068784],
    ['k6-tog', 2000, 0.07092],
    ['k6-bil-diesel', 500, 0.08652],
  ] as const)('%s: %d units give %d tCO2e', (group, quantity, expected) => {
    expect(category6([trip(group, quantity)], factors, year2025).total).toBeCloseTo(expected, 10)
  })

  it('splits travel and hotels', () => {
    const r = category6([trip('k6-tog', 2000), trip('k6-hotel', 3, { factorId: 'f-hotel-fr' })], factors, year2025)
    expect(r.travelT).toBeCloseTo(0.07092, 10)
    expect(r.hotelT).toBeCloseTo(0.0201, 10)
    expect(r.total).toBeCloseTo(r.travelT + r.hotelT, 12)
  })

  it('flags a hotel night left on Denmark as pending', () => {
    expect(category6([trip('k6-hotel', 2)], factors, year2025).pendingCount).toBe(1)
  })
})

describe('category 5, waste', () => {
  it('has the original 11 rows, each with a factor that exists', () => {
    expect(category5Groups).toHaveLength(11)
    for (const g of category5Groups) expect(factors.some((f) => f.id === g.factorId), g.id).toBe(true)
  })

  it('multiplies tonnes by the factor per tonne', () => {
    const r = category5([{ id: '1', group: 'k5-papir-dep', date: '2025-06-01', quantity: 2.5 }, { id: '2', group: 'k5-plast-gen', date: '2025-06-01', quantity: 1 }], factors, year2025)
    expect(r.total).toBeCloseTo((2.5 * 1164.4894 + 4.68568) / 1000, 10)
    expect(r.pendingCount).toBe(0)
  })
})
