import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { factors } from '../data/factors'
import { noDeflation } from '../calc/spend'
import { periodYearsList } from '../calc/dates'
import { IndexRegulationPage } from './IndexRegulationPage'

const render = (active: boolean) =>
  renderToStaticMarkup(<IndexRegulationPage deflation={{ ...noDeflation, active }} setDeflation={() => {}} factors={factors} period={{ start: '2025-01-01', end: '2025-12-31' }} />)

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

it('lists each spend factor with a value regulated to the period\'s year', () => {
  const html = render(true)
  expect(html).toContain('Indeksregulerede faktorer for perioden')
  expect(html).toContain('Reguleret til 2025')
  const withValue = factors.filter((f) => f.method === 'spend' && f.value !== null).length
  expect(html).toContain(`${withValue} faktorer`)
})

it('takes every year a period touches', () => {
  expect(periodYearsList({ start: '2025-01-01', end: '2025-12-31' })).toEqual([2025])
  expect(periodYearsList({ start: '2024-07-01', end: '2025-06-30' })).toEqual([2024, 2025])
})
