import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Factor } from '../data/factors'
import { RegionFactorSelect } from './RegionFactorSelect'

const factor = (id: string, name: string, region: string, value: number | null): Factor => ({
  id, scope: 'Scope 3', category: 'Spendfaktor (EXIOBASE)', name, region, unit: 'kg CO2e/EUR', value, source: 'EXIOBASE', reference: '', method: 'spend',
})
const factors = [
  factor('bank-se', 'Bank', 'Sverige', 0.05),
  factor('retail-dk', 'Retail trade', 'Danmark', null),
  factor('bank-dk', 'Bank', 'Danmark', 0.1),
]
const render = (value: string, extra: Partial<Parameters<typeof RegionFactorSelect>[0]> = {}) => renderToStaticMarkup(
  <RegionFactorSelect id="f" label="Faktor" factors={factors} value={value} emptyLabel="Vælg faktor" onChange={() => {}} {...extra} />,
)

describe('RegionFactorSelect', () => {
  it('offers the countries first, and every factor by name with its country', () => {
    const html = render('')
    expect(html).toContain('<label for="f-region">Land/område</label>')
    expect(html).toContain('<option value="" selected="">Alle lande og områder</option><option value="Danmark">Danmark</option><option value="Sverige">Sverige</option>')
    expect(html).toContain('<option value="bank-dk">Bank, Danmark</option><option value="bank-se">Bank, Sverige</option><option value="retail-dk">Retail trade, Danmark (faktor mangler)</option>')
  })

  it("starts at the chosen factor's country and lists only its types", () => {
    const html = render('bank-se')
    expect(html).toContain('<option value="Sverige" selected="">Sverige</option>')
    expect(html).toContain('<option value="">Vælg faktor</option><option value="bank-se" selected="">Bank</option></select>')
  })

  it('shows the values when asked', () => {
    expect(render('bank-dk', { showValue: true })).toContain('<option value="bank-dk" selected="">Bank · 0,1</option><option value="retail-dk">Retail trade · værdi mangler</option>')
  })

  it('keeps a chosen factor that is no longer offered', () => {
    expect(render('gone', { keptLabel: 'Gammel faktor' })).toContain('<option value="gone" selected="">Gammel faktor</option>')
  })
})
