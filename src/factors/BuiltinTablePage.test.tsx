import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { applyFactorSources, type FactorSources } from '../calc/factorSources'
import { factorPublications } from '../data/factorPublications'
import { factors } from '../data/factors'
import { BuiltinTablePage } from './BuiltinTablePage'

const empty = factors.filter((f) => f.value === null)
const render = (sources: FactorSources = {}) =>
  renderToStaticMarkup(<BuiltinTablePage base={factors} factors={applyFactorSources(factors, sources, factorPublications)} sources={sources} onChoose={() => {}} />)

it('offers a value for each factor the built-in table has none for', () => {
  expect(empty.length).toBeGreaterThan(0)
  const html = render()
  expect(html).toContain('Faktorer uden værdi')
  for (const f of empty) expect(html).toContain(`aria-label="Værdi for ${f.name}, ${f.region}"`)
  expect(html).toContain(`${empty.length} af ${empty.length} afventer stadig en værdi`)
})

it('shows a value entered for one, with its source', () => {
  const f = empty[0]
  const html = render({ [f.id]: { kind: 'manual', value: 0.42, source: 'Leverandørens deklaration', date: '2025-03-01' } })
  expect(html).toContain('Indtastet: Leverandørens deklaration, 01.03.2025')
  expect(html).toContain(`${empty.length - 1} af ${empty.length} afventer stadig en værdi`)
})
