import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import { scope2Line, scope2Summary, type Location, type Scope2Line } from './scope2'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }

const location = (overrides: Partial<Location> = {}): Location => ({
  id: 'hq',
  name: 'Hovedkontor',
  gridFamily: 'el-dk-location',
  marketInstrument: 'residualmiks',
  heatingFactorId: 'f-s2-fjernvarme-beis',
  ...overrides,
})

const line = (overrides: Partial<Scope2Line> = {}): Scope2Line => ({
  id: '1',
  locationId: 'hq',
  kind: 'electricity',
  date: '2025-03-01',
  kWh: 100_000,
  ...overrides,
})

/** The factor table with values entered for factors that are blank by design. */
const withValues = (values: Record<string, number>): Factor[] =>
  factors.map((f) => (f.id in values ? { ...f, value: values[f.id] } : f))

// Expected values were checked against the original app's own calculation.
describe('electricity, location-based', () => {
  it('uses the Danish grid mix for the line year', () => {
    expect(scope2Line(line(), location(), factors, year2025).locationT).toBeCloseTo(5.892, 10)
    const r2024 = scope2Line(line({ date: '2024-03-01' }), location(), factors, { start: '2024-01-01', end: '2024-12-31' })
    expect(r2024.locationT).toBeCloseTo(7.38, 10)
    expect(r2024.locationFactor?.id).toBe('f-s2-el-dk-2024')
  })

  it("falls back to the family's latest year for dates it doesn't cover", () => {
    const r = scope2Line(line({ date: '2026-02-01' }), location(), factors, { start: '2026-01-01', end: '2026-12-31' })
    expect(r.locationFactor?.id).toBe('f-s2-el-dk-2025')
  })

  it('lets a custom factor replace the location-based factor but not the market-based one', () => {
    const r = scope2Line(line({ customFactor: 0.1 }), location({ marketInstrument: 'ppa' }), factors, year2025)
    expect(r.locationT).toBeCloseTo(10, 10)
    expect(r.marketT).toBe(0)
  })
})

describe('electricity, market-based', () => {
  it('gives zero for PPA and guarantees of origin', () => {
    for (const marketInstrument of ['ppa', 'oprindelsesgaranti'] as const) {
      const r = scope2Line(line(), location({ marketInstrument }), factors, year2025)
      expect(r.marketT).toBe(0)
      expect(r.pendingMarket).toBe(false)
    }
  })

  it('is pending for residual mix until its value is entered, and never guesses it', () => {
    const r = scope2Line(line(), location(), factors, year2025)
    expect(r.marketValue).toBeNull()
    expect(r.marketT).toBe(0)
    expect(r.pendingMarket).toBe(true)
    // The location-based figure is still calculated.
    expect(r.locationT).toBeCloseTo(5.892, 10)
  })

  it('uses the residual mix once a value has been entered', () => {
    const r = scope2Line(line(), location(), withValues({ 'f-s2-el-residual': 0.35 }), year2025)
    expect(r.marketT).toBeCloseTo(35, 10)
    expect(r.pendingMarket).toBe(false)
  })

  it('is not pending when there is nothing to multiply', () => {
    expect(scope2Line(line({ kWh: 0 }), location(), factors, year2025).pendingMarket).toBe(false)
  })
})

describe('district heating', () => {
  it('uses the BEIS fallback and counts the same in both totals', () => {
    const r = scope2Line(line({ kind: 'heating', kWh: 50_000 }), location(), factors, year2025)
    expect(r.locationT).toBeCloseTo(8.7645, 10)
    expect(r.marketT).toBe(r.locationT)
  })

  it('is pending with the local supplier factor until it is entered', () => {
    const r = scope2Line(line({ kind: 'heating' }), location({ heatingFactorId: 'f-s2-fjernvarme-lokal' }), factors, year2025)
    expect(r.locationValue).toBeNull()
    expect(r.pendingMarket).toBe(true)
  })

  it('uses the local supplier factor once entered', () => {
    const r = scope2Line(
      line({ kind: 'heating', kWh: 50_000 }),
      location({ heatingFactorId: 'f-s2-fjernvarme-lokal' }),
      withValues({ 'f-s2-fjernvarme-lokal': 0.08 }),
      year2025,
    )
    expect(r.locationT).toBeCloseTo(4, 10)
  })
})

describe('invalid input', () => {
  it('flags a kWh that is not a number instead of counting it silently', () => {
    const r = scope2Line(line({ kWh: Number.NaN }), location(), factors, year2025)
    expect(r.invalid).toBe(true)
    expect(r.kWh).toBe(0)
    expect(r.warning).toBe('Mængden er ikke et gyldigt tal.')
  })

  it('flags a custom factor that is not a number', () => {
    expect(scope2Line(line({ customFactor: Number.POSITIVE_INFINITY }), location(), factors, year2025).invalid).toBe(true)
  })
})

describe('scope2Summary', () => {
  const hq = location()
  const store = location({ id: 'store', name: 'Butik', marketInstrument: 'ppa', heatingFactorId: 'f-s2-fjernvarme-lokal' })
  const lines: Scope2Line[] = [
    line({ id: 'a', locationId: 'hq', kWh: 100_000 }),
    line({ id: 'b', locationId: 'hq', kind: 'heating', kWh: 50_000 }),
    line({ id: 'c', locationId: 'store', kWh: 20_000 }),
    line({ id: 'd', locationId: 'store', kind: 'heating', kWh: 10_000 }),
    line({ id: 'e', locationId: 'hq', kWh: 999_999, date: '2023-05-01' }),
    line({ id: 'f', locationId: 'gone', kWh: 1_000 }),
  ]
  const s = scope2Summary([hq, store], lines, factors, year2025)

  it('adds up per location and across locations', () => {
    expect(s.electricityKWh).toBe(120_000)
    expect(s.heatingKWh).toBe(60_000)
    expect(s.electricityLocationT).toBeCloseTo(7.0704, 10)
    expect(s.electricityMarketT).toBe(0)
    expect(s.locationTotal).toBeCloseTo(7.0704 + 8.7645, 10)
    expect(s.marketTotal).toBeCloseTo(8.7645, 10)
    expect(s.locations.map((l) => l.location.id)).toEqual(['hq', 'store'])
  })

  it('reports the average grid factor', () => {
    expect(s.averageGridFactor).toBeCloseTo(0.05892, 10)
  })

  it('leaves out lines outside the period and lines for unknown locations', () => {
    const ids = s.locations.flatMap((l) => [...l.electricity, ...l.heating].map((r) => r.line.id))
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('flags residual mix on electricity as pending market-based', () => {
    expect(s.locations[0].pendingMarket).toBe(true)
    expect(s.locations[1].pendingMarket).toBe(false)
    expect(s.pendingMarket).toBe(true)
  })

  it('flags a heating factor without a value at location level too', () => {
    expect(s.locations[1].pendingHeating).toBe(true)
    expect(s.pendingHeating).toBe(true)
  })

  it('prorates a bill that crosses the period boundary', () => {
    // 62 days, 31 of them in 2025.
    const r = scope2Summary([hq], [line({ date: '2024-12-01', dateTo: '2025-01-31', kWh: 62_000 })], factors, year2025)
    expect(r.electricityKWh).toBeCloseTo(31_000, 10)
  })

  it('gives zeros with no locations', () => {
    expect(scope2Summary([], lines, factors, year2025)).toMatchObject({ locationTotal: 0, marketTotal: 0, electricityKWh: 0, averageGridFactor: 0, pendingMarket: false })
  })
})
