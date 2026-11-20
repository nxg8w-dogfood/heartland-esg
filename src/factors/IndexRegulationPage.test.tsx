import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { noDeflation } from '../calc/spend'
import { IndexRegulationPage } from './IndexRegulationPage'

const render = (active: boolean) =>
  renderToStaticMarkup(<IndexRegulationPage deflation={{ ...noDeflation, active }} setDeflation={() => {}} factors={factors} />)

it('shows only the on/off switch while index regulation is off', () => {
  const html = render(false)
  expect(html).toContain('Indeksreguler spendfaktorer')
  expect(html).not.toContain('Indeksserie')
})

it('folds the index values and the base year of every spend factor when on', () => {
  const html = render(true)
  expect(html).toContain('<h2')
  expect(html).toMatch(/Indeksværdier<\/span><span class="fold-count">\d+ år, 2001–\d{4}<\/span>/)
  const spend = factors.filter((f) => f.method === 'spend').length
  expect(html).toContain(`${spend} faktorer`)
  expect(html).toContain('Basisår for Other business services, Tyskland')
  expect(html).toContain('value="2021"')
})
