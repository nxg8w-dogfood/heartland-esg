import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Factor } from '../data/factors'
import { fitsAmount } from '../calc/factorSearch'
import { FactorSearchList, FactorSearchSelect } from './FactorSearch'

const factor = (id: string, name: string, region: string, unit: string, value: number | null, o: Partial<Factor> = {}): Factor => ({
  id, scope: 'Scope 3', category: 'x', name, region, unit, value, source: 'EXIOBASE', reference: '', ...o,
})
const factors = [
  factor('obs-dk', 'Other business services', 'Danmark', 'kg CO2e/EUR', 0.1272, { method: 'spend', priceYear: 2021 }),
  factor('obs-se', 'Other business services', 'Sverige', 'kg CO2e/EUR', 0.0768, { method: 'spend', priceYear: 2021 }),
  factor('diesel', 'Diesel', 'UK/generisk', 'kg CO2e/liter', 2.57, { scope: 'Scope 1', source: 'BEIS GHG Conversion Factors 2025' }),
  factor('rent', 'Husleje', 'UK/generisk', 'kg CO2e/GBP', null, { source: 'BEIS 2022' }),
]
const list = () => renderToStaticMarkup(<FactorSearchList factors={factors} fits={fitsAmount} misfit="Ikke pr. beløb" selectedId="obs-se" onPick={() => {}} />)

describe('FactorSearchList', () => {
  it('lists every factor with source, name, value, unit and year', () => {
    const html = list()
    expect(html).toContain('<th scope="col">Kilde</th><th scope="col">Navn</th><th scope="col" class="num">Faktor</th><th scope="col">Enhed</th><th scope="col">Faktorår</th>')
    expect(html).toContain('<td>EXIOBASE</td><th scope="row">Other business services (Danmark)</th><td class="num">0,1272</td><td>kg CO2e/EUR</td><td>2021</td>')
    expect(html).toContain('<th scope="row">Husleje</th><td class="num"><span class="pending">Mangler</span></td><td>kg CO2e/GBP</td><td>2022</td>')
  })

  it('lets only factors that fit be chosen, listing the others after them', () => {
    const html = list()
    expect(html).toContain('3 faktorer kan bruges her. 1 i andre enheder passer på søgningen, men kan ikke vælges.')
    expect(html).toContain('<tr class="muted"><td>BEIS GHG Conversion Factors 2025</td><th scope="row">Diesel</th>')
    expect(html).toContain('<span class="sub">Ikke pr. beløb</span>')
    expect(html.indexOf('Diesel')).toBeGreaterThan(html.indexOf('Husleje'))
  })

  it('marks the chosen factor', () => {
    expect(list()).toContain('aria-current="true">Valgt<span class="visually-hidden"> Other business services (Sverige), EXIOBASE</span>')
  })

  it('offers every country to narrow by', () => {
    expect(list()).toContain('<option value="" selected="">Alle lande og områder</option><option value="Danmark">Danmark</option><option value="Sverige">Sverige</option><option value="UK/generisk">UK/generisk</option>')
  })
})

describe('FactorSearchSelect', () => {
  const select = (value: string, o: { keptLabel?: string } = {}) =>
    renderToStaticMarkup(<FactorSearchSelect id="f" label="Faktor" factors={factors} fits={fitsAmount} misfit="x" value={value} emptyLabel="Vælg faktor" onChange={() => {}} {...o} />)

  it('names the chosen factor with value and unit, closed until clicked', () => {
    expect(select('obs-dk')).toContain('<label id="f-label" for="f">Faktor</label><button type="button" id="f" class="factor-search-button" aria-labelledby="f-label f" aria-haspopup="dialog">Other business services (Danmark) · 0,1272 kg CO2e/EUR</button>')
  })

  it('says what no factor means, and keeps one that is gone', () => {
    expect(select('')).toContain('>Vælg faktor</button>')
    expect(select('gone', { keptLabel: 'Gammel faktor' })).toContain('>Gammel faktor</button>')
  })
})
