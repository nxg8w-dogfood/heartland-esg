import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { FactorDetails, FactorsPage } from './FactorsPage'

const render = () => renderToStaticMarkup(<FactorsPage base={factors} factors={factors} publications={[]} sources={{}} onChoose={() => {}} />)
const titles = (html: string) => [...html.matchAll(/<span class="fold-title">([^<]*)<\/span>/g)].map((m) => m[1])

it('folds the factors by category, each closed and drawn only when opened', () => {
  const html = render()
  expect(titles(html)).toContain('El (location-based)')
  expect(titles(html)).toContain('Elmiks pr. kommune')
  expect(titles(html)).toContain('Spendfaktor (EXIOBASE)')
  expect(html).toContain('392 faktorer')
  expect(html).not.toContain(' open=')
  expect(html).not.toContain('factor-f-s2-el-kommune-101-2025')
  expect(html).not.toContain('id="factor-f-s2-el-dk1-2025"')
})

it('folds the pending factors, the publications and the API sources too', () => {
  expect(titles(render()).slice(0, 3)).toEqual(['Afventer en kilde', 'Publikationer', 'API-kilder'])
})

it('shows how many factors in a fold await a source', () => {
  expect(render()).toMatch(/Flugtige udledninger<\/span><span class="fold-count">2 faktorer<span class="pending">1 afventer<\/span>/)
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
