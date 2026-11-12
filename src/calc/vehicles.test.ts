import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { category3, defaultCategory3Params } from './scope3'
import { scope1Summary, type Scope1Line } from './scope1'
import { scope2Summary } from './scope2'
import { formatPlate, litresFromKm, normalisePlate, resolveScope1Lines, scope1GroupFor, type Vehicle } from './vehicles'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const car = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'car-1',
  plate: 'AB12345',
  make: 'Skoda',
  model: 'Octavia',
  fuel: 'diesel',
  kmPerLitre: 20,
  source: 'lookup',
  ...overrides,
})

const line = (overrides: Partial<Scope1Line> = {}): Scope1Line => ({
  id: 'l1',
  group: 's1-diesel',
  date: '2025-03-15',
  quantity: null,
  vehicleId: 'car-1',
  distanceKm: 10_000,
  ...overrides,
})

describe('normalisePlate', () => {
  it.each([
    ['AB 12 345', 'AB12345'],
    ['ab12345', 'AB12345'],
    [' ab-12-345 ', 'AB12345'],
    ['øv 12 345', 'ØV12345'],
    ['HEST', 'HEST'],
    ['AB.12.345', 'AB12345'],
  ])('%s → %s', (input, expected) => {
    expect(normalisePlate(input)).toBe(expected)
  })

  it.each(['', 'A', 'AB123456', 'AB 12 34!', 'ÆØÅÆØÅÆØ'])('rejects %j', (input) => {
    expect(normalisePlate(input)).toBeNull()
  })
})

describe('formatPlate', () => {
  it('spaces an ordinary plate as on the car', () => expect(formatPlate('AB12345')).toBe('AB 12 345'))
  it('leaves a personal plate as it is', () => expect(formatPlate('HEST')).toBe('HEST'))
})

describe('scope1GroupFor', () => {
  it('maps each fuel to its Scope 1 group', () => {
    expect(scope1GroupFor('diesel')).toBe('s1-diesel')
    expect(scope1GroupFor('benzin')).toBe('s1-benzin')
  })
})

describe('litresFromKm', () => {
  it('divides km by km/l', () => expect(litresFromKm(10_000, 20)).toBe(500))
  it('gives 0 litres for 0 km', () => expect(litresFromKm(0, 20)).toBe(0))
  it.each([
    [null, 20],
    [10_000, null],
    [10_000, 0],
    [10_000, -5],
    [Number.NaN, 20],
    [10_000, Number.POSITIVE_INFINITY],
  ])('is null for km %s and km/l %s', (km, kml) => {
    expect(litresFromKm(km, kml)).toBeNull()
  })
})

describe('resolveScope1Lines', () => {
  it('leaves lines entered in litres unchanged, also with a car', () => {
    const l = line({ quantity: 300, distanceKm: null })
    expect(resolveScope1Lines([l], [car()])[0]).toBe(l)
  })

  it('works out litres for a line in km, and marks it as an estimate', () => {
    const [r] = resolveScope1Lines([line()], [car()])
    expect(r.quantity).toBe(500)
    expect(r.estimate).toMatchObject({ km: 10_000, kmPerLitre: 20, problem: null })
  })

  it('waits for data when the car is gone', () => {
    const [r] = resolveScope1Lines([line()], [])
    expect(r.quantity).toBeNull()
    expect(r.estimate?.problem).toMatch(/findes ikke/)
  })

  it('waits for data when the car has no fuel economy', () => {
    const [r] = resolveScope1Lines([line()], [car({ kmPerLitre: null })])
    expect(r.quantity).toBeNull()
    expect(r.estimate?.problem).toMatch(/km\/l/)
  })

  it('takes the fuel from the car, also when the car’s fuel was corrected after the line was entered', () => {
    const [km] = resolveScope1Lines([line()], [car({ fuel: 'benzin' })])
    expect(km.group).toBe('s1-benzin')
    expect(km.quantity).toBe(500)
    expect(km.estimate?.problem).toBeNull()
    const [litres] = resolveScope1Lines([line({ quantity: 300, distanceKm: null })], [car({ fuel: 'benzin' })])
    expect(litres).toMatchObject({ group: 's1-benzin', quantity: 300 })
  })

  it('keeps the fuel a line was entered with when its car is gone, and still counts a line in litres', () => {
    const l = line({ group: 's1-benzin', quantity: 300, distanceKm: null })
    expect(resolveScope1Lines([l], [])[0]).toBe(l)
    expect(resolveScope1Lines([line({ group: 's1-benzin' })], [])[0]).toMatchObject({ group: 's1-benzin', quantity: null })
  })

  it('leaves lines without a car alone', () => {
    const l = line({ group: 's1-benzin', vehicleId: null, quantity: 300, distanceKm: null })
    expect(resolveScope1Lines([l], [car()])[0]).toBe(l)
  })

  it('waits for data, under the fuel it was entered with, when the car’s fuel is one Scope 1 has no group for', () => {
    const [r] = resolveScope1Lines([line()], [car({ fuel: 'el' as never })])
    expect(r.group).toBe('s1-diesel')
    expect(r.quantity).toBeNull()
    expect(r.estimate?.problem).toMatch(/brændstof er ukendt/)
    const l = line({ quantity: 300, distanceKm: null })
    expect(resolveScope1Lines([l], [car({ fuel: 'el' as never })])[0]).toBe(l)
  })

  it('follows a change of the car’s fuel economy', () => {
    expect(resolveScope1Lines([line()], [car({ kmPerLitre: 25 })])[0].quantity).toBe(400)
  })

  it('counts only the share a plug-in hybrid drives on fuel', () => {
    const [r] = resolveScope1Lines([line()], [car({ pluginHybrid: true, fuelSharePercent: 40 })])
    expect(r.quantity).toBe(200)
    expect(r.estimate).toMatchObject({ km: 10_000, kmPerLitre: 20, fuelShare: 0.4, problem: null })
  })

  it('shows a plug-in hybrid’s electric km as kWh, outside the litres', () => {
    const [r] = resolveScope1Lines([line()], [car({ pluginHybrid: true, fuelSharePercent: 40, whPerKm: 200 })])
    expect(r.quantity).toBe(200)
    expect(r.estimate?.electricKwh).toBe(1200)
  })

  it('gives no kWh for an ordinary car, or a plug-in hybrid without Wh/km', () => {
    expect(resolveScope1Lines([line()], [car({ whPerKm: 200 })])[0].estimate?.electricKwh).toBeNull()
    expect(resolveScope1Lines([line()], [car({ pluginHybrid: true, fuelSharePercent: 40 })])[0].estimate?.electricKwh).toBeNull()
  })

  it('gives 0 litres for a plug-in hybrid that only drives on electricity', () => {
    expect(resolveScope1Lines([line()], [car({ pluginHybrid: true, fuelSharePercent: 0 })])[0].quantity).toBe(0)
  })

  it('waits for data when a plug-in hybrid has no fuel share', () => {
    const [r] = resolveScope1Lines([line()], [car({ pluginHybrid: true, fuelSharePercent: null })])
    expect(r.quantity).toBeNull()
    expect(r.estimate?.problem).toMatch(/plugin-hybrid/)
  })

  it('ignores a fuel share on an ordinary car', () => {
    expect(resolveScope1Lines([line()], [car({ fuelSharePercent: 40 })])[0].quantity).toBe(500)
  })
})

describe('Scope 1 with cars', () => {
  it('counts a car line under the car’s fuel in the summary', () => {
    const s = scope1Summary([line({ quantity: 100, distanceKm: null })], factors, year2025, [car({ fuel: 'benzin' })])
    expect(s.lines[0].group.id).toBe('s1-benzin')
  })

  it('turns km into tCO2e through litres and the diesel factor', () => {
    // 10,000 km ÷ 20 km/l = 500 l × 2.57082 kg/l ÷ 1,000 = 1.28541 t
    const s = scope1Summary([line()], factors, year2025, [car()])
    expect(s.total).toBeCloseTo(1.28541, 10)
    expect(s.mobile).toBeCloseTo(1.28541, 10)
    expect(s.estimateCount).toBe(1)
    expect(s.pendingCount).toBe(0)
  })

  it('gives the same result as entering the litres', () => {
    const byKm = scope1Summary([line()], factors, year2025, [car()]).total
    const byLitres = scope1Summary([line({ quantity: 500, distanceKm: null })], factors, year2025, [car()]).total
    expect(byKm).toBeCloseTo(byLitres, 12)
  })

  it('splits a km line across the period like any other line', () => {
    const s = scope1Summary([line({ date: '2024-07-01', dateTo: '2025-06-30' })], factors, year2025, [car()])
    expect(s.lines[0].quantityInPeriod).toBeCloseTo(500 * (181 / 365), 6)
  })

  it('shows a km line without data as pending, with the reason', () => {
    const s = scope1Summary([line()], factors, year2025, [])
    expect(s.total).toBe(0)
    expect(s.pendingCount).toBe(1)
    expect(s.lines[0].warning).toMatch(/findes ikke/)
  })

  it('counts the litres in Scope 3 category 3 (well-to-tank) too', () => {
    const resolved = resolveScope1Lines([line()], [car()])
    const scope2 = scope2Summary([], [], factors, year2025)
    const c3 = category3(resolved, scope2, factors, year2025, defaultCategory3Params(factors))
    const diesel = c3.fuels.find((f) => f.group === 's1-diesel')
    expect(diesel?.quantity).toBeCloseTo(500, 10)
    // 500 l × 0.61101 kg/l WTT ÷ 1,000
    expect(diesel?.tCO2e).toBeCloseTo(0.305505, 10)
  })
})
