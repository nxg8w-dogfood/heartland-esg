import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { FactorDetails, FactorsPage } from './FactorsPage'

const render = () => renderToStaticMarkup(<FactorsPage base={factors} factors={factors} publications={[]} sources={{}} onChoose={() => {}} />)
const titles = (html: string) => [...html.matchAll(/<span class="fold-title">([^<]*)<\/span>/g)].map((m) => m[1])

it('lists every factor in one table, not split by scope, a page at a time', () => {
  const html = render()
  expect(html).toContain('<h2 id="_R_')
  expect(html).not.toMatch(/<h2[^>]*>Scope [123]<\/h2>/)
  expect(html).toContain(`${factors.length} faktorer. Viser de første 100.`)
  expect(html.match(/class="factor-row"/g)).toHaveLength(100)
  expect(html).toContain('>Vis 100 mere</button>')
})

it('has columns for source, name, factor, unit and factor year', () => {
  const html = render()
  expect(html).toContain('<th scope="col">Kilde</th><th scope="col">Navn</th><th scope="col" class="num">Faktor</th><th scope="col">Enhed</th><th scope="col" class="num">Faktorår</th><th scope="col">Værdien kommer fra</th>')
  // An EXIOBASE factor's year is its price year; its scope is shown with its country.
  const row = html.slice(html.indexOf('<tr id="factor-f-exio-air"'), html.indexOf('</tr>', html.indexOf('<tr id="factor-f-exio-air"')))
  expect(row).toContain('<td>Afventer indtastning — må ikke gættes</td>')
  expect(row).toContain('<span class="sub">Danmark · Scope 3</span></th><td class="num"><span class="pending">Afventer</span></td><td>kg CO2e/EUR</td><td class="num">2021</td>')
})

it('can be searched and filtered by country and unit', () => {
  const html = render()
  expect(html).toContain('role="search" aria-label="Filtrer faktorer"')
  expect(html).toMatch(/<label for="[^"]+-region">Land\/område<\/label>/)
  expect(html).toContain('<option value="kg CO2e/EUR">kg CO2e/EUR</option>')
})

it('folds the pending factors, the publications and the API sources above the table', () => {
  expect(titles(render())).toEqual(['Afventer en kilde', 'Publikationer', 'API-kilder'])
})

it('keeps notes behind a tooltip, hidden until asked for', () => {
  const html = render()
  expect(html).toContain('aria-label="Om faktortabellen"')
  expect(html).toMatch(/<span role="tooltip" id="[^"]+" class="infotip-box" hidden="">Faktortabellen fra det oprindelige klimaregnskab/)
})

it("shows a factor's built-in figures, its current value and the family's other years", () => {
  const f = factors.find((x) => x.id === 'f-s2-el-residual-2025')!
  const publication = { id: 'p', name: 'Energinet 2025', publisher: 'Energinet', published: '2026-06-01', checked: '2026-06-01', note: '', values: { [f.id]: 0.35 }, rows: { [f.id]: 'Drivhusgasser' } }
  const applied = { ...f, value: 0.35, source: 'Energinet 2025' }
  const html = renderToStaticMarkup(<FactorDetails factor={f} applied={applied} base={factors} publications={[publication]} choice={{ kind: 'publication', publicationId: 'p' }} />)
  expect(html).toContain('<dt>Indbygget værdi</dt><dd>0,34807 kg CO2e/kWh</dd>')
  expect(html).toContain('<dt>Bruges nu</dt><dd>0,35 kg CO2e/kWh, Energinet 2025')
  expect(html).toContain('Energinet 2025, Drivhusgasser')
  expect(html).toContain('Andre år')
  expect(html).toContain('<code>f-s2-el-residual-2025</code>')
})
