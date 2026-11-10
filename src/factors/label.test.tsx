import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { factors, type Factor } from '../data/factors'
import { scope1Line, type Scope1Line } from '../calc/scope1'
import { scope2Line, type Location, type Scope2Line } from '../calc/scope2'
import { Figure, SplitFigure } from '../scope2/Scope2Page'
import { FactorCell } from './FactorCell'
import { factorLabel } from './label'

const byId = (id: string): Factor => {
  const f = factors.find((x) => x.id === id)
  if (!f) throw new Error(`No factor ${id}`)
  return f
}

/** The text a screen reader or a reader of the page gets, one span per line. */
const text = (html: string) => html.replace(/<span[^>]*>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map((s) => s.trim()).filter(Boolean)

describe('factorLabel', () => {
  it('is the name and unit from the factor table', () => {
    expect(factorLabel(byId('f-s1-diesel'))).toBe('Diesel (average biofuel blend), kg CO2e/liter')
  })

  it('adds the region when it narrows the factor down', () => {
    expect(factorLabel(byId('f-hotel-fr'))).toBe('Hotelovernatning (Frankrig), kg CO2e/værelsesnat')
    expect(factorLabel(byId('f-s2-el-dk-2025'))).toBe('Dansk elmiks (Danmark), kg CO2e/kWh')
  })

  it('leaves out regions that say nothing', () => {
    expect(factorLabel(byId('f-s1-hfc134a'))).toBe('Kølemiddel HFC-134a (GWP), kg CO2e/kg')
    expect(factorLabel(byId('f-c-cykel'))).toBe('Cykel, kg CO2e/km')
  })

  it('is empty without a factor', () => {
    expect(factorLabel(null)).toBe('')
    expect(factorLabel(undefined)).toBe('')
  })

  it('gives every factor in the table a name', () => {
    for (const f of factors) expect(f.name.trim(), f.id).not.toBe('')
  })
})

describe('Scope 1 line factor cell', () => {
  const year2025 = { start: '2025-01-01', end: '2025-12-31' }
  const line = (overrides: Partial<Scope1Line>): Scope1Line => ({ id: '1', group: 's1-diesel', date: '2025-03-15', quantity: 2500, ...overrides })
  const cell = (l: Scope1Line) => {
    const r = scope1Line(l, factors, year2025)
    return text(renderToStaticMarkup(<FactorCell value={r.factorValue} factor={r.factor} custom={l.customFactor != null} />))
  }

  it('shows the value, the factor name and the source', () => {
    expect(cell(line({}))).toEqual(['2,57082', 'Diesel (average biofuel blend), kg CO2e/liter', 'BEIS GHG Conversion Factors 2025'])
  })

  it('names the factor that is missing a value', () => {
    expect(cell(line({ group: 's1-koel-andet', quantity: 3 }))).toEqual(['Faktor mangler', 'Andet kølemiddel, kg CO2e/kg'])
  })

  it('keeps the name when the line has its own value', () => {
    expect(cell(line({ group: 's1-koel-andet', quantity: 3, customFactor: 2088 }))).toEqual(['2.088', 'Andet kølemiddel, kg CO2e/kg', 'Egen faktor'])
  })
})

describe('Scope 2 line figures', () => {
  const year2025 = { start: '2025-01-01', end: '2025-12-31' }
  const location = (overrides: Partial<Location> = {}): Location => ({
    id: 'hq', name: 'Hovedkontor', gridFamily: 'el-dk-location', marketInstrument: 'residualmiks', heatingFactorId: 'f-s2-fjernvarme-beis', ...overrides,
  })
  const line = (overrides: Partial<Scope2Line> = {}): Scope2Line => ({ id: '1', locationId: 'hq', kind: 'electricity', date: '2025-03-01', kWh: 100_000, ...overrides })

  it('names the location-based factor', () => {
    const r = scope2Line(line(), location(), factors, year2025)
    expect(text(renderToStaticMarkup(<Figure t={r.locationT} value={r.locationValue} factor={r.locationFactor} />))).toEqual([
      '5,892', '0,05892 kg/kWh · Energistyrelsen, El-emissionsfaktorer 2024-2035', 'Dansk elmiks (Danmark), kg CO2e/kWh',
    ])
  })

  it('names the market-based factor, also while it waits for a value', () => {
    const pending = scope2Line(line(), location(), factors, year2025)
    expect(text(renderToStaticMarkup(<Figure t={pending.marketT} value={pending.marketValue} factor={pending.marketFactor} />))).toEqual([
      'Faktor mangler', 'Energinets residualmiks 2025 (Danmark), kg CO2e/kWh',
    ])
    const ppa = scope2Line(line(), location({ marketInstrument: 'ppa' }), factors, year2025)
    expect(text(renderToStaticMarkup(<Figure t={ppa.marketT} value={ppa.marketValue} factor={ppa.marketFactor} />))).toContain('PPA-dækket el (Danmark), kg CO2e/kWh')
  })

  it('names the heating factor', () => {
    const r = scope2Line(line({ kind: 'heating' }), location(), factors, year2025)
    expect(text(renderToStaticMarkup(<Figure t={r.locationT} value={r.locationValue} factor={r.locationFactor} />))).toContain('Fjernvarme (BEIS-fallback), kg CO2e/kWh')
  })

  it('names the grid mix on a bill split across two years', () => {
    const r = scope2Line(line({ date: '2024-12-01', dateTo: '2025-01-31' }), location(), factors, { start: '2024-01-01', end: '2025-12-31' })
    expect(r.locationParts.length).toBe(2)
    expect(text(renderToStaticMarkup(<SplitFigure t={r.locationT} parts={r.locationParts} />))).toContain('Dansk elmiks (Danmark), kg CO2e/kWh')
  })
})
