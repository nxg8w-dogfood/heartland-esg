import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Location, Scope2Line } from '../calc/scope2'
import { factors } from '../data/factors'
import { defaultLocation } from './defaultLocation'
import { Scope2Page } from './Scope2Page'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const noop = () => {}
const hq: Location = { ...defaultLocation(), id: 'loc-1', name: 'Hovedkontor' }
const line: Scope2Line = { id: 'l1', locationId: 'loc-1', kind: 'electricity', date: '2025-03-01', kWh: 1000 }

const render = (lines: Scope2Line[]) =>
  renderToStaticMarkup(<Scope2Page period={year2025} factors={factors} locations={[hq]} setLocations={noop} lines={lines} setLines={noop} />)

describe('The Scope 2 Tilføj linje form', () => {
  it('sits under the locations and their lines', () => {
    const html = render([line])
    expect(html.indexOf('>Tilføj linje</h2>')).toBeGreaterThan(html.indexOf('>Lokationer</h2>'))
  })

  it('is collapsed behind its toggle once there are lines', () => {
    const html = render([line])
    expect(html).toMatch(/<button type="button" class="link" aria-expanded="false" aria-controls="[^"]*-form">Vis formular/)
    expect(html).toMatch(/<form id="[^"]*-form" class="add-line" noValidate="" hidden="">/)
  })

  it('is open from the start when there are no lines yet', () => {
    const html = render([])
    expect(html).toMatch(/aria-controls="[^"]*-form">Skjul formular/)
    expect(html).not.toMatch(/<form id="[^"]*-form"[^>]*hidden/)
  })
})

describe('Scope 2 without lines', () => {
  it('offers no example lines', () => {
    expect(render([])).not.toContain('Indsæt eksempellinjer')
  })
})
