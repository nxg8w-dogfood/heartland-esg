import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Scope1Line } from '../calc/scope1'
import type { Vehicle } from '../calc/vehicles'
import { factors } from '../data/factors'
import { Scope1Page } from './Scope1Page'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const noop = () => {}
const car: Vehicle = { id: 'car-1', plate: 'AB12345', make: 'Peugeot', model: '208', fuel: 'benzin', kmPerLitre: 20, source: 'lookup' }

const render = (vehicles: Vehicle[], lines: Scope1Line[] = []) =>
  renderToStaticMarkup(<Scope1Page period={year2025} factors={factors} lines={lines} setLines={noop} vehicles={vehicles} />)

const sourceOptions = (html: string) => {
  const select = html.match(/<select id="[^"]*-group">(.*?)<\/select>/)![1]
  return [...select.matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map((m) => ({ value: m[1], selected: !!m[2], label: m[3] }))
}

describe('Adding a Scope 1 line for a company car', () => {
  it('starts with a car from Bilpark when the company has registered cars, and asks only for the car', () => {
    const html = render([car])
    const options = sourceOptions(html)
    expect(options[0]).toEqual({ value: 'car', selected: true, label: 'Firmabil fra Bilpark' })
    expect(html).toContain('<label for="' + html.match(/id="([^"]*-car)"/)![1] + '">Bil</label>')
    expect(html).toContain('<option value="car-1">AB 12 345 – Peugeot 208</option>')
  })

  it('keeps diesel and petrol without a particular car, and the other sources, as before', () => {
    const labels = sourceOptions(render([car])).map((o) => o.label)
    expect(labels).toEqual([
      'Firmabil fra Bilpark',
      'Firmabiler – diesel, uden bestemt bil',
      'Firmabiler – benzin, uden bestemt bil',
      'Opvarmning – naturgas',
      'Opvarmning – fyringsgasolie',
      'Kølemiddel HFC-134a',
      'Andet kølemiddel',
    ])
  })

  it('starts with diesel when no cars are registered', () => {
    const options = sourceOptions(render([]))
    expect(options.find((o) => o.selected)?.value).toBe('s1-diesel')
    expect(render([])).not.toContain('-car"')
  })

  it('lists a line under the fuel of its car', () => {
    const line: Scope1Line = { id: 'l1', group: 's1-diesel', date: '2025-03-01', quantity: 100, vehicleId: 'car-1' }
    const html = render([car], [line])
    expect(html).toContain('<td>Firmabiler – benzin</td>')
    expect(html).toContain('AB 12 345 – Peugeot 208')
  })
})

describe('The Tilføj linje form', () => {
  const line: Scope1Line = { id: 'l1', group: 's1-diesel', date: '2025-03-01', quantity: 100 }

  it('sits under the lines', () => {
    const html = render([car], [line])
    expect(html.indexOf('>Tilføj linje</h2>')).toBeGreaterThan(html.indexOf('</table>'))
  })

  it('is collapsed behind its toggle once there are lines', () => {
    const html = render([car], [line])
    expect(html).toMatch(/<button type="button" class="link" aria-expanded="false" aria-controls="[^"]*-form">Vis formular/)
    expect(html).toMatch(/<form id="[^"]*-form" class="add-line" noValidate="" hidden="">/)
  })

  it('is open from the start when there are no lines yet', () => {
    const html = render([car])
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Skjul formular')
    expect(html).not.toMatch(/<form[^>]*hidden/)
  })
})

describe('Scope 1 without lines', () => {
  it('offers no example lines', () => {
    expect(render([car])).not.toContain('Indsæt eksempellinjer')
  })
})
