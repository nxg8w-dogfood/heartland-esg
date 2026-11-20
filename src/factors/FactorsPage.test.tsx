import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { FactorsPage } from './FactorsPage'

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
