import { describe, expect, it } from 'vitest'
import { factors } from '../data/factors'
import { factorPublications } from '../data/factorPublications'
import { municipalities, municipality } from '../data/municipalities'
import { normaliseMunicipalityCode } from '../utility/eloverblik'
import { addressKey, matchingLocation, newLocationsFor, shareMunicipalities } from '../utility/newLocations'
import { gridFamilyFor, gridFamilyOn, scope2Line, type Location } from './scope2'

const location = (overrides: Partial<Location> = {}): Location => ({
  id: 'hq',
  name: 'Hovedkontor',
  gridFamily: 'el-dk-location',
  marketInstrument: 'residualmiks',
  heatingFactorId: 'f-s2-fjernvarme-beis',
  ...overrides,
})
const year = (y: number) => ({ start: `${y}-01-01`, end: `${y}-12-31` })

describe('municipalities and price areas', () => {
  it('lists the 98 municipalities once each', () => {
    expect(municipalities).toHaveLength(98)
    expect(new Set(municipalities.map((m) => m.code)).size).toBe(98)
  })

  it('puts Zealand, Lolland-Falster and Bornholm in DK2, and Jutland, Funen and their islands in DK1', () => {
    expect(municipalities.filter((m) => m.priceArea === 'DK2')).toHaveLength(46)
    for (const [code, area] of [['101', 'DK2'], ['400', 'DK2'], ['360', 'DK2'], ['751', 'DK1'], ['461', 'DK1'], ['741', 'DK1'], ['492', 'DK1'], ['851', 'DK1']]) {
      expect(municipality(code)?.priceArea, code).toBe(area)
    }
  })

  it('reads DataHub codes with or without leading zeros', () => {
    expect(normaliseMunicipalityCode('0751')).toBe('751')
    expect(normaliseMunicipalityCode('751')).toBe('751')
    expect(normaliseMunicipalityCode('')).toBeNull()
    expect(normaliseMunicipalityCode(null)).toBeNull()
  })
})

describe('grid mix by price area', () => {
  it('has a DK1 and a DK2 factor for every year 2022–2035, in kg CO2e/kWh', () => {
    for (const area of ['dk1', 'dk2']) {
      for (let y = 2022; y <= 2035; y++) {
        const f = factors.find((x) => x.id === `f-s2-el-${area}-${y}`)
        expect(f, `${area} ${y}`).toMatchObject({ family: `el-${area}-location`, validFrom: `${y}-01-01`, validTo: `${y}-12-31`, unit: 'kg CO2e/kWh' })
        expect(f!.value).toBeGreaterThan(0.01)
        expect(f!.value).toBeLessThan(0.2)
      }
    }
  })

  it('uses Energinet actuals for 2024 and 2025', () => {
    expect(factors.find((f) => f.id === 'f-s2-el-dk1-2025')?.value).toBe(0.06801)
    expect(factors.find((f) => f.id === 'f-s2-el-dk2-2024')?.value).toBe(0.04369)
  })

  it("offers Energistyrelsen's projection per area as an alternative source", () => {
    const ens = factorPublications.find((p) => p.id === 'ens-el-emissionsfaktoren-2025-2035')!
    expect(ens.values['f-s2-el-dk1-2025']).toBe(0.0782)
    expect(ens.values['f-s2-el-dk2-2035']).toBe(0.0368)
  })

  it('follows the municipality, and falls back to the national average without one', () => {
    expect(gridFamilyFor('751')).toBe('el-dk1-location')
    expect(gridFamilyFor('101')).toBe('el-dk2-location')
    expect(gridFamilyFor(null)).toBe('el-dk-location')
    expect(gridFamilyFor('999')).toBe('el-dk-location')
  })

  it('uses the national average for a date the area series does not cover', () => {
    const aarhus = location({ municipalityCode: '751', gridFamily: 'el-dk1-location' })
    expect(gridFamilyOn(aarhus, factors, '2025-06-01')).toBe('el-dk1-location')
    expect(gridFamilyOn(aarhus, factors, '2036-06-01')).toBe('el-dk-location')
  })

  it('calculates a line in Aarhus with DK1 and one in Copenhagen with DK2', () => {
    const line = { id: 'l', locationId: 'hq', kind: 'electricity' as const, date: '2025-01-01', dateTo: '2025-12-31', kWh: 100_000 }
    const aarhus = scope2Line(line, location({ municipalityCode: '751', gridFamily: 'el-dk1-location' }), factors, year(2025))
    const cph = scope2Line(line, location({ municipalityCode: '101', gridFamily: 'el-dk2-location' }), factors, year(2025))
    const national = scope2Line(line, location(), factors, year(2025))
    expect(aarhus.locationFactor?.id).toBe('f-s2-el-dk1-2025')
    expect(aarhus.locationT).toBeCloseTo(6.801, 6)
    expect(cph.locationT).toBeCloseTo(4.324, 6)
    expect(national.locationFactor?.id).toBe('f-s2-el-dk-2025')
  })

  it('splits a bill across two years within the area series', () => {
    const line = { id: 'l', locationId: 'hq', kind: 'electricity' as const, date: '2024-12-01', dateTo: '2025-01-31', kWh: 62 }
    const r = scope2Line(line, location({ municipalityCode: '751', gridFamily: 'el-dk1-location' }), factors, { start: '2024-01-01', end: '2025-12-31' })
    expect(r.locationParts.map((p) => p.factor?.id)).toEqual(['f-s2-el-dk1-2024', 'f-s2-el-dk1-2025'])
  })
})

describe('locations from fetched meters', () => {
  let n = 0
  const base = (): Location => ({ ...location(), id: `new-${++n}` })

  it('compares addresses loosely', () => {
    expect(addressKey('Store Torv 1, 8000 Aarhus C')).toBe(addressKey('store torv 1  8000 aarhus c'))
  })

  it('gives a heating meter the municipality of an electricity meter at the same address', () => {
    const [el, heat, other] = shareMunicipalities([
      { key: 'el:1', address: 'Store Torv 1, 8000 Aarhus C', municipalityCode: '751' },
      { key: 'heat:1', address: 'Store Torv 1, 8000 Aarhus C', municipalityCode: null },
      { key: 'heat:2', address: 'Eksempelvej 2, 8000 Aarhus C', municipalityCode: null },
    ])
    expect([el.municipalityCode, heat.municipalityCode, other.municipalityCode]).toEqual(['751', '751', null])
  })

  it('makes one location per address, named after it, with its municipality and price area', () => {
    const { locations, byMeter } = newLocationsFor(
      [
        { key: 'el:1', address: 'Store Torv 1, 8000 Aarhus C', municipalityCode: null },
        { key: 'el:2', address: 'Store Torv 1, 8000 Aarhus C', municipalityCode: '751' },
        { key: 'heat:1', address: 'Bredgade 1, 1260 København K', municipalityCode: '101' },
      ],
      base,
    )
    expect(locations).toHaveLength(2)
    expect(locations[0]).toMatchObject({ name: 'Store Torv 1, 8000 Aarhus C', municipalityCode: '751', gridFamily: 'el-dk1-location' })
    expect(locations[1]).toMatchObject({ municipalityCode: '101', gridFamily: 'el-dk2-location' })
    expect(byMeter['el:1']).toBe(byMeter['el:2'])
    expect(byMeter['heat:1']).toBe(locations[1].id)
  })

  it('leaves the municipality empty, and the grid national, when no meter knows it', () => {
    const { locations } = newLocationsFor([{ key: 'heat:1', address: 'Eksempelvej 2', municipalityCode: null }], base)
    expect(locations[0]).toMatchObject({ municipalityCode: null, gridFamily: 'el-dk-location' })
  })

  it('finds an existing location named after the address', () => {
    const existing = [location({ id: 'a', name: 'Store Torv 1, 8000 Aarhus C' })]
    expect(matchingLocation(existing, 'Store Torv 1,  8000 Aarhus C')?.id).toBe('a')
    expect(matchingLocation(existing, 'Store Torv 2, 8000 Aarhus C')).toBeUndefined()
  })
})
