import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { activitySummary, type ActivityGroup, type ActivityLine } from '../calc/activity'
import { factors } from '../data/factors'
import { category4Groups } from '../calc/scope3'
import { ActivityLinesSection } from './ActivityLinesSection'

const year2025 = { start: '2025-01-01', end: '2025-12-31' }
const noop = () => {}
const line: ActivityLine = { id: 'l1', group: category4Groups[0].id, date: '2025-03-01', quantity: 100 }

const render = (lines: ActivityLine[]) =>
  renderToStaticMarkup(
    <ActivityLinesSection
      title="Fragt"
      groups={category4Groups as readonly ActivityGroup[]}
      factors={factors}
      summary={activitySummary(lines, category4Groups, factors, year2025)}
      lines={lines}
      setLines={noop}
      defaultDate={year2025.start}
      emptyText="Ingen fragt i perioden."
    />,
  )

describe('The Tilføj linje form under activity lines', () => {
  it('sits under the lines, with a heading of its own that names the form', () => {
    const html = render([line])
    expect(html.indexOf('>Tilføj linje</h3>')).toBeGreaterThan(html.indexOf('</table>'))
    const heading = html.match(/<h3 id="([^"]*-heading)">Tilføj linje<\/h3>/)![1]
    expect(html).toContain(`aria-labelledby="${heading}"`)
  })

  it('is collapsed behind its toggle once there are lines', () => {
    const html = render([line])
    expect(html).toMatch(/<button type="button" class="link" aria-expanded="false" aria-controls="[^"]*-form">Vis formular/)
    expect(html).toMatch(/<form id="[^"]*-form" class="add-line" noValidate="" aria-labelledby="[^"]*" hidden="">/)
  })

  it('is open from the start when there are no lines yet', () => {
    const html = render([])
    expect(html).toMatch(/aria-controls="[^"]*-form">Skjul formular/)
    expect(html).not.toMatch(/<form id="[^"]*-form"[^>]*hidden/)
  })
})
