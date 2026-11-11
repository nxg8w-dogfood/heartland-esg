import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { emptyAccount, type AccountData } from '../storage/account'
import { GROUP_VERSION, newCompany, type GroupData } from '../storage/group'
import { accountTotals } from './accountTotals'
import { groupSummary } from './groupSummary'
import { scope1Summary, type Scope1Line } from './scope1'
import { scope2Summary } from './scope2'
import { category3 } from './scope3'
import { resolveScope1Lines, type Vehicle } from './vehicles'

// The Koncern page sums each company with accountTotals. Its Scope 1 and category 3 must be the
// figures the Scope 1 and Scope 3 pages show, which resolve the lines against the cars first.

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const car = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'car-1', plate: 'AB12345', make: 'Skoda', model: 'Octavia', fuel: 'diesel', kmPerLitre: 20, source: 'lookup', ...overrides,
})

const line = (overrides: Partial<Scope1Line> = {}): Scope1Line => ({
  id: 'l1', group: 's1-diesel', date: '2025-03-15', quantity: null, vehicleId: 'car-1', distanceKm: 10_000, ...overrides,
})

const account = (scope1Lines: Scope1Line[], vehicles: Vehicle[]): AccountData => ({ ...emptyAccount(), scope1Lines, vehicles })

/** What the Scope 1 page and the Scope 3 page show for the same account */
function pages(a: AccountData) {
  const s1 = scope1Summary(a.scope1Lines, factors, year2025, a.vehicles)
  const s2 = scope2Summary(a.locations, a.scope2Lines, factors, year2025)
  const cat3 = category3(resolveScope1Lines(a.scope1Lines, a.vehicles), s2, factors, year2025, a.category3Params)
  return { s1, cat3 }
}

function koncern(a: AccountData) {
  const c = newCompany('Mor A/S', a)
  const group: GroupData = { version: GROUP_VERSION, name: 'G', companies: [c], activeCompanyId: c.id, activePeriodId: a.periods[0].id }
  return groupSummary(group, () => factors, year2025).total
}

describe('accountTotals, Scope 1 lines for a car', () => {
  it('counts a line in km with its litres from the car, like the Scope 1 page', () => {
    const a = account([line()], [car()])
    const { s1, cat3 } = pages(a)
    expect(s1.pendingCount).toBe(0)
    expect(s1.total).toBeGreaterThan(0)

    const t = accountTotals(a, factors, year2025)
    expect(t.scope1).toBeCloseTo(s1.total, 12)
    expect(t.scope3ByCategory[3]).toBeCloseTo(cat3.total, 12)
    expect(cat3.total).toBeGreaterThan(0)
    expect(t.issues.some((i) => i.includes('Scope 1'))).toBe(false)
    expect(koncern(a).scope1).toBeCloseTo(s1.total, 12)
  })

  it('equals the same line entered in litres', () => {
    const inKm = accountTotals(account([line()], [car()]), factors, year2025)
    const inLitres = accountTotals(account([line({ quantity: 500, distanceKm: null })], [car()]), factors, year2025)
    expect(inKm.scope1).toBeCloseTo(inLitres.scope1, 12)
    expect(inKm.scope3ByCategory[3]).toBeCloseTo(inLitres.scope3ByCategory[3], 12)
  })

  it('counts a plug-in hybrid’s line in km by its share on fuel, like the Scope 1 page', () => {
    const a = account([line()], [car({ pluginHybrid: true, fuelSharePercent: 40 })])
    const { s1, cat3 } = pages(a)
    const t = accountTotals(a, factors, year2025)
    expect(t.scope1).toBeCloseTo(s1.total, 12)
    expect(t.scope3ByCategory[3]).toBeCloseTo(cat3.total, 12)
  })

  it('treats lines for a car on another fuel as the Scope 1 page does', () => {
    // A petrol car with one line in litres and one in km, both entered under diesel.
    const lines = [line({ id: 'l1', quantity: 300, distanceKm: null }), line({ id: 'l2' })]
    const a = account(lines, [car({ fuel: 'benzin' })])
    const { s1, cat3 } = pages(a)
    const t = accountTotals(a, factors, year2025)
    expect(t.scope1).toBeCloseTo(s1.total, 12)
    expect(t.scope3ByCategory[3]).toBeCloseTo(cat3.total, 12)
    expect(t.issues.some((i) => i.includes('Scope 1'))).toBe(s1.pendingCount > 0)
    expect(koncern(a).scope1).toBeCloseTo(s1.total, 12)
  })

  it('reports a line in km whose car is gone as pending, like the Scope 1 page', () => {
    const a = account([line({ vehicleId: 'gone' })], [car()])
    const { s1 } = pages(a)
    expect(s1.pendingCount).toBe(1)
    const t = accountTotals(a, factors, year2025)
    expect(t.scope1).toBeCloseTo(s1.total, 12)
    expect(t.issues).toContain('1 linje i Scope 1 afventer en faktor')
  })
})
